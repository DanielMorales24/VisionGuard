// controllers/cameraController.js
// Endpoints de la API REST relacionados con cámaras.

const cameraService = require('../services/cameraService');
const logger = require('../utils/logger');

async function listCameras(req, res, next) {
  try {
    res.json({ ok: true, cameras: cameraService.listCameras(req.user.id) });
  } catch (err) {
    next(err);
  }
}

async function addCamera(req, res, next) {
  try {
    const { id, name, url, location } = req.body;
    const camera = cameraService.addCamera({ id, name, url, location, ownerId: req.user.id });
    res.status(201).json({ ok: true, camera });
  } catch (err) {
    next(err);
  }
}

async function removeCamera(req, res, next) {
  try {
    const removed = cameraService.removeCamera(req.params.id, req.user.id);
    if (!removed) {
      return res.status(404).json({ ok: false, error: 'Cámara no encontrada' });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function startVision(req, res, next) {
  try {
    const { camera_id: cameraId } = req.body;
    const data = await cameraService.startVision(cameraId, req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    if (err.response) {
      logger.error(`Error del microservicio Python al iniciar: ${JSON.stringify(err.response.data)}`);
      return res.status(err.response.status).json({ ok: false, error: err.response.data });
    }
    next(err);
  }
}

async function stopVision(req, res, next) {
  try {
    const { camera_id: cameraId } = req.body;
    const data = await cameraService.stopVision(cameraId, req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json({ ok: false, error: err.response.data });
    }
    next(err);
  }
}

async function visionStatus(req, res, next) {
  try {
    const data = await cameraService.getVisionStatus();
    const allowedIds = new Set(cameraService.listCameras(req.user.id).map((camera) => camera.id));
    data.cameras = (data.cameras || []).filter((camera) => allowedIds.has(camera.camera_id));
    res.json({ ok: true, data });
  } catch (err) {
    // Si el microservicio Python no está corriendo, no queremos tumbar el dashboard.
    res.json({ ok: false, error: 'El microservicio de visión no está disponible', cameras: [] });
  }
}

async function snapshot(req, res, next) {
  try {
    const jpeg = await cameraService.getSnapshot(req.params.id, req.user.id);
    res.set('Content-Type', 'image/jpeg');
    res.send(jpeg);
  } catch (err) {
    const detail = err.response?.data?.detail || err.response?.data?.error;
    res.status(err.response?.status || 503).json({
      ok: false,
      error: detail || 'Snapshot no disponible aún',
    });
  }
}

async function silenceAlarm(req, res, next) {
  try {
    const data = await cameraService.silenceAlarm(req.params.id, req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
}

async function setRoi(req, res, next) {
  try {
    const { x, y, w, h, normalized, zoneName } = req.body;
    if ([x, y, w, h].some((v) => typeof v !== 'number')) {
      return res.status(400).json({ ok: false, error: 'x, y, w y h son requeridos (números)' });
    }
    const data = await cameraService.setRoi(req.params.id, { x, y, w, h, normalized, zoneName }, req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json({ ok: false, error: err.response.data });
    }
    next(err);
  }
}

async function clearRoi(req, res, next) {
  try {
    const data = await cameraService.clearRoi(req.params.id, req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json({ ok: false, error: err.response.data });
    }
    next(err);
  }
}

async function setArmed(req, res, next) {
  try {
    const { armed } = req.body;
    const data = await cameraService.setArmed(req.params.id, armed, req.user.id);
    res.json({ ok: true, data });
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json({ ok: false, error: err.response.data });
    }
    next(err);
  }
}

module.exports = {
  listCameras,
  addCamera,
  removeCamera,
  startVision,
  stopVision,
  visionStatus,
  snapshot,
  silenceAlarm,
  setRoi,
  clearRoi,
  setArmed,
};
