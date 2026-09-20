"""
main.py
-------
Microservicio de visión (VisionGuard - vision-service).

Expone:
- POST /start             -> inicia la captura de una cámara (RTSP/HTTP/archivo local)
- POST /stop              -> detiene la captura de una cámara
- GET  /status            -> estadísticas de todas las cámaras activas
- GET  /snapshot/{camera_id} -> último frame procesado (JPEG) con detecciones dibujadas
- WS   /ws/detections       -> stream de detecciones en tiempo real (todas las cámaras)

Cada cámara corre en su propio hilo de captura para no bloquear el event loop.
"""

import asyncio
import json
import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional, Union

# TCP suele ser más estable que UDP para cámaras RTSP atravesando Internet.
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")
import cv2
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel

from detector import PersonDetector
from alarm import AlarmManager

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("visionguard.main")

ALARM_COOLDOWN = float(os.getenv("ALARM_COOLDOWN", "15"))
PERSON_THRESHOLD = int(os.getenv("PERSON_THRESHOLD", "1"))
TTS_VOICE = os.getenv("TTS_VOICE", "local")
# Milisegundos que una persona debe permanecer en la zona antes de disparar
# la alarma. Evita falsas alarmas por alguien que solo pasa por el cuadro.
DWELL_MS = int(os.getenv("DWELL_MS", "0"))
CAPTURE_OPEN_TIMEOUT_MS = int(os.getenv("CAPTURE_OPEN_TIMEOUT_MS", "10000"))
CAPTURE_READ_TIMEOUT_MS = int(os.getenv("CAPTURE_READ_TIMEOUT_MS", "10000"))

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def _roi_path(camera_id: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in camera_id)
    return DATA_DIR / f"roi-{safe}.json"


def load_roi(camera_id: str) -> Optional[dict]:
    path = _roi_path(camera_id)
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def save_roi(camera_id: str, roi: Optional[dict]) -> None:
    path = _roi_path(camera_id)
    if roi is None:
        path.unlink(missing_ok=True)
        return
    path.write_text(json.dumps(roi), encoding="utf-8")


def pixel_roi(roi: Optional[dict], width: int, height: int) -> Optional[dict]:
    """Convierte una zona normalizada (0-1) a coordenadas de píxeles del frame actual."""
    if not roi:
        return None
    if roi.get("normalized", True):
        return {
            "x": float(roi["x"]) * width,
            "y": float(roi["y"]) * height,
            "w": float(roi["w"]) * width,
            "h": float(roi["h"]) * height,
        }
    return {k: float(roi[k]) for k in ("x", "y", "w", "h")}


class StartCameraRequest(BaseModel):
    camera_id: str
    source: Union[str, int]  # URL RTSP/HTTP, int o str numérico para webcam local


class RoiRequest(BaseModel):
    x: float
    y: float
    w: float
    h: float
    normalized: bool = True
    zone_name: str = "Zona segura"


class ArmRequest(BaseModel):
    armed: bool = True


