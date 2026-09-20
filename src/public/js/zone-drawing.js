// zone-drawing.js
// Zona de vigilancia (ROI) dibujable sobre el video, armado/desarmado de la
// alarma independiente de iniciar/detener la vigilancia, y notificaciones
// del navegador cuando hay un intruso. Inspirado en el flujo de AquaGuard.

(function () {
  const img = document.getElementById('camera-feed');
  const canvas = document.getElementById('zone-canvas');
  const select = document.getElementById('camera-select');
  const btnDraw = document.getElementById('btn-draw-zone');
  const btnClear = document.getElementById('btn-clear-zone');
  const btnArm = document.getElementById('btn-arm');
  const armedPill = document.getElementById('armed-pill');
  const zoneHint = document.getElementById('zone-hint');
  const intruderCountEl = document.getElementById('intruder-count');
  const zoneCountEl = document.getElementById('zone-count');
  const zoneCountBadge = document.getElementById('zone-count-badge');

  if (!img || !canvas || !select) return;

  const ctx = canvas.getContext('2d');
  const state = {
    drawing: false,
    drag: null,
    roi: null,     // { x, y, w, h, normalized: true }
    armed: false,
    pollTimer: null,
  };

  function currentCameraId() {
    return select.value;
  }

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error ? JSON.stringify(data.error) : `Error en ${url}`);
    }
    return data;
  }

  function fitCanvas() {
    const rect = img.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width));
    canvas.height = Math.max(1, Math.round(rect.height));
    drawRoi(state.roi, false);
  }

  function eventToNorm(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function normRoi(a, b) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x),
      h: Math.abs(b.y - a.y),
      normalized: true,
    };
  }

  function drawRoi(roi, preview) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!roi) return;
    const x = roi.x * canvas.width;
    const y = roi.y * canvas.height;
    const w = roi.w * canvas.width;
    const h = roi.h * canvas.height;
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
    ctx.lineWidth = 2;
    ctx.setLineDash(preview ? [6, 4] : [10, 6]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  function setArmedUi(armed, hasRoi) {
    state.armed = armed;
    armedPill.textContent = armed ? 'Armado' : 'Desarmado';
    armedPill.className = 'armed-pill ' + (armed ? 'armed-on' : 'armed-off');
    btnArm.innerHTML = armed
      ? '<svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0"/></svg><span>Desarmar</span>'
      : '<svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><span>Armar</span>';
    btnArm.disabled = !hasRoi && !armed && false; // se puede armar aun sin zona (vigila todo el cuadro)
  }

  async function requestNotifyPermission() {
    if (typeof Notification === 'undefined') return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try {
      return await Notification.requestPermission();
    } catch {
      return 'unsupported';
    }
  }

  function notifyBrowser(body) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    try {
      const n = new Notification('VisionGuard', { body, tag: 'visionguard-alert', requireInteraction: true });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* el navegador puede bloquear Notification fuera de https/localhost */
    }
  }
  window.VisionGuardNotify = notifyBrowser;

  // --- Dibujo de la zona ---
  btnDraw.addEventListener('click', () => {
    state.drawing = true;
    btnDraw.classList.add('primary');
    canvas.style.pointerEvents = 'auto';
    fitCanvas();
    zoneHint.textContent = 'Arrastra un rectángulo sobre el video para definir la zona a vigilar.';
  });

  canvas.addEventListener('mousedown', (e) => {
    if (!state.drawing) return;
    const p = eventToNorm(e);
    state.drag = { start: p, now: p };
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!state.drag) return;
    state.drag.now = eventToNorm(e);
    drawRoi(normRoi(state.drag.start, state.drag.now), true);
  });

  canvas.addEventListener('mouseup', async () => {
    if (!state.drag) return;
    const roi = normRoi(state.drag.start, state.drag.now);
    state.drag = null;
    state.drawing = false;
    btnDraw.classList.remove('primary');
    canvas.style.pointerEvents = 'none';
    if (roi.w < 0.02 || roi.h < 0.02) {
      drawRoi(state.roi, false);
      return;
    }
    const cameraId = currentCameraId();
    if (!cameraId) return;
    const zoneName = window.prompt('¿Cómo quieres llamar a esta zona?', state.roi?.zoneName || 'Zona segura');
    if (zoneName === null) {
      drawRoi(state.roi, false);
      return;
    }
    try {
      await apiFetch(`/api/vision/roi/${encodeURIComponent(cameraId)}`, {
        method: 'POST',
        body: JSON.stringify({ ...roi, zoneName: zoneName.trim() || 'Zona segura' }),
      });
      state.roi = { ...roi, zoneName: zoneName.trim() || 'Zona segura' };
      zoneHint.textContent = 'Zona guardada. Arma el sistema para vigilarla.';
      drawRoi(state.roi, false);
    } catch (err) {
      alert('No se pudo guardar la zona: ' + err.message);
    }
  });

  btnClear.addEventListener('click', async () => {
    const cameraId = currentCameraId();
    if (!cameraId) return;
    try {
      await apiFetch(`/api/vision/roi/${encodeURIComponent(cameraId)}`, { method: 'DELETE' });
      state.roi = null;
      drawRoi(null, false);
      zoneHint.textContent = 'Zona eliminada; se vigila todo el cuadro de la cámara.';
    } catch (err) {
      alert('No se pudo borrar la zona: ' + err.message);
    }
  });

  // --- Armado / desarmado ---
  btnArm.addEventListener('click', async () => {
    const cameraId = currentCameraId();
    if (!cameraId) return alert('Agrega e inicia una cámara primero.');
    const next = !state.armed;
    try {
      await apiFetch(`/api/vision/arm/${encodeURIComponent(cameraId)}`, {
        method: 'POST',
        body: JSON.stringify({ armed: next }),
      });
      setArmedUi(next, Boolean(state.roi));
      if (next) {
        const perm = await requestNotifyPermission();
        if (perm === 'granted') {
          zoneHint.textContent = 'Sistema armado. El navegador te avisará si detecta un intruso.';
        } else {
          zoneHint.textContent = 'Sistema armado. La alarma sonora y visual seguirá funcionando.';
        }
      } else {
        zoneHint.textContent = 'Sistema desarmado: la cámara sigue vigilando pero no sonará la alarma.';
      }
    } catch (err) {
      alert('No se pudo cambiar el estado de armado: ' + err.message);
    }
  });

  // --- Sincroniza estado (zona, armado, conteos) contra /api/vision/status ---
  function camerasFrom(data) {
    return (data && data.data && Array.isArray(data.data.cameras)) ? data.data.cameras : [];
  }

  async function pollStatus() {
    const cameraId = currentCameraId();
    if (!cameraId) return;
    try {
      const data = await apiFetch('/api/vision/status');
      const cams = camerasFrom(data);
      const cam = cams.find((c) => c.camera_id === cameraId);
      const tmStatus = document.getElementById('tm-status');
      const tmModel = document.getElementById('tm-model');
      const tmTotal = document.getElementById('tm-total');
      const tmZone = document.getElementById('tm-zone');
      const tmDwell = document.getElementById('tm-dwell');
      const recBadge = document.getElementById('rec-badge');
      if (!cam) {
        if (tmStatus) tmStatus.textContent = 'Sin ejecutar';
        if (recBadge) recBadge.hidden = true;
        return;
      }
      if (JSON.stringify(cam.roi) !== JSON.stringify(state.roi)) {
        state.roi = cam.roi || null;
        drawRoi(state.roi, false);
      }
      setArmedUi(Boolean(cam.armed), Boolean(cam.roi));
      if (typeof cam.zone_count === 'number' && cam.roi) {
        zoneCountBadge.hidden = false;
        zoneCountEl.textContent = cam.zone_count;
      } else {
        zoneCountBadge.hidden = true;
      }
      if (intruderCountEl && typeof cam.person_count === 'number') {
        intruderCountEl.textContent = cam.person_count;
      }
      if (tmStatus) {
        if (cam.capture_status === 'error') {
          tmStatus.textContent = `Error de captura: ${cam.last_error || 'fuente no disponible'}`;
        } else if (cam.capture_status === 'capturing') {
          tmStatus.textContent = 'Vigilando';
        } else if (cam.running && cam.last_error) {
          tmStatus.textContent = `Error de captura: ${cam.last_error}`;
        } else if (cam.running && !cam.last_frame_at) {
          tmStatus.textContent = 'Sin frames: revisa URL, puerto o transporte RTSP';
        } else {
          tmStatus.textContent = 'Conectando con la cámara…';
        }
      }
      if (tmModel) tmModel.textContent = cam.model || '—';
      if (tmTotal) tmTotal.textContent = cam.person_count ?? 0;
      if (tmZone) tmZone.textContent = cam.roi ? (cam.zone_count ?? 0) : '— (sin zona)';
      if (tmDwell) tmDwell.textContent = `${Number(cam.dwell_s ?? 0).toFixed(1)} s`;
      if (recBadge) recBadge.hidden = !cam.running;
    } catch {
      // El microservicio puede estar caído; no interrumpe el resto del dashboard.
      const tmStatus = document.getElementById('tm-status');
      if (tmStatus) tmStatus.textContent = 'Microservicio no disponible';
    }
  }

  select.addEventListener('change', () => {
    state.roi = null;
    drawRoi(null, false);
    pollStatus();
  });

  window.addEventListener('resize', fitCanvas);
  img.addEventListener('load', fitCanvas);

  fitCanvas();
  pollStatus();
  state.pollTimer = setInterval(pollStatus, 1500);
})();
