"""
detector.py
-----------
Encapsula la lógica de visión por computadora:
- Detección de personas con YOLOv8 (ultralytics).
- Estimación de pose con MediaPipe (ángulos de articulaciones).
- Dibuja las detecciones (cajas + esqueleto) sobre el frame para el snapshot.

Diseñado para poder cambiar de cámara (RTSP/HTTP/archivo local) sin
modificar el resto del sistema.
"""

import time
import math
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger("visionguard.detector")

try:
    from ultralytics import YOLO
except ImportError:  # permite correr el proyecto sin el modelo instalado aún
    YOLO = None

try:
    import mediapipe as mp
except ImportError:
    mp = None


@dataclass
class DetectionResult:
    """Resultado de procesar un frame."""
    person_count: int
    boxes: list = field(default_factory=list)   # [{x1,y1,x2,y2,conf,in_zone}]
    poses: list = field(default_factory=list)   # [{landmarks:[...], angles:{...}}]
    fps: float = 0.0
    frame: Optional[np.ndarray] = None          # frame con dibujos (para snapshot)
    zone_count: int = 0                         # personas cuyo centro cae dentro de la zona (ROI)


def punto_en_zona(box: dict, roi_px: Optional[dict]) -> bool:
    """
    Indica si el centro de una caja de detección cae dentro de la zona (ROI)
    en píxeles: {x, y, w, h}. Si no hay zona configurada, no hay filtro
    (se considera que toda la cámara es la zona vigilada).
    """
    if not roi_px:
        return True
    cx = (box["x1"] + box["x2"]) / 2
    cy = (box["y1"] + box["y2"]) / 2
    return (
        roi_px["x"] <= cx <= roi_px["x"] + roi_px["w"]
        and roi_px["y"] <= cy <= roi_px["y"] + roi_px["h"]
    )


def _calcular_angulo(a, b, c):
    """Calcula el ángulo (en grados) formado por tres puntos 2D: a-b-c, con b como vértice."""
    a, b, c = np.array(a), np.array(b), np.array(c)
    ba = a - b
    bc = c - b
    denom = (np.linalg.norm(ba) * np.linalg.norm(bc))
    if denom == 0:
        return 0.0
    coseno = np.dot(ba, bc) / denom
    coseno = np.clip(coseno, -1.0, 1.0)
    return float(np.degrees(np.arccos(coseno)))


