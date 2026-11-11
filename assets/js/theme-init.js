/* Runs before first paint (classic script) so there is no light/dark flash. */
(function () {
  var theme = null;
  try {
    var stored = localStorage.getItem('voxtab:theme');
    if (stored === 'light' || stored === 'dark') theme = stored;
  } catch (e) { /* storage unavailable: fall back to the system setting */ }
  if (!theme) {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
