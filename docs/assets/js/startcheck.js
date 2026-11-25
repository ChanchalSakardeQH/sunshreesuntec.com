// 3.34.1: if the page's main script can't start (a file missing or out of date on the server, an old copy in the
// browser's cache), say so instead of leaving "Loading…" on the screen. Plain script (not a module), so it runs even
// when the modules fail.
(function () {
  var errors = [];
  window.addEventListener('error', function (e) {
    var m = (e && (e.message || (e.error && e.error.message))) || '';
    var src = e && e.target && e.target.src ? ' (' + String(e.target.src).split('/').pop() + ')' : '';
    if (m || src) errors.push((m || 'A script could not be loaded') + src);
  }, true);
  window.addEventListener('load', function () {
    setTimeout(function () {
      var el = document.getElementById('gate') || document.getElementById('msg');
      if (!el || !/^\s*Loading/.test(el.textContent || '')) return;
      var box = document.createElement('div');
      box.className = 'callout warn-note';
      box.setAttribute('role', 'alert');
      box.innerHTML = '<h2>The page didn’t start</h2><p>Please press <b>Ctrl + F5</b> (on a phone: close and reopen the page) to load the latest version. '
        + 'If this message comes back, the website files on the server are incomplete — tell the person who maintains the website, with the line below.</p>'
        + '<p class="muted small-note" id="startcheck-detail"></p>';
      el.replaceWith(box);
      document.getElementById('startcheck-detail').textContent = errors.length ? errors.slice(0, 3).join(' · ') : 'No error was reported by the browser.';
    }, 12000);
  });
})();
