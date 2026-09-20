# VisionGuard Web 🛡️

Sistema de vigilancia inteligente: detecta personas en video (RTSP/HTTP/webcam
o archivo local) usando YOLOv8 + MediaPipe, cuenta intrusos, dispara una
alarma sonora con voz en español, y lo muestra todo en un dashboard web en
tiempo real (Express + EJS + Socket.IO).

## Arquitectura

```
Cámara (RTSP/HTTP) → vision-service (Python, FastAPI + YOLO + MediaPipe)
                              │  WebSocket (detecciones)
                              ▼
                    Backend Node.js (Express, MVC, Socket.IO)
                              │  Socket.IO
                              ▼
                    Dashboard Web (EJS + JS vanilla)
```

## Instalación

### 1. Backend Node.js

```bash
npm install
cp .env.example .env
# edita .env con tus valores (URL de cámara, umbral, etc.)
```

Al abrir VisionGuard por primera vez, crea una cuenta local. Cada cuenta tiene
sus propias cámaras, zonas y alertas; en esta fase los datos se guardan en
`data/users.json`, `data/cameras.json` y `data/alerts.json`.
Las sesiones locales se conservan en `data/sessions` durante los reinicios del
backend. Nodemon sólo observa el código en `src`, por lo que guardar una alerta
no reinicia la aplicación ni desconecta el monitoreo.

### 2. Microservicio Python (vision-service)

```bash
cd vision-service
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..
```

## Levantar ambos servicios a la vez

```bash
npm run dev
```

Esto usa `concurrently` para lanzar:
- El backend Node.js (`npm run dev:node`, con nodemon) en `http://localhost:3000`
- El microservicio Python (`npm run dev:python`) en `http://localhost:8001`

También puedes levantarlos por separado:

```bash
npm run dev:node
npm run dev:python
```

## Uso

1. Abre `http://localhost:3000`.
2. Crea una cuenta o inicia sesión. Ve a **Mis cámaras** y agrega una cámara con su ID, nombre y URL (RTSP, HTTP, o
   ruta a un video local de prueba).
   Para una cámara RTSP también puedes abrir **Construir URL RTSP por campos**
   y completar protocolo, host/IP, puerto, usuario, contraseña, ruta y
   parámetros. Por ejemplo, los datos de `ipvmdemo.dyndns.org` producen una
   URL como `rtsp://demo:demo@ipvmdemo.dyndns.org:5541/onvif-media/media.amp?profile=profile_1_h264&sessiontimeout=60&streamtype=unicast`.
3. Vuelve a **Inicio**, selecciona la cámara y pulsa **Iniciar vigilancia**.
4. Cuando el sistema detecta personas por encima del umbral configurado, se
   dispara la alarma: sonido `alarm.mp3`, voz en español vía Web Speech API,
   y un modal rojo con el conteo. El botón **Silenciar** detiene el audio.
   Desde **Ajustes de VisionGuard** puedes elegir cualquier `.mp3` que exista
   en `src/public/audio`, cambiar volumen y activar o desactivar la voz.

## Probar sin cámara real

Coloca un archivo `.mp4` en `vision-service/videos/` y regístralo como cámara
usando esa ruta como URL, por ejemplo `./videos/prueba.mp4`. También puedes
usar tu webcam local con el valor `0`.

## Configurar una cámara real (ejemplos de URLs RTSP)

- Hikvision: `rtsp://usuario:clave@IP:554/Streaming/Channels/101`
- Dahua: `rtsp://usuario:clave@IP:554/cam/realmonitor?channel=1&subtype=0`
- TP-Link Tapo: `rtsp://usuario:clave@IP:554/stream1`

## Variables de entorno (`.env`)

| Variable | Descripción |
|---|---|
| `PORT` | Puerto del backend Node.js |
| `PYTHON_SERVICE_URL` | URL base del microservicio Python |
| `PYTHON_WS_URL` | URL del WebSocket de detecciones |
| `CAMERA_URL` | Cámara por defecto (opcional, también se puede agregar desde el dashboard) |
| `ALARM_COOLDOWN` | Segundos mínimos entre disparos de alarma |
| `PERSON_THRESHOLD` | Número mínimo de personas para considerar intrusión |
| `TTS_VOICE` | `local` (pyttsx3, offline) o `gtts` (requiere internet) |
| `ADMIN_API_KEY` | (opcional) protege las rutas de administración con header `x-api-key` |

## API REST (backend Node.js)

- `GET /api/cameras` — lista de cámaras
- `POST /api/cameras` — agregar cámara `{id, name, url, location}`
- `DELETE /api/cameras/:id` — eliminar cámara
- `POST /api/vision/start` `{camera_id}` — inicia detección (proxy a Python)
- `POST /api/vision/stop` `{camera_id}` — detiene detección
- `GET /api/vision/status` — estado del microservicio de visión
- `GET /api/vision/snapshot/:id` — último frame JPEG con detecciones
- `POST /api/vision/silence/:id` — silencia la alarma local del microservicio
- `GET /api/alerts` — historial de alertas
- `GET /api/stats` — estadísticas generales
- `GET/PUT /api/settings` — leer/actualizar ajustes (cooldown, umbral, voz, volumen)

## Notas

- El diseño es minimalista a propósito: prioriza que todo funcione y sea claro.
- Todo el código de backend (Node) tiene comentarios en español.
- Logs en `logs/combined.log` y `logs/error.log` (Winston).
- El historial de alertas se persiste en `data/alerts.json`.