class PersonDetector:
    """
    Detector de personas (YOLOv8n) + estimador de pose (MediaPipe Pose).
    Mantiene su propio estado de captura por cámara.
    """

    def __init__(self, model_path: str = "yolov8n.pt", conf_threshold: float = 0.45):
        self.conf_threshold = conf_threshold
        self.model = None
        self.pose_estimator = None
        self.pose_api = None
        self.pose_connections = []
        self.pose_frame_interval = 3
        self.pose_frame_number = 0
        self.last_pose_landmarks = None
        self._last_frame_time = time.time()

        if YOLO is not None:
            logger.info("Cargando modelo YOLO: %s", model_path)
            self.model = YOLO(model_path)
        else:
            logger.warning("ultralytics no está instalado; la detección de personas estará deshabilitada.")

        if mp is not None:
            try:
                if hasattr(mp, "solutions"):
                    self.mp_pose = mp.solutions.pose
                    self.mp_drawing = mp.solutions.drawing_utils
                    self.pose_estimator = self.mp_pose.Pose(
                        min_detection_confidence=0.5,
                        min_tracking_confidence=0.5,
                    )
                    self.pose_api = "solutions"
                else:
                    from mediapipe.tasks.python import BaseOptions
                    from mediapipe.tasks.python import vision

                    pose_model_path = Path(__file__).with_name("pose_landmarker_lite.task")
                    if not pose_model_path.exists():
                        raise FileNotFoundError(pose_model_path)
                    options = vision.PoseLandmarkerOptions(
                        base_options=BaseOptions(model_asset_path=str(pose_model_path)),
                        running_mode=vision.RunningMode.IMAGE,
                        num_poses=1,
                        min_pose_detection_confidence=0.5,
                        min_pose_presence_confidence=0.5,
                        min_tracking_confidence=0.5,
                    )
                    self.pose_estimator = vision.PoseLandmarker.create_from_options(options)
                    self.pose_connections = vision.PoseLandmarksConnections.POSE_LANDMARKS
                    self.pose_api = "tasks"
            except (AttributeError, FileNotFoundError, RuntimeError) as err:
                logger.warning("MediaPipe no pudo inicializarse: %s. Estimación de pose deshabilitada.", err)
                self.pose_estimator = None
        else:
            logger.warning("mediapipe no está instalado; los ángulos de pose estarán deshabilitados.")

    def procesar_frame(self, frame: np.ndarray, roi_px: Optional[dict] = None) -> DetectionResult:
        """
        Procesa un frame BGR (OpenCV) y devuelve conteo de personas, cajas, poses y fps.

        Si se pasa `roi_px` (zona de vigilancia en píxeles: {x,y,w,h}), cada caja
        se marca con `in_zone` según si su centro cae dentro de la zona, y se
        calcula `zone_count` por separado del conteo total del frame.
        """
        now = time.time()
        delta = now - self._last_frame_time
        fps = 1.0 / delta if delta > 0 else 0.0
        self._last_frame_time = now

        boxes = []
        poses = []
        dibujado = frame.copy()

        # --- Detección de personas con YOLO ---
        if self.model is not None:
            results = self.model.predict(frame, classes=[0], conf=self.conf_threshold, verbose=False)
            for r in results:
                for box in r.boxes:
                    x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
                    conf = float(box.conf[0])
                    caja = {"x1": x1, "y1": y1, "x2": x2, "y2": y2, "conf": round(conf, 3)}
                    caja["in_zone"] = punto_en_zona(caja, roi_px)
                    boxes.append(caja)
                    # Personas dentro de la zona vigilada se resaltan en naranja;
                    # el resto (fuera de zona, o sin zona configurada) en rojo.
                    color = (0, 140, 255) if (roi_px and caja["in_zone"]) else (0, 0, 255)
                    cv2.rectangle(dibujado, (int(x1), int(y1)), (int(x2), int(y2)), color, 2)
                    cv2.putText(
                        dibujado, f"persona {conf:.2f}", (int(x1), max(0, int(y1) - 8)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2,
                    )

        zone_count = sum(1 for b in boxes if b["in_zone"]) if roi_px else len(boxes)

        # --- Dibuja el rectángulo de la zona vigilada, si hay una configurada ---
        if roi_px:
            zx, zy, zw, zh = (int(roi_px["x"]), int(roi_px["y"]), int(roi_px["w"]), int(roi_px["h"]))
            zona_color = (0, 140, 255) if zone_count > 0 else (255, 180, 0)
            cv2.rectangle(dibujado, (zx, zy), (zx + zw, zy + zh), zona_color, 2)
            cv2.putText(
                dibujado, "Zona vigilada", (zx + 4, max(20, zy - 8)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, zona_color, 2,
            )

        # Pose se actualiza cada pocos frames para conservar FPS sin perder el esqueleto.
        if self.pose_estimator is not None and boxes:
            if self.pose_frame_number % self.pose_frame_interval == 0:
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                if self.pose_api == "solutions":
                    resultado_pose = self.pose_estimator.process(rgb)
                    self.last_pose_landmarks = (
                        resultado_pose.pose_landmarks.landmark
                        if resultado_pose.pose_landmarks else None
                    )
                else:
                    imagen = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                    resultado_pose = self.pose_estimator.detect(imagen)
                    self.last_pose_landmarks = (
                        resultado_pose.pose_landmarks[0]
                        if resultado_pose.pose_landmarks else None
                    )
            self.pose_frame_number += 1

            if self.last_pose_landmarks:
                lm = self.last_pose_landmarks
                h, w = frame.shape[:2]
                if self.pose_api == "solutions":
                    self.mp_drawing.draw_landmarks(
                        dibujado, type("Pose", (), {"landmark": lm})(), self.mp_pose.POSE_CONNECTIONS
                    )
                    landmark_enum = self.mp_pose.PoseLandmark
                else:
                    for connection in self.pose_connections:
                        inicio = lm[connection.start]
                        fin = lm[connection.end]
                        cv2.line(
                            dibujado,
                            (int(inicio.x * w), int(inicio.y * h)),
                            (int(fin.x * w), int(fin.y * h)),
                            (0, 255, 0), 2,
                        )
                    for punto in lm:
                        cv2.circle(dibujado, (int(punto.x * w), int(punto.y * h)), 3, (0, 255, 0), -1)
                    landmark_enum = None

                def punto(idx):
                    indice = idx.value if hasattr(idx, "value") else idx
                    return (lm[indice].x * w, lm[indice].y * h)

                try:
                    indices = landmark_enum or type(
                        "Landmarks", (), {
                            "LEFT_SHOULDER": 11, "LEFT_ELBOW": 13, "LEFT_WRIST": 15,
                            "RIGHT_SHOULDER": 12, "RIGHT_ELBOW": 14, "RIGHT_WRIST": 16,
                            "LEFT_HIP": 23, "LEFT_KNEE": 25, "LEFT_ANKLE": 27,
                            "RIGHT_HIP": 24, "RIGHT_KNEE": 26, "RIGHT_ANKLE": 28,
                        },
                    )
                    angulos = {
                        "brazo_izq": _calcular_angulo(punto(indices.LEFT_SHOULDER), punto(indices.LEFT_ELBOW), punto(indices.LEFT_WRIST)),
                        "brazo_der": _calcular_angulo(punto(indices.RIGHT_SHOULDER), punto(indices.RIGHT_ELBOW), punto(indices.RIGHT_WRIST)),
                        "pierna_izq": _calcular_angulo(punto(indices.LEFT_HIP), punto(indices.LEFT_KNEE), punto(indices.LEFT_ANKLE)),
                        "pierna_der": _calcular_angulo(punto(indices.RIGHT_HIP), punto(indices.RIGHT_KNEE), punto(indices.RIGHT_ANKLE)),
                    }
                except (IndexError, KeyError):
                    angulos = {}

                poses.append({
                    "landmarks": [
                        {"x": p.x, "y": p.y, "z": p.z, "visibility": p.visibility}
                        for p in lm
                    ],
                    "angles": angulos,
                })

        # Overlay de conteo
        texto_conteo = f"Personas: {len(boxes)}"
        if roi_px:
            texto_conteo += f" | En zona: {zone_count}"
        cv2.putText(
            dibujado, texto_conteo, (15, 30),
            cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2,
        )

        return DetectionResult(
            person_count=len(boxes),
            boxes=boxes,
            poses=poses,
            fps=round(fps, 1),
            frame=dibujado,
            zone_count=zone_count,
        )

    def close(self):
        if self.pose_estimator is not None:
            self.pose_estimator.close()

    def model_info(self) -> str:
        """Descripción legible de qué modelos están activos (para mostrar en el dashboard)."""
        partes = []
        partes.append("YOLOv8n" if self.model is not None else "YOLO no disponible")
        if self.pose_estimator is not None:
            partes.append("MediaPipe Pose (Tasks)" if self.pose_api == "tasks" else "MediaPipe Pose")
        else:
            partes.append("sin estimación de pose")
        return " + ".join(partes)