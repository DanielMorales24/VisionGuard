// camera-status.js
// Tarjetas de estado en tiempo real por cámara (modelo, zona, armado,
// personas detectadas), inspiradas en la vista "Dispositivos" de AquaGuard.

(function () {
  const grid = document.getElementById('device-grid');
  if (!grid) return;

  async function fetchStatus() {
    try {
      const res = await fetch('/api/vision/status');
      const data = await res.json();
      return (data && data.data && Array.isArray(data.data.cameras)) ? data.data.cameras : [];
    } catch {
      return null;
    }
  }

  function render(cams) {
    if (cams === null) {
      grid.innerHTML = '<p class="device-empty">El microservicio de visión no está disponible ahora mismo.</p>';
      return;
    }
    if (!cams.length) {
      grid.innerHTML = '<p class="device-empty">Ninguna cámara está corriendo. Inicia la vigilancia desde el Dashboard.</p>';
      return;
    }
    grid.innerHTML = cams
      .map((c) => {
        const led = c.capture_status === 'capturing' ? 'device-led on' : 'device-led';
        const estado = c.capture_status === 'error' || c.last_error
          ? `Error: ${c.last_error ?? 'fuente no disponible'}`
          : (c.running && !c.last_frame_at ? 'Sin frames' :
            (c.capture_status === 'capturing' ? 'Activa' : 'Conectando…'));
        const zona = c.roi ? `Sí (${c.zone_count ?? 0} en zona)` : 'No (todo el cuadro)';
        const armado = c.armed ? 'Armado' : 'Desarmado';
        return `<article class="device-card">
          <div class="device-card-head">
            <span class="${led}"></span>
            <strong>${c.camera_id}</strong>
            <span class="badge ${c.capture_status === 'capturing' ? 'badge-on' : 'badge-off'}">${estado}</span>
          </div>
          <div class="device-card-kv">
            <span>Modelo: <b>${c.model ?? '—'}</b></span>
            <span>Zona definida: <b>${zona}</b></span>
            <span>Alarma: <b>${armado}</b></span>
            <span>Personas detectadas: <b>${c.person_count ?? 0}</b></span>
            <span>Tiempo activo: <b>${Math.round((c.uptime_seconds ?? 0) / 60)} min</b></span>
          </div>
        </article>`;
      })
      .join('');
  }

  async function refresh() {
    const cams = await fetchStatus();
    render(cams);
  }

  refresh();
  setInterval(refresh, 2000);
})();
