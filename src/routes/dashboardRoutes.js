// routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { requireUser } = require('../middlewares/session');

router.use(requireUser);
router.get('/', dashboardController.renderDashboard);
router.get('/cameras', dashboardController.renderCameras);
router.get('/alerts', dashboardController.renderAlerts);
router.get('/settings', dashboardController.renderSettings);

module.exports = router;
