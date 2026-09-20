// controllers/alertController.js
// Endpoints de la API REST relacionados con el historial de alertas y estadísticas.

const alertService = require('../services/alertService');

function getAlerts(req, res, next) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;
    res.json({ ok: true, alerts: alertService.getAlerts({ limit, userId: req.user.id }) });
  } catch (err) {
    next(err);
  }
}

function getStats(req, res, next) {
  try {
    res.json({ ok: true, stats: alertService.getStats(req.user.id) });
  } catch (err) {
    next(err);
  }
}

function clearAlerts(req, res, next) {
  try {
    alertService.clearAlerts(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { getAlerts, getStats, clearAlerts };
