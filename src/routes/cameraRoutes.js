// routes/cameraRoutes.js
// Rutas de cámaras: CRUD + proxy hacia el microservicio Python.
const express = require('express');
const router = express.Router();
const cameraController = require('../controllers/cameraController');
const { requireApiKey } = require('../middlewares/auth');

router.get('/cameras', cameraController.listCameras);
router.post('/cameras', requireApiKey, cameraController.addCamera);
router.delete('/cameras/:id', requireApiKey, cameraController.removeCamera);

router.post('/vision/start', requireApiKey, cameraController.startVision);
router.post('/vision/stop', requireApiKey, cameraController.stopVision);
router.get('/vision/status', cameraController.visionStatus);
router.get('/vision/snapshot/:id', cameraController.snapshot);
router.post('/vision/silence/:id', cameraController.silenceAlarm);

// Zona de vigilancia (ROI) por cámara.
router.post('/vision/roi/:id', requireApiKey, cameraController.setRoi);
router.delete('/vision/roi/:id', requireApiKey, cameraController.clearRoi);

// Armar/desarmar la alarma de una cámara sin detener la vigilancia.
router.post('/vision/arm/:id', requireApiKey, cameraController.setArmed);

module.exports = router;
