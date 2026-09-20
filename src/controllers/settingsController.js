// controllers/settingsController.js
// Permite consultar y actualizar los ajustes de detección/alarma en caliente
// (cooldown, umbral de personas, voz on/off, volumen). Se guardan en memoria
// sobre el objeto config; para persistencia real conviene escribir a .env o JSON.

const config = require('../config');
const fs = require('fs');
const path = require('path');

const settingsFile = path.join(__dirname, '../../data/settings.json');
const audioDirectory = path.join(__dirname, '../public/audio');
const defaults = {
  voiceEnabled: true,
  volume: 0.8,
  alarmSound: 'alarm.mp3',
};
const runtimeSettings = loadSettings();

function loadSettings() {
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) };
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`No se pudieron cargar los ajustes: ${err.message}`);
    return { ...defaults };
  }
}

function persistSettings() {
  fs.writeFileSync(settingsFile, `${JSON.stringify(runtimeSettings, null, 2)}\n`, 'utf8');
}

function listAlarmSounds() {
  try {
    return fs.readdirSync(audioDirectory)
      .filter((file) => file.toLowerCase().endsWith('.mp3'))
      .sort((a, b) => a.localeCompare(b, 'es'));
  } catch {
    return [];
  }
}

function getSettingsData() {
  const alarmSounds = listAlarmSounds();
  if (!alarmSounds.includes(runtimeSettings.alarmSound)) {
    runtimeSettings.alarmSound = alarmSounds[0] || defaults.alarmSound;
  }
  return {
    alarmCooldown: config.alarm.cooldownSeconds,
    personThreshold: config.alarm.personThreshold,
    ttsVoice: config.alarm.ttsVoice,
    voiceEnabled: runtimeSettings.voiceEnabled,
    volume: runtimeSettings.volume,
    alarmSound: runtimeSettings.alarmSound,
    alarmSounds,
  };
}

function getSettings(req, res) {
  res.json({ ok: true, settings: getSettingsData() });
}

function updateSettings(req, res) {
  const { alarmCooldown, personThreshold, voiceEnabled, volume, alarmSound } = req.body;

  if (typeof alarmCooldown === 'number' && alarmCooldown >= 0) {
    config.alarm.cooldownSeconds = alarmCooldown;
  }
  if (typeof personThreshold === 'number' && personThreshold >= 1) {
    config.alarm.personThreshold = personThreshold;
  }
  if (typeof voiceEnabled === 'boolean') {
    runtimeSettings.voiceEnabled = voiceEnabled;
  }
  if (typeof volume === 'number' && volume >= 0 && volume <= 1) {
    runtimeSettings.volume = volume;
  }
  if (typeof alarmSound === 'string' && listAlarmSounds().includes(alarmSound)) {
    runtimeSettings.alarmSound = alarmSound;
  }

  persistSettings();
  res.json({ ok: true, settings: getSettingsData() });
}

module.exports = { getSettings, updateSettings, getSettingsData };
