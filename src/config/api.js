// config/api.js
// URLs y helpers relacionados con la API del microservicio Python.

const config = require('./index');

module.exports = {
  PYTHON_BASE_URL: config.pythonServiceUrl,
  PYTHON_WS_URL: config.pythonWsUrl,

  endpoints: {
    start: `${config.pythonServiceUrl}/start`,
    stop: `${config.pythonServiceUrl}/stop`,
    status: `${config.pythonServiceUrl}/status`,
    snapshot: (cameraId) => `${config.pythonServiceUrl}/snapshot/${encodeURIComponent(cameraId)}`,
    silence: (cameraId) => `${config.pythonServiceUrl}/silence/${encodeURIComponent(cameraId)}`,
    roi: (cameraId) => `${config.pythonServiceUrl}/roi/${encodeURIComponent(cameraId)}`,
    arm: (cameraId) => `${config.pythonServiceUrl}/arm/${encodeURIComponent(cameraId)}`,
  },
};
