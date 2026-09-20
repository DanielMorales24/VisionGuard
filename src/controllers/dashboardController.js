// controllers/dashboardController.js
// Renderiza las páginas EJS del dashboard.

const cameraService = require('../services/cameraService');
const alertService = require('../services/alertService');
const settingsController = require('./settingsController');
const config = require('../config');

function renderDashboard(req, res) {
  res.render('dashboard', {
    title: 'Dashboard - VisionGuard',
    cameras: cameraService.listCameras(req.user.id),
    recentAlerts: alertService.getAlerts({ limit: 5, userId: req.user.id }),
    config,
  });
}

function renderCameras(req, res) {
  res.render('cameras', {
    title: 'Cámaras - VisionGuard',
    cameras: cameraService.listCameras(req.user.id),
  });
}

function renderAlerts(req, res) {
  res.render('alerts', {
    title: 'Historial de Alertas - VisionGuard',
    alerts: alertService.getAlerts({ userId: req.user.id }),
    stats: alertService.getStats(req.user.id),
  });
}

function renderSettings(req, res) {
  res.render('settings', {
    title: 'Ajustes - VisionGuard',
    config,
    settings: settingsController.getSettingsData(),
  });
}

module.exports = { renderDashboard, renderCameras, renderAlerts, renderSettings };
