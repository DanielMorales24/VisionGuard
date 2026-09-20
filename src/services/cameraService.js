// services/cameraService.js
// Se comunica con el microservicio Python (vision-service) vía HTTP,
// y mantiene en memoria la lista de cámaras configuradas en el sistema.

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const api = require('../config/api');
const logger = require('../utils/logger');

const camerasFile = path.join(__dirname, '../../data/cameras.json');
const cameras = new Map();

function saveCameras() {
  const temporaryFile = `${camerasFile}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(Array.from(cameras.values()), null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryFile, camerasFile);
}

function loadCameras() {
  try {
    const savedCameras = JSON.parse(fs.readFileSync(camerasFile, 'utf8'));
    if (!Array.isArray(savedCameras)) return;
    for (const camera of savedCameras) {
      if (camera && camera.id && camera.url) {
        cameras.set(camera.id, { ...camera, running: false });
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn(`No se pudieron cargar las cámaras guardadas: ${err.message}`);
    }
  }
}

loadCameras();

function listCameras(ownerId) {
  return Array.from(cameras.values()).filter((camera) => !ownerId || camera.ownerId === ownerId);
}

function getCamera(cameraId, ownerId) {
  const camera = cameras.get(cameraId);
  return camera && (!ownerId || camera.ownerId === ownerId) ? camera : undefined;
}

function addCamera({ id, name, url, location, ownerId }) {
  if (!id || !url) {
    const err = new Error('id y url son requeridos para agregar una cámara');
    err.status = 400;
    throw err;
  }
  if (!ownerId) {
    const err = new Error('El propietario de la cámara es requerido');
    err.status = 400;
    throw err;
  }
  if (cameras.has(id)) {
    const err = new Error('Ya existe una cámara con ese ID');
    err.status = 409;
    throw err;
  }
  const camera = {
    id,
    ownerId,
    name: name || id,
    url,
    location: location || '',
    running: false,
    createdAt: new Date().toISOString(),
  };
  cameras.set(id, camera);
  saveCameras();
  logger.info(`Cámara agregada: ${id} (${url})`);
  return camera;
}

function removeCamera(cameraId, ownerId) {
  const camera = getCamera(cameraId, ownerId);
  const removed = Boolean(camera) && cameras.delete(cameraId);
  if (removed) saveCameras();
  return removed;
}

async function startVision(cameraId, ownerId) {
  const camera = getCamera(cameraId, ownerId);
  if (!camera) {
    const err = new Error('Cámara no encontrada en el sistema');
    err.status = 404;
    throw err;
  }

  const { data } = await axios.post(api.endpoints.start, {
    camera_id: cameraId,
    source: camera.url,
  });

  camera.running = true;
  saveCameras();
  return data;
}

async function stopVision(cameraId, ownerId) {
  const camera = getCamera(cameraId, ownerId);
  if (!camera) {
    const err = new Error('Cámara no encontrada en el sistema');
    err.status = 404;
    throw err;
  }

  try {
    const { data } = await axios.post(api.endpoints.stop, null, {
      params: { camera_id: cameraId },
    });
    camera.running = false;
    saveCameras();
    return data;
  } catch (err) {
    if (err.response?.status === 404) {
      camera.running = false;
      saveCameras();
      return { ok: true, camera_id: cameraId, alreadyStopped: true };
    }
    throw err;
  }
}

async function getVisionStatus() {
  const { data } = await axios.get(api.endpoints.status, { timeout: 5000 });
  return data;
}

async function getSnapshot(cameraId, ownerId) {
  if (!getCamera(cameraId, ownerId)) {
    const err = new Error('Cámara no encontrada en tu cuenta');
    err.status = 404;
    throw err;
  }
  const response = await axios.get(api.endpoints.snapshot(cameraId), {
    responseType: 'arraybuffer',
    timeout: 5000,
  });
  return response.data;
}

async function silenceAlarm(cameraId, ownerId) {
  if (!getCamera(cameraId, ownerId)) {
    const err = new Error('Cámara no encontrada en tu cuenta');
    err.status = 404;
    throw err;
  }
  const { data } = await axios.post(api.endpoints.silence(cameraId));
  return data;
}

// Zona de vigilancia (ROI): rectángulo normalizado (0-1) sobre el frame
// que delimita el área donde debe estar una persona para disparar la alarma.
async function setRoi(cameraId, roi, ownerId) {
  if (!getCamera(cameraId, ownerId)) {
    const err = new Error('Cámara no encontrada en tu cuenta');
    err.status = 404;
    throw err;
  }
  const { data } = await axios.post(api.endpoints.roi(cameraId), {
    x: roi.x,
    y: roi.y,
    w: roi.w,
    h: roi.h,
    normalized: roi.normalized !== false,
    zone_name: roi.zoneName || 'Zona segura',
  });
  return data;
}

async function clearRoi(cameraId, ownerId) {
  if (!getCamera(cameraId, ownerId)) {
    const err = new Error('Cámara no encontrada en tu cuenta');
    err.status = 404;
    throw err;
  }
  const { data } = await axios.delete(api.endpoints.roi(cameraId));
  return data;
}

// Armado/desarmado: independiente de iniciar/detener la vigilancia. La
// cámara puede seguir transmitiendo y detectando sin que la alarma suene.
async function setArmed(cameraId, armed, ownerId) {
  if (!getCamera(cameraId, ownerId)) {
    const err = new Error('Cámara no encontrada en tu cuenta');
    err.status = 404;
    throw err;
  }
  const { data } = await axios.post(api.endpoints.arm(cameraId), { armed: Boolean(armed) });
  return data;
}

function claimLegacyCameras(ownerId) {
  let changed = false;
  for (const camera of cameras.values()) {
    if (!camera.ownerId) {
      camera.ownerId = ownerId;
      changed = true;
    }
  }
  if (changed) saveCameras();
}

function getOwnerId(cameraId) {
  return cameras.get(cameraId)?.ownerId;
}

module.exports = {
  listCameras,
  getCamera,
  addCamera,
  removeCamera,
  startVision,
  stopVision,
  getVisionStatus,
  getSnapshot,
  silenceAlarm,
  setRoi,
  clearRoi,
  setArmed,
  claimLegacyCameras,
  getOwnerId,
};
