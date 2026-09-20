const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');
const cameraService = require('./cameraService');

const dataDirectory = path.join(__dirname, '../../data');
const usersFile = path.join(dataDirectory, 'users.json');

let users = [];

function ensureFile() {
  if (!fs.existsSync(dataDirectory)) fs.mkdirSync(dataDirectory, { recursive: true });
  if (!fs.existsSync(usersFile)) fs.writeFileSync(usersFile, '[]\n', 'utf8');
}

function load() {
  ensureFile();
  try {
    users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
    if (!Array.isArray(users)) users = [];
  } catch (err) {
    logger.error(`No se pudieron cargar los usuarios: ${err.message}`);
    users = [];
  }
}

function persist() {
  const temporaryFile = `${usersFile}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(users, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryFile, usersFile);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, accountType: user.accountType };
}

async function register({ name, email, password, accountType }) {
  const normalizedEmail = normalizeEmail(email);
  if (!name || !normalizedEmail || !password || password.length < 8) {
    const error = new Error('Nombre, correo y una contraseña de al menos 8 caracteres son requeridos');
    error.status = 400;
    throw error;
  }
  if (users.some((user) => user.email === normalizedEmail)) {
    const error = new Error('Ya existe una cuenta con ese correo');
    error.status = 409;
    throw error;
  }
  const user = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(password, 12),
    accountType: accountType === 'empresa' ? 'empresa' : 'persona',
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  persist();
  cameraService.claimLegacyCameras(user.id);
  return publicUser(user);
}

async function authenticate(email, password) {
  const user = users.find((candidate) => candidate.email === normalizeEmail(email));
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) return null;
  return publicUser(user);
}

function getById(id) {
  return publicUser(users.find((user) => user.id === id));
}

load();

module.exports = { register, authenticate, getById, publicUser };
