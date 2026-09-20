// config/index.js
// Configuración general de la aplicación, leída desde variables de entorno.

require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  sessionSecret: process.env.SESSION_SECRET || 'visionguard-secret',

  pythonServiceUrl: process.env.PYTHON_SERVICE_URL || 'http://localhost:8001',
  pythonWsUrl: process.env.PYTHON_WS_URL || 'ws://localhost:8001/ws/detections',

  defaultCamera: {
    id: process.env.CAMERA_ID || 'cam-01',
    url: process.env.CAMERA_URL || '',
  },

  alarm: {
    cooldownSeconds: parseInt(process.env.ALARM_COOLDOWN, 10) || 15,
    personThreshold: parseInt(process.env.PERSON_THRESHOLD, 10) || 1,
    ttsVoice: process.env.TTS_VOICE || 'local',
  },
};
