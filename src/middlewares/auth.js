// middlewares/auth.js
// Middleware de autenticación simple basado en una API key para las rutas
// de administración (agregar/eliminar cámaras, cambiar ajustes).
//
// Si no se define ADMIN_API_KEY en .env, la autenticación queda deshabilitada
// (útil para desarrollo local). En producción, define ADMIN_API_KEY.

const logger = require('../utils/logger');

function requireApiKey(req, res, next) {
  if (req.user) return next();
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey) {
    return next(); // sin key configurada -> no se exige autenticación
  }

  const providedKey = req.header('x-api-key');

  if (providedKey !== expectedKey) {
    logger.warn(`Intento de acceso no autorizado a ${req.originalUrl}`);
    return res.status(401).json({ ok: false, error: 'API key inválida o faltante' });
  }

  return next();
}

module.exports = { requireApiKey };
