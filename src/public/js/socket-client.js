// socket-client.js
// Conecta al servidor vía Socket.IO, escucha los eventos de intrusos
// y controla la alarma sonora + voz + modal rojo en el navegador.

(function () {
  const socket = io();

  const connDot = document.getElementById('connection-indicator');
  const connText = document.getElementById('connection-text');
  const zoneStatus = document.getElementById('zone-status');
  const modal = document.getElementById('alert-modal');
  const modalText = document.getElementById('alert-modal-text');
  const silenceBtn = document.getElementById('alert-silence-btn');
  const alarmAudio = document.getElementById('alarm-audio');
  const intruderCountEl = document.getElementById('intruder-count');

  let alarmSilenced = false;

  async function syncAlarmSettings() {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      const settings = data && data.settings;
      if (!settings) return;
      if (alarmAudio && settings.alarmSound) {
        alarmAudio.src = `/audio/${encodeURIComponent(settings.alarmSound)}`;
        alarmAudio.volume = Number(settings.volume ?? 0.8);
      }
      window.VisionGuardSettings = settings;
    } catch {
      // Se conserva el tono predeterminado si los ajustes no están disponibles.
    }
  }

  syncAlarmSettings();

  function setConnectionStatus(ok) {
    if (!connDot || !connText) return;
    connDot.className = 'status-dot ' + (ok ? 'status-ok' : 'status-error');
    connText.textContent = ok ? 'Conectado' : 'Desconectado';
    const tmConn = document.getElementById('tm-conn');
    if (tmConn) tmConn.textContent = ok ? 'Conectado (Socket.IO)' : 'Desconectado';
  }

  socket.on('connect', () => setConnectionStatus(true));
  socket.on('disconnect', () => setConnectionStatus(false));

  function hablar(texto) {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = 'es-ES';
    utterance.rate = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function mostrarAlerta(personCount) {
    const settings = window.VisionGuardSettings || {};
    alarmSilenced = false;
    if (zoneStatus) {
      zoneStatus.textContent = 'ALERTA';
      zoneStatus.className = 'zone-status zone-alert';
    }
    if (modal) {
      modal.classList.remove('hidden');
      modalText.textContent = `${personCount} intruso(s) detectado(s)`;
    }
    if (alarmAudio) {
      alarmAudio.currentTime = 0;
      alarmAudio.play().catch(() => {
        // El navegador puede bloquear autoplay hasta la primera interacción del usuario.
      });
    }
    const texto = personCount === 1
      ? '1 intruso detectado, por favor retirarse antes de contactar con las autoridades.'
      : `${personCount} intrusos detectados, por favor retirarse antes de contactar con las autoridades.`;
    if (settings.voiceEnabled !== false) hablar(texto);
  }

  function ocultarAlerta() {
    if (zoneStatus) {
      zoneStatus.textContent = 'Zona Segura';
      zoneStatus.className = 'zone-status zone-safe';
    }
    if (modal) modal.classList.add('hidden');
    if (alarmAudio) alarmAudio.pause();
    window.speechSynthesis && window.speechSynthesis.cancel();
  }

  socket.on('intruder:detected', (payload) => {
    if (!alarmSilenced) mostrarAlerta(payload.person_count);
    // Notificación del navegador (además del modal + audio + voz), útil si
    // la pestaña no está en primer plano. No-op si no hay permiso concedido.
    if (typeof window.VisionGuardNotify === 'function') {
      const texto = `${payload.person_count} persona(s) detectada(s) en ${payload.camera_id}`;
      window.VisionGuardNotify(texto);
    }
  });

  socket.on('intruder:cleared', () => {
    ocultarAlerta();
  });

  socket.on('detection:update', (payload) => {
    if (intruderCountEl) intruderCountEl.textContent = payload.person_count;
    const tmFps = document.getElementById('tm-fps');
    const tmTotal = document.getElementById('tm-total');
    const tmZone = document.getElementById('tm-zone');
    const tmDwell = document.getElementById('tm-dwell');
    if (tmFps && typeof payload.fps === 'number') tmFps.textContent = `${payload.fps.toFixed(1)} FPS`;
    if (tmTotal && typeof payload.person_count === 'number') tmTotal.textContent = payload.person_count;
    if (tmZone && typeof payload.zone_count === 'number') {
      tmZone.textContent = payload.roi ? payload.zone_count : '— (sin zona)';
    }
    if (tmDwell && typeof payload.dwell_s === 'number') tmDwell.textContent = `${payload.dwell_s.toFixed(1)} s`;
  });

  if (silenceBtn) {
    silenceBtn.addEventListener('click', () => {
      alarmSilenced = true;
      if (modal) modal.classList.add('hidden');
      if (alarmAudio) alarmAudio.pause();
      window.speechSynthesis && window.speechSynthesis.cancel();
    });
  }

  const btnSilenceGlobal = document.getElementById('btn-silence');
  if (btnSilenceGlobal) {
    btnSilenceGlobal.addEventListener('click', () => {
      alarmSilenced = true;
      ocultarAlerta();
    });
  }

  window.VisionGuardSocket = socket;
})();
