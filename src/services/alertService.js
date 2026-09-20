// services/alertService.js
// Guarda el historial de alertas de intrusos. Se mantiene en memoria y
// se persiste en un archivo JSON simple (data/alerts.json) para que
// sobreviva a reinicios del servidor.

const fs = require('fs');
const path = require('path');
const logger = require('./../utils/logger');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'alerts.json');

let alerts = [];

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
}

function load() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    alerts = JSON.parse(raw);
  } catch (err) {
    logger.error(`No se pudo leer el historial de alertas: ${err.message}`);
    alerts = [];
  }
}

function persist() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(alerts, null, 2), 'utf-8');
  } catch (err) {
    logger.error(`No se pudo guardar el historial de alertas: ${err.message}`);
  }
}

function addAlert({ userId, camera_id, camera_name, zone_name, person_count, duration_seconds }) {
  const alert = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    userId,
    camera_id,
    camera_name: camera_name || camera_id,
    zone_name: zone_name || 'Zona segura',
    message: `Se detectaron ${person_count} ${person_count === 1 ? 'persona' : 'personas'} invadiendo ${zone_name || 'Zona segura'} de ${camera_name || camera_id}`,
    person_count,
    duration_seconds,
    date: new Date().toISOString(),
  };
  alerts.unshift(alert);
  // Limita el historial a las últimas 500 alertas para no crecer indefinidamente.
  if (alerts.length > 500) alerts = alerts.slice(0, 500);
  persist();
  return alert;
}

function getAlerts({ limit, userId } = {}) {
  const ownedAlerts = userId ? alerts.filter((alert) => alert.userId === userId) : alerts;
  return typeof limit === 'number' ? ownedAlerts.slice(0, limit) : ownedAlerts;
}

function clearAlerts(userId) {
  alerts = userId ? alerts.filter((alert) => alert.userId !== userId) : [];
  persist();
}

function getStats(userId) {
  const ownedAlerts = userId ? alerts.filter((alert) => alert.userId === userId) : alerts;
  const totalAlerts = ownedAlerts.length;
  const totalIntrusos = ownedAlerts.reduce((acc, a) => acc + (a.person_count || 0), 0);
  const porCamara = ownedAlerts.reduce((acc, a) => {
    acc[a.camera_id] = (acc[a.camera_id] || 0) + 1;
    return acc;
  }, {});
  return {
    total_alerts: totalAlerts,
    total_intrusos_acumulados: totalIntrusos,
    alertas_por_camara: porCamara,
    ultima_alerta: ownedAlerts[0] || null,
  };
}

load();

module.exports = { addAlert, getAlerts, getStats, clearAlerts };
