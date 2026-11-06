/**
 * Theme switch, served as `/theme.js`. It is an external file so the strict CSP can allow it
 * (`script-src 'self'`) without any inline script. Loaded blocking in <head>, it applies the saved
 * choice before the page paints. Every storage access is guarded: private windows may refuse it.
 */
export const THEME_SCRIPT = `(function () {
  var KEY = 'theme';
  var root = document.documentElement;
  function read() {
    try { return window.localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function save(value) {
    try { window.localStorage.setItem(KEY, value); } catch (e) { /* not kept: the page still works */ }
  }
  function apply(value) {
    if (value === 'light' || value === 'dark') root.setAttribute('data-theme', value);
    else root.removeAttribute('data-theme');
  }
  apply(read());
  document.addEventListener('DOMContentLoaded', function () {
    var picker = document.getElementById('theme-picker');
    if (!picker) return;
    var buttons = picker.querySelectorAll('button[data-theme-choice]');
    function mark(choice) {
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].setAttribute('aria-pressed', String(buttons[i].getAttribute('data-theme-choice') === choice));
      }
    }
    mark(read() || 'auto');
    picker.hidden = false;
    picker.addEventListener('click', function (event) {
      var choice = event.target && event.target.getAttribute && event.target.getAttribute('data-theme-choice');
      if (!choice) return;
      save(choice);
      apply(choice);
      mark(choice);
    });
  });
})();
`;
