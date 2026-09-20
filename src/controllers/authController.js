const userService = require('../services/userService');

function renderLogin(req, res) {
  res.render('login', { title: 'Iniciar sesión - VisionGuard', mode: 'login', error: null, values: {} });
}

function renderRegister(req, res) {
  res.render('login', { title: 'Crear cuenta - VisionGuard', mode: 'register', error: null, values: {} });
}

async function login(req, res) {
  const { email, password } = req.body;
  const user = await userService.authenticate(email, password);
  if (!user) {
    return res.status(401).render('login', {
      title: 'Iniciar sesión - VisionGuard', mode: 'login',
      error: 'Correo o contraseña incorrectos.', values: { email },
    });
  }
  req.session.userId = user.id;
  return res.redirect('/');
}

async function register(req, res) {
  try {
    const user = await userService.register(req.body);
    req.session.userId = user.id;
    return res.redirect('/');
  } catch (err) {
    return res.status(err.status || 400).render('login', {
      title: 'Crear cuenta - VisionGuard', mode: 'register',
      error: err.message, values: { name: req.body.name, email: req.body.email },
    });
  }
}

function logout(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('connect.sid');
    return res.redirect('/login');
  });
}

module.exports = { renderLogin, renderRegister, login, register, logout };
