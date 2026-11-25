/* Applies the saved theme before first paint. A separate file (not inline) so the CSP can forbid inline scripts. */
(function () {
  try {
    var storedMode = localStorage.getItem('tct_theme_mode') || localStorage.getItem('tct_pref_theme')
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    var mode = storedMode || (prefersDark ? 'dark' : 'light')
    var accent = localStorage.getItem('tct_theme_accent') || localStorage.getItem('tct_pref_accent_preset') || 'orbit-blue'
    var isDark = mode === 'dark' || (mode === 'system' && prefersDark)
    var root = document.documentElement
    root.classList.toggle('dark', !!isDark)
    root.style.colorScheme = isDark ? 'dark' : 'light'
    root.setAttribute('data-accent', accent)
  } catch (e) {}
})()
