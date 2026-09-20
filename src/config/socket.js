// config/socket.js
// Inicializa Socket.IO sobre el servidor HTTP y expone la instancia
// para que los servicios puedan emitir eventos (intruder:detected, etc).

const { Server } = require('socket.io');
const logger = require('../utils/logger');

let io = null;

function initSocket(httpServer, sessionMiddleware) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  io.engine.use(sessionMiddleware);

  io.on('connection', (socket) => {
    const request = socket.request;
    const userId = request.session?.userId;
    if (!userId) {
      socket.disconnect(true);
      return;
    }
    socket.join(`user:${userId}`);
    logger.info(`Cliente conectado al dashboard: ${socket.id}`);

    socket.on('disconnect', () => {
      logger.info(`Cliente desconectado del dashboard: ${socket.id}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.IO no ha sido inicializado. Llama a initSocket(httpServer) primero.');
  }
  return io;
}

module.exports = { initSocket, getIO };
