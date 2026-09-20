(function () {
  document.querySelectorAll('[data-password-toggle]').forEach(function (toggle) {
    toggle.addEventListener('click', function () {
      const input = document.getElementById(toggle.dataset.passwordToggle);
      if (!input) return;
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      toggle.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
    });
  });

  document.querySelectorAll('.auth-form').forEach(function (form) {
    form.addEventListener('submit', function () {
      const button = form.querySelector('.auth-submit');
      if (button) button.classList.add('is-loading');
    });
  });
})();
