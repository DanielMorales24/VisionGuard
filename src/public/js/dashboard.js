// dashboard.js
// Lógica de interacción de las páginas: iniciar/detener vigilancia,
// agregar/eliminar cámaras, guardar ajustes. Todo vía fetch a /api.

(function () {
  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error ? JSON.stringify(data.error) : `Error en ${url}`);
    }
    return data;
  }

  // --- Dashboard: iniciar / detener / silenciar vigilancia ---
  const btnStart = document.getElementById('btn-start');
  const btnStop = document.getElementById('btn-stop');
  const cameraSelect = document.getElementById('camera-select');

  if (btnStart && cameraSelect) {
    btnStart.addEventListener('click', async () => {
      const cameraId = cameraSelect.value;
      if (!cameraId) return alert('Agrega una cámara primero en la sección Cámaras.');
      try {
        await apiFetch('/api/vision/start', {
          method: 'POST',
          body: JSON.stringify({ camera_id: cameraId }),
        });
      } catch (err) {
        alert('No se pudo iniciar la vigilancia: ' + err.message);
      }
    });
  }

  if (btnStop && cameraSelect) {
    btnStop.addEventListener('click', async () => {
      const cameraId = cameraSelect.value;
      if (!cameraId) return;
      try {
        await apiFetch('/api/vision/stop', {
          method: 'POST',
          body: JSON.stringify({ camera_id: cameraId }),
        });
      } catch (err) {
        alert('No se pudo detener la vigilancia: ' + err.message);
      }
    });
  }

  // --- Cámaras: agregar ---
  const addCameraForm = document.getElementById('add-camera-form');
  if (addCameraForm) {
    addCameraForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(addCameraForm);
      const body = Object.fromEntries(formData.entries());
      if (body.rtspHost) {
        const credentials = body.rtspUsername
          ? `${encodeURIComponent(body.rtspUsername)}:${encodeURIComponent(body.rtspPassword || '')}@`
          : '';
        const port = body.rtspPort ? `:${body.rtspPort}` : '';
        const path = body.rtspPath ? (body.rtspPath.startsWith('/') ? body.rtspPath : `/${body.rtspPath}`) : '';
        const query = body.rtspQuery ? `?${body.rtspQuery.replace(/^\?/, '')}` : '';
        body.url = `${body.rtspProtocol}://${credentials}${body.rtspHost}${port}${path}${query}`;
      }
      if (!body.url) {
        alert('Escribe una URL completa o completa los campos RTSP.');
        return;
      }
      ['rtspProtocol', 'rtspHost', 'rtspPort', 'rtspUsername', 'rtspPassword', 'rtspPath', 'rtspQuery']
        .forEach((field) => delete body[field]);
      try {
        await apiFetch('/api/cameras', { method: 'POST', body: JSON.stringify(body) });
        window.location.reload();
      } catch (err) {
        alert('No se pudo agregar la cámara: ' + err.message);
      }
    });
  }

  // --- Cámaras: eliminar ---
  document.querySelectorAll('.btn-delete-camera').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('tr');
      const cameraId = row.dataset.cameraId;
      if (!confirm(`¿Eliminar la cámara "${cameraId}"?`)) return;
      try {
        await apiFetch(`/api/cameras/${encodeURIComponent(cameraId)}`, { method: 'DELETE' });
        row.remove();
      } catch (err) {
        alert('No se pudo eliminar la cámara: ' + err.message);
      }
    });
  });

  // --- Ajustes ---
  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(settingsForm);
      const body = {
        alarmCooldown: Number(formData.get('alarmCooldown')),
        personThreshold: Number(formData.get('personThreshold')),
        voiceEnabled: formData.get('voiceEnabled') === 'on',
        volume: Number(formData.get('volume')),
        alarmSound: formData.get('alarmSound'),
      };
      try {
        await apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
        alert('Ajustes guardados correctamente.');
      } catch (err) {
        alert('No se pudieron guardar los ajustes: ' + err.message);
      }
    });
  }
  // --- Alertas: limpiar historial ---
  const btnClearAlerts = document.getElementById('btn-clear-alerts');
  if (btnClearAlerts) {
    btnClearAlerts.addEventListener('click', async () => {
      if (!confirm('¿Borrar todo el historial de alertas? Esta acción no se puede deshacer.')) return;
      try {
        await apiFetch('/api/alerts', { method: 'DELETE' });
        window.location.reload();
      } catch (err) {
        alert('No se pudo limpiar el historial: ' + err.message);
      }
    });
  }
})();
