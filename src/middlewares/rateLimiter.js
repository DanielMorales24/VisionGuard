// middlewares/rateLimiter.js
// Limita el número de peticiones a la API REST para evitar abuso.

const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 120,            // 120 operaciones de escritura por minuto por IP
  skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas peticiones, intenta de nuevo en un momento.' },
});

module.exports = { apiLimiter };
