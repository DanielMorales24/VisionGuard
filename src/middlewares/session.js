const session = require('express-session');
const FileStore = require('session-file-store')(session);
const path = require('path');
const userService = require('../services/userService');

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'visionguard-local-session-change-me',
  resave: false,
  saveUninitialized: false,
  store: new FileStore({
    path: path.join(__dirname, '../../data/sessions'),
    retries: 1,
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
});

function loadUser(req, res, next) {
  req.user = req.session.userId ? userService.getById(req.session.userId) : null;
  res.locals.user = req.user;
  next();
}

function requireUser(req, res, next) {
  if (req.user) return next();
  if (req.accepts('html')) return res.redirect('/login');
  return res.status(401).json({ ok: false, error: 'Debes iniciar sesión' });
}

module.exports = { sessionMiddleware, loadUser, requireUser };
