// routes/apiRoutes.js
// Punto de entrada que agrupa todas las rutas de la API REST bajo /api.
const express = require('express');
const router = express.Router();

const cameraRoutes = require('./cameraRoutes');
const settingsRoutes = require('./settingsRoutes');
const alertController = require('../controllers/alertController');
const { requireUser } = require('../middlewares/session');

router.use(requireUser);

router.use('/', cameraRoutes);
router.use('/settings', settingsRoutes);

router.get('/alerts', alertController.getAlerts);
router.delete('/alerts', alertController.clearAlerts);
router.get('/stats', alertController.getStats);

module.exports = router;
