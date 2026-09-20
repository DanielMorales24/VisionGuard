// camera-stream.js
// Muestra el "video en vivo" haciendo polling del endpoint de snapshot
// (/api/vision/snapshot/:id). Si no hay cámara o falla el snapshot, cae al
// placeholder estático /images/camera-feed.png.

(function () {
  const img          = document.getElementById('camera-feed');
  const select       = document.getElementById('camera-select');
  const offlineBadge = document.getElementById('feed-offline-badge');
  if (!img || !select) return;

  const PLACEHOLDER      = '/images/camera-feed.png';
  const POLL_INTERVAL_MS = 500; // ~2 fps
  let timer = null;

  function setPlaceholder() {
    // Evita parpadeo innecesario si ya estamos en el placeholder
    if (img.dataset.live === 'false' && img.getAttribute('src') === PLACEHOLDER) {
      if (offlineBadge) offlineBadge.hidden = false;
      return;
    }
    img.src = PLACEHOLDER;
    img.dataset.live = 'false';
    if (offlineBadge) offlineBadge.hidden = false;
  }

  function setLive() {
    img.dataset.live = 'true';
    if (offlineBadge) offlineBadge.hidden = true;
  }

  function currentCameraId() {
    return select.value;
  }

  function refrescarSnapshot() {
    const cameraId = currentCameraId();
    if (!cameraId) {
      setPlaceholder();
      return;
    }
    img.src = '/api/vision/snapshot/' + encodeURIComponent(cameraId) + '?t=' + Date.now();
  }

  function iniciarPolling() {
    if (timer) clearInterval(timer);
    timer = null;

    // Sin cámaras configuradas → placeholder fijo
    if (select.options.length === 0) {
      setPlaceholder();
      return;
    }

    // Pestaña en segundo plano → no gastamos ancho de banda
    if (document.hidden) return;

    timer = setInterval(refrescarSnapshot, POLL_INTERVAL_MS);
    refrescarSnapshot();
  }

  // Si la imagen cargada es distinta del placeholder, estamos en vivo.
  img.addEventListener('load', function () {
    if (img.getAttribute('src') === PLACEHOLDER) {
      setPlaceholder();
    } else {
      setLive();
    }
  });

  // Si el snapshot falla (servicio de visión caído, cámara inactiva, 404, etc.)
  // volvemos al placeholder en lugar de dejar la imagen rota.
  img.addEventListener('error', function () {
    setPlaceholder();
  });

  select.addEventListener('change', iniciarPolling);
  document.addEventListener('visibilitychange', iniciarPolling);

  // Estado inicial
  if (select.options.length > 0) {
    iniciarPolling();
  } else {
    setPlaceholder();
  }
})();