class CameraWorker:
    """Hilo de captura + detección para UNA cámara."""

    def __init__(self, camera_id: str, source: Union[str, int], on_detection):
        self.camera_id = camera_id
        self.source = source
        self.on_detection = on_detection
        self.detector = PersonDetector()
        self.alarm = AlarmManager(cooldown_seconds=ALARM_COOLDOWN, tts_voice=TTS_VOICE)

        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._cap: Optional[cv2.VideoCapture] = None
        self._last_frame_jpeg: Optional[bytes] = None
        self._last_person_count = 0
        self._last_zone_count = 0
        self._start_time = time.time()
        self._reintentos = 0
        self._capture_status = "starting"
        self._last_error: Optional[str] = None
        self._capture_backend: Optional[str] = None
        self._last_frame_at: Optional[str] = None

        # Zona de vigilancia (ROI), armado y tiempo de permanencia (dwell).
        # Armado por defecto para no romper el comportamiento previo
        # (alarma disparada solo por umbral de personas).
        self.roi: Optional[dict] = load_roi(camera_id)
        self.armed = True
        self._dwell_start: Optional[float] = None
        self.dwell_s = 0.0
        self._alerted_this_dwell = False

    def set_roi(self, roi: Optional[dict]) -> None:
        self.roi = roi
        save_roi(self.camera_id, roi)
        self._dwell_start = None
        self._alerted_this_dwell = False

    def set_armed(self, armed: bool) -> None:
        self.armed = armed
        self._dwell_start = None
        self._alerted_this_dwell = False

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join(timeout=3)
        if self._cap:
            self._cap.release()
        self.detector.close()

    def _abrir_captura(self):
        # Permite: URL RTSP/HTTP, índice numérico de webcam, o archivo local
        source = self.source
        if isinstance(source, str) and source.isdigit():
            source = int(source)

        if isinstance(source, int):
            cap = cv2.VideoCapture(source, cv2.CAP_DSHOW)
            if not cap.isOpened():
                cap = cv2.VideoCapture(source)
            return cap

        source_text = str(source)
        transports = ["tcp", "udp"] if source_text.lower().startswith(("rtsp://", "rtsps://")) else [None]
        for transport in transports:
            if transport:
                timeout_us = max(CAPTURE_OPEN_TIMEOUT_MS, CAPTURE_READ_TIMEOUT_MS) * 1000
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
                    f"rtsp_transport;{transport}|stimeout;{timeout_us}|rw_timeout;{timeout_us}"
                )
            cap = cv2.VideoCapture()
            cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, CAPTURE_OPEN_TIMEOUT_MS)
            cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, CAPTURE_READ_TIMEOUT_MS)
            if cap.open(source_text, cv2.CAP_FFMPEG):
                self._capture_backend = f"{cap.getBackendName()} ({transport or 'auto'})"
                return cap
            cap.release()
        return None

    def _loop(self):
        try:
            self._capture_status = "opening"
            self._cap = self._abrir_captura()
            while self._running:
                if not self._cap or not self._cap.isOpened():
                    self._capture_status = "error"
                    self._last_error = "No se pudo abrir la fuente RTSP/VideoCapture"
                    logger.warning("[%s] %s; reintentando en 5s...", self.camera_id, self._last_error)
                    self._reintentos += 1
                    self._capture_status = "retrying"
                    time.sleep(5)
                    self._cap = self._abrir_captura()
                    continue

                self._capture_status = "capturing"
                ok, frame = self._cap.read()
                if not ok:
                    self._capture_status = "error"
                    self._last_error = "La fuente se abrió, pero no entregó ningún frame"
                    logger.warning("[%s] %s; reintentando en 5s...", self.camera_id, self._last_error)
                    self._reintentos += 1
                    self._capture_status = "retrying"
                    self._cap.release()
                    time.sleep(5)
                    self._cap = self._abrir_captura()
                    continue

                h, w = frame.shape[:2]
                roi_px = pixel_roi(self.roi, w, h)
                resultado = self.detector.procesar_frame(frame, roi_px=roi_px)
                self._last_person_count = resultado.person_count
                self._last_zone_count = resultado.zone_count

                ok_jpeg, buffer = cv2.imencode(".jpg", resultado.frame)
                if ok_jpeg:
                    self._last_frame_jpeg = buffer.tobytes()
                    self._last_frame_at = datetime.now(timezone.utc).isoformat()
                    self._last_error = None

                conteo_relevante = resultado.zone_count if roi_px else resultado.person_count
                payload = {
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "camera_id": self.camera_id,
                    "person_count": resultado.person_count,
                    "zone_count": resultado.zone_count,
                    "boxes": resultado.boxes,
                    "poses": resultado.poses,
                    "fps": resultado.fps,
                    "armed": self.armed,
                    "roi": self.roi,
                    "dwell_s": round(self.dwell_s, 2),
                }
                self.on_detection(payload)

                now = time.perf_counter()
                if conteo_relevante >= PERSON_THRESHOLD:
                    if self._dwell_start is None:
                        self._dwell_start = now
                    self.dwell_s = now - self._dwell_start
                    listo_por_dwell = (self.dwell_s * 1000) >= DWELL_MS
                    if self.armed and listo_por_dwell and not self._alerted_this_dwell:
                        disparo = self.alarm.disparar(conteo_relevante)
                        if disparo:
                            self._alerted_this_dwell = True
                else:
                    self._dwell_start = None
                    self.dwell_s = 0.0
                    self._alerted_this_dwell = False

                time.sleep(0.03)  # ~30 fps máx, evita saturar CPU
        except Exception as err:
            self._capture_status = "error"
            self._last_error = f"Error procesando la cámara: {err}"
            logger.exception("[%s] El worker de cámara terminó inesperadamente", self.camera_id)

    def snapshot(self) -> Optional[bytes]:
        return self._last_frame_jpeg

    def status(self) -> dict:
        return {
            "camera_id": self.camera_id,
            "source": self.source,
            "running": self._running,
            "person_count": self._last_person_count,
            "zone_count": self._last_zone_count,
            "uptime_seconds": round(time.time() - self._start_time, 1),
            "reintentos": self._reintentos,
            "roi": self.roi,
            "armed": self.armed,
            "dwell_s": round(self.dwell_s, 2),
            "model": self.detector.model_info(),
            "capture_status": self._capture_status,
            "last_error": self._last_error,
            "capture_backend": self._capture_backend,
            "last_frame_at": self._last_frame_at,
        }


