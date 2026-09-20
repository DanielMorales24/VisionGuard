// middlewares/errorHandler.js
// Manejo centralizado de errores: registra en logs y responde según
// si la petición espera JSON (API) o HTML (dashboard).

const logger = require('../utils/logger');

function notFoundHandler(req, res, next) {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({ ok: false, error: 'Recurso no encontrado' });
  }
  return res.status(404).render('errors/404', { url: req.originalUrl });
}

function errorHandler(err, req, res, next) {
  logger.error(`${req.method} ${req.originalUrl} -> ${err.message}\n${err.stack}`);

  const status = err.status || 500;

  if (req.originalUrl.startsWith('/api')) {
    return res.status(status).json({
      ok: false,
      error: err.message || 'Error interno del servidor',
    });
  }

  return res.status(status).render('errors/500', {
    message: err.message || 'Error interno del servidor',
  });
}

module.exports = { notFoundHandler, errorHandler };
