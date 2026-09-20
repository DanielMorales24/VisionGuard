// services/detectionService.js
// Se conecta al WebSocket del microservicio Python (/ws/detections),
// procesa cada mensaje de detección, decide cuándo se activa/limpia una
// alerta de intrusos, y reenvía todo a los clientes web vía Socket.IO.

const WebSocket = require('ws');
const config = require('../config');
const api = require('../config/api');
const logger = require('../utils/logger');
const { emit, EVENTS, userRoom } = require('../utils/socketEmitter');
const alertService = require('./alertService');
const cameraService = require('./cameraService');

// Estado por cámara: si ya hay una alerta activa (para saber cuándo emitir "cleared").
const activeAlerts = new Map(); // userId:cameraId -> { since, maxCount }

let ws = null;
let reconnectTimeout = null;

function connect() {
  logger.info(`Conectando al WebSocket de detecciones: ${api.PYTHON_WS_URL}`);
  ws = new WebSocket(api.PYTHON_WS_URL);

  ws.on('open', () => {
    logger.info('Conectado al microservicio Python (WebSocket de detecciones)');
  });

  ws.on('message', (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch (err) {
      logger.error(`Mensaje inválido del microservicio Python: ${err.message}`);
      return;
    }
    handleDetection(payload);
  });

  ws.on('close', () => {
    logger.warn('Conexión WebSocket con el microservicio Python cerrada. Reintentando en 5s...');
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    logger.error(`Error en WebSocket con el microservicio Python: ${err.message}`);
  });
}

function scheduleReconnect() {
  if (reconnectTimeout) return;
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connect();
  }, 5000);
}

function handleDetection(payload) {
  const { camera_id: cameraId, person_count: personCount, zone_count: zoneCount, armed } = payload;

  // Siempre reenviamos la actualización cruda para el video/overlay en vivo.
  const ownerId = cameraService.getOwnerId(cameraId);
  if (!ownerId) return;
  const room = userRoom(ownerId);
  emit(EVENTS.DETECTION_UPDATE, payload, room);

  // Si hay una zona de vigilancia configurada, el conteo relevante es el de
  // la zona (zone_count); si no, se usa el total del frame (person_count).
  // `armed` puede venir ausente en mensajes antiguos: por defecto, armado.
  const conteoRelevante = typeof zoneCount === 'number' ? zoneCount : personCount;
  const estaArmada = armed !== false;

  const threshold = config.alarm.personThreshold;
  const alertKey = `${ownerId}:${cameraId}`;
  const hayAlertaActiva = activeAlerts.has(alertKey);

  if (!estaArmada) {
    // Cámara desarmada: no se generan ni mantienen alertas, aunque haya
    // personas en la zona (la vigilancia/detección sigue corriendo).
    if (hayAlertaActiva) activeAlerts.delete(alertKey);
    return;
  }

  if (conteoRelevante >= threshold) {
    if (!hayAlertaActiva) {
      const camera = cameraService.getCamera(cameraId, ownerId);
      const alerta = {
        camera_id: cameraId,
        camera_name: camera?.name || cameraId,
        zone_name: payload.roi?.zone_name || 'Zona segura',
        person_count: conteoRelevante,
        started_at: payload.timestamp || new Date().toISOString(),
      };
      activeAlerts.set(alertKey, { since: Date.now(), maxCount: conteoRelevante, ...alerta });
      emit(EVENTS.INTRUDER_DETECTED, alerta, room);
      logger.warn(`Intruso(s) detectado(s) en ${cameraId}: ${conteoRelevante}`);
    } else {
      const estado = activeAlerts.get(alertKey);
      if (conteoRelevante > estado.maxCount) estado.maxCount = conteoRelevante;
    }
  } else if (hayAlertaActiva) {
    const estado = activeAlerts.get(alertKey);
    const durationSeconds = Math.round((Date.now() - estado.since) / 1000);
    activeAlerts.delete(alertKey);

    alertService.addAlert({
      userId: ownerId,
      camera_id: cameraId,
      camera_name: estado.camera_name,
      zone_name: estado.zone_name,
      person_count: estado.maxCount,
      duration_seconds: durationSeconds,
    });

    emit(EVENTS.INTRUDER_CLEARED, { camera_id: cameraId, duration_seconds: durationSeconds }, room);
    logger.info(`Zona despejada en ${cameraId} (duración de alerta: ${durationSeconds}s)`);
  }
}

function start() {
  connect();
}

function stop() {
  if (ws) ws.close();
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
}

module.exports = { start, stop };
