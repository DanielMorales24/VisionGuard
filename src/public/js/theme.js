// theme.js
// Alterna entre tema oscuro y claro, y persiste la preferencia en
// localStorage para que se respete en cada página y en futuras visitas.

(function () {
  const btn = document.getElementById('theme-toggle');
  const icon = document.getElementById('theme-toggle-icon');
  const label = document.getElementById('theme-toggle-label');
  const root = document.documentElement;

  function applyThemeUi(theme) {
    if (icon) {
      icon.innerHTML = theme === 'light'
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 15.5A8 8 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/></svg>';
    }
    if (label) label.textContent = theme === 'light' ? 'Modo claro' : 'Modo oscuro';
  }

  applyThemeUi(root.getAttribute('data-theme') || 'light');

  if (btn) {
    btn.addEventListener('click', () => {
      const current = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const next = current === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try {
        localStorage.setItem('visionguard-theme', next);
      } catch {
        /* almacenamiento no disponible (modo privado, etc.); el tema no persiste pero sigue funcionando */
      }
      applyThemeUi(next);
    });
  }

  // Resalta el enlace del sidebar correspondiente a la página actual.
  document.querySelectorAll('.nav-link').forEach((link) => {
    const href = link.getAttribute('href');
    if (href === window.location.pathname) link.classList.add('active');
  });
})();
