// utils/socketEmitter.js
// Pequeño helper para emitir eventos de Socket.IO de forma consistente
// desde controllers/services sin tener que importar getIO() en cada uno.

const { getIO } = require('../config/socket');
const logger = require('./logger');

function emit(event, payload, room) {
  try {
    if (room) getIO().to(room).emit(event, payload);
    else getIO().emit(event, payload);
  } catch (err) {
    logger.error(`No se pudo emitir el evento "${event}": ${err.message}`);
  }
}

module.exports = {
  emit,
  userRoom: (userId) => `user:${userId}`,
  EVENTS: {
    INTRUDER_DETECTED: 'intruder:detected',
    INTRUDER_CLEARED: 'intruder:cleared',
    CAMERA_STATUS: 'camera:status',
    DETECTION_UPDATE: 'detection:update',
  },
};
