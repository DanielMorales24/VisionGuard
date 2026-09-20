// app.js
// Punto de entrada del backend Node.js (MVC). Configura Express, EJS,
// Socket.IO, middlewares de seguridad, rutas, y arranca el servicio
// que escucha las detecciones del microservicio Python.

const express = require('express');
const path = require('path');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config');
const logger = require('./utils/logger');
const { initSocket } = require('./config/socket');
const { apiLimiter } = require('./middlewares/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

const dashboardRoutes = require('./routes/dashboardRoutes');
const apiRoutes = require('./routes/apiRoutes');
const authRoutes = require('./routes/authRoutes');
const { sessionMiddleware, loadUser } = require('./middlewares/session');

const detectionService = require('./services/detectionService');
const cameraService = require('./services/cameraService');

const app = express();
const server = http.createServer(app);

// --- Vistas (EJS) ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Middlewares de seguridad y parseo ---
app.use(
  helmet({
    contentSecurityPolicy: false, // deshabilitado para permitir Socket.IO/EJS inline sin fricción en desarrollo
  })
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(sessionMiddleware);
app.use(loadUser);

// --- Log de peticiones ---
app.use((req, res, next) => {
  logger.debug(`${req.method} ${req.originalUrl}`);
  next();
});

// --- Rutas ---
app.use('/', authRoutes);
app.use('/api', apiLimiter, apiRoutes);
app.use('/', dashboardRoutes);

// --- 404 y manejo de errores ---
app.use(notFoundHandler);
app.use(errorHandler);

// --- Socket.IO ---
initSocket(server, sessionMiddleware);

// --- Conexión al microservicio Python (WebSocket de detecciones) ---
detectionService.start();

server.listen(config.port, () => {
  logger.info(`VisionGuard Web escuchando en http://localhost:${config.port}`);
  logger.info(`Microservicio de visión esperado en: ${config.pythonServiceUrl}`);
});

process.on('SIGINT', () => {
  logger.info('Cerrando VisionGuard Web...');
  detectionService.stop();
  server.close(() => process.exit(0));
});

module.exports = app;
