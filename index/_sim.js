/* Signed-in simulation v2: surface every error, flush immediately. */
(function () {
  var pre = document.createElement('pre');
  pre.id = 'smoke-out';
  document.body.appendChild(pre);
  window.addEventListener('error', function (e) {
    pre.textContent += 'PAGE-ERROR ' + e.message + ' @' + (e.filename || '') + ':' + e.lineno + '\n';
  });
  function out(s) { pre.textContent += s + '\n'; }
  out('driver booted, hash=' + location.hash);

  setTimeout(function () {
    try {
      out('CloudSync=' + typeof CloudSync + ' Views.account=' + typeof Views.account);
      CloudSync.accountSummary = function () {
        return {
          authenticated: true,
          email: 'kaleem93@gmail.com',
          createdAt: '2026-08-20T10:00:00Z',
          provider: 'google',
          displayName: 'Kaleem M',
        };
      };
      CloudSync.isConfigured = function () { return true; };
      CloudSync.aiInvoke = function (body) {
        return body.action === 'status'
          ? Promise.resolve({ connected: true, provider: 'openai', hint: 'a1b2', baseUrl: '' })
          : Promise.resolve({ ok: true });
      };
      location.hash = '#/account';
      out('navigated');
    } catch (e) { out('SETUP-ERR ' + e.message); }

    setTimeout(function () {
      try {
        function m(sel) {
          var el = document.querySelector(sel);
          if (!el) { return 'MISSING'; }
          var r = el.getBoundingClientRect();
          return 'x=' + r.x.toFixed(0) + ' w=' + r.width.toFixed(0) + ' right=' + r.right.toFixed(0);
        }
        out('viewport=' + innerWidth);
        out('grid ' + m('.acct-grid'));
        out('col1 ' + m('.acct-col:nth-of-type(1)'));
        out('col2 ' + m('.acct-col:nth-of-type(2)'));
        out('profile ' + m('.acct-col:nth-of-type(1) .card'));
        out('learning ' + m('.acct-col:nth-of-type(2) .card'));
        var c1 = document.querySelector('.acct-col:nth-of-type(1) .card');
        var c2 = document.querySelector('.acct-col:nth-of-type(2) .card');
        if (c1 && c2) {
          var a = c1.getBoundingClientRect(), b = c2.getBoundingClientRect();
          out(a.right > b.left + 1
            ? 'VERDICT: OVERLAP by ' + (a.right - b.left).toFixed(0) + 'px'
            : 'VERDICT: CLEAN (gap ' + (b.left - a.right).toFixed(0) + 'px)');
        }
        out('aiTag=' + (q('#ai-status .tag') ? q('#ai-status .tag').textContent : 'none'));
      } catch (e) { out('MEASURE-ERR ' + e.message); }
      document.title = 'SIM-DONE';
      function q(sel) { return document.querySelector(sel); }
    }, 350);
  }, 150);
})();