class VisionState:
    def __init__(self):
        self.cameras: Dict[str, CameraWorker] = {}
        self.ws_clients: list[WebSocket] = []
        self.loop: Optional[asyncio.AbstractEventLoop] = None

    def broadcast(self, payload: dict):
        """Llamado desde el hilo de captura (sync); reenvía al loop async."""
        if self.loop is None:
            return
        asyncio.run_coroutine_threadsafe(self._broadcast_async(payload), self.loop)

    async def _broadcast_async(self, payload: dict):
        muertos = []
        for ws in self.ws_clients:
            try:
                await ws.send_json(payload)
            except Exception:
                muertos.append(ws)
        for ws in muertos:
            if ws in self.ws_clients:
                self.ws_clients.remove(ws)


state = VisionState()


@asynccontextmanager
async def lifespan(app: FastAPI):
    state.loop = asyncio.get_running_loop()
    yield


app = FastAPI(title="VisionGuard - Vision Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/start")
def start_camera(req: StartCameraRequest):
    if req.camera_id in state.cameras:
        raise HTTPException(status_code=409, detail="La cámara ya está en ejecución")

    worker = CameraWorker(req.camera_id, req.source, on_detection=state.broadcast)
    worker.start()
    state.cameras[req.camera_id] = worker
    logger.info("Cámara iniciada: %s (%s)", req.camera_id, req.source)
    return {"ok": True, "camera_id": req.camera_id, "source": req.source}


@app.post("/stop")
def stop_camera(camera_id: str):
    worker = state.cameras.pop(camera_id, None)
    if not worker:
        raise HTTPException(status_code=404, detail="Cámara no encontrada o no está en ejecución")
    worker.stop()
    logger.info("Cámara detenida: %s", camera_id)
    return {"ok": True, "camera_id": camera_id}


@app.get("/status")
def status():
    return {
        "cameras": [w.status() for w in state.cameras.values()],
        "config": {
            "alarm_cooldown": ALARM_COOLDOWN,
            "person_threshold": PERSON_THRESHOLD,
            "tts_voice": TTS_VOICE,
            "dwell_ms": DWELL_MS,
        },
    }


@app.post("/roi/{camera_id}")
def set_roi(camera_id: str, req: RoiRequest):
    worker = state.cameras.get(camera_id)
    roi = req.model_dump()
    if worker:
        worker.set_roi(roi)
    else:
        # Permite guardar la zona aunque la cámara aún no esté corriendo;
        # se cargará automáticamente al iniciarla.
        save_roi(camera_id, roi)
    return {"ok": True, "camera_id": camera_id, "roi": roi}


@app.delete("/roi/{camera_id}")
def clear_roi(camera_id: str):
    worker = state.cameras.get(camera_id)
    if worker:
        worker.set_roi(None)
    else:
        save_roi(camera_id, None)
    return {"ok": True, "camera_id": camera_id, "roi": None}


@app.post("/arm/{camera_id}")
def set_armed(camera_id: str, req: ArmRequest):
    worker = state.cameras.get(camera_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Cámara no encontrada o no está en ejecución")
    worker.set_armed(req.armed)
    return {"ok": True, "camera_id": camera_id, "armed": worker.armed}


@app.get("/snapshot/{camera_id}")
def snapshot(camera_id: str):
    worker = state.cameras.get(camera_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Cámara no encontrada")
    jpeg = worker.snapshot()
    if jpeg is None:
        raise HTTPException(status_code=503, detail="Aún no hay frames disponibles")
    return Response(content=jpeg, media_type="image/jpeg")


@app.post("/silence/{camera_id}")
def silence(camera_id: str):
    worker = state.cameras.get(camera_id)
    if not worker:
        raise HTTPException(status_code=404, detail="Cámara no encontrada")
    worker.alarm.silenciar()
    return {"ok": True}


@app.websocket("/ws/detections")
async def ws_detections(websocket: WebSocket):
    await websocket.accept()
    state.ws_clients.append(websocket)
    logger.info("Cliente WebSocket conectado (%d activos)", len(state.ws_clients))
    try:
        while True:
            # Mantenemos la conexión viva; no esperamos mensajes del cliente.
            await websocket.receive_text()
    except WebSocketDisconnect:
        if websocket in state.ws_clients:
            state.ws_clients.remove(websocket)
        logger.info("Cliente WebSocket desconectado (%d activos)", len(state.ws_clients))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("VISION_PORT", "8001")), reload=False)