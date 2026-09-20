# VisionGuard - Vision Service (Python)

Microservicio de visión por computadora: detecta personas con YOLOv8, estima
pose con MediaPipe, y expone todo vía HTTP + WebSocket para que el backend
Node.js lo consuma.

## Instalación

```bash
cd vision-service
python -m venv venv
source venv/bin/activate   # en Windows: venv\Scripts\activate
pip install -r requirements.txt
```

El servicio usa `yolov8n.pt` para detectar personas y
`pose_landmarker_lite.task` para estimar pose. Ambos modelos deben estar en
esta carpeta; Ultralytics puede descargar automáticamente `yolov8n.pt` la
primera vez que corra.

En Python 3.14 se usa la API moderna MediaPipe Tasks. La pose se calcula cada
3 frames y se reutiliza el último resultado en los frames intermedios para
mantener el rendimiento del análisis de YOLO.

## Ejecutar

```bash
python main.py
# o
uvicorn main:app --reload --port 8001
```

## Endpoints

- `POST /start` `{ "camera_id": "cam-01", "source": "rtsp://..." }`
- `POST /stop?camera_id=cam-01`
- `GET /status`
- `GET /snapshot/{camera_id}` → JPEG
- `POST /silence/{camera_id}` → detiene la alarma local
- `WS /ws/detections` → stream de detecciones de todas las cámaras

## Probar sin cámara real

Usa un archivo de video local como `source`:

```json
{ "camera_id": "cam-test", "source": "./videos/prueba.mp4" }
```

O tu webcam local con `"source": "0"`.

## URLs RTSP típicas (referencia)

- Hikvision: `rtsp://usuario:clave@IP:554/Streaming/Channels/101`
- Dahua: `rtsp://usuario:clave@IP:554/cam/realmonitor?channel=1&subtype=0`
- TP-Link Tapo: `rtsp://usuario:clave@IP:554/stream1`
