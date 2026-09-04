/* ==========================================================================
   Router — hash based so the site works from any static host subdirectory
   (GitHub Pages project pages included) with no server rewrite rules.

   Routes:
     #/home                 category grid
     #/category/:id         one category
     #/learn                learn hub
     #/learn/play/:mode     one learning activity (optionally /category/:id)
     #/review               progress & stats
     #/manage               manage words (separate mode)

   A view handler may return a teardown function (or { teardown }). It runs
   just before the next view replaces this one, so stateful screens such as
   learning sessions can detach their keyboard/timer listeners cleanly.
   ========================================================================== */
(function (global) {
  'use strict';

  var routes = [];
  var current = null;

  function register(pattern, handler, meta) {
    var names = [];
    var rx = new RegExp('^' + pattern.replace(/:([\w]+)/g, function (_, n) {
      names.push(n);
      return '([^/]+)';
    }) + '$');
    routes.push({ rx: rx, names: names, handler: handler, meta: meta || {} });
  }

  function parse() {
    var raw = (location.hash || '').replace(/^#/, '');
    if (!raw || raw === '/') { return '/home'; }
    return raw;
  }

  function resolve(path) {
    for (var i = 0; i < routes.length; i++) {
      var m = path.match(routes[i].rx);
      if (m) {
        var params = {};
        routes[i].names.forEach(function (n, j) { params[n] = decodeURIComponent(m[j + 1]); });
        return { route: routes[i], params: params, path: path };
      }
    }
    return null;
  }

  function go(path, replace) {
    var target = '#' + path;
    if (location.hash === target) { render(); return; }
    if (replace) { location.replace(target); } else { location.hash = target; }
  }

  function render() {
    var path = parse();
    var match = resolve(path);
    if (!match) {
      /* Bail instead of recursing when even the fallback has no route
         (e.g. a test page whose routes failed to register). */
      if (path !== '/home') { go('/home', true); }
      return;
    }

    if (current && typeof current.teardown === 'function') {
      try { current.teardown(); } catch (e) { console.error('[Lexio] view teardown failed.', e); }
    }
    current = match;
    var view = document.getElementById('view');

    // Restart the enter animation on every navigation.
    view.classList.remove('view');
    void view.offsetWidth;
    view.classList.add('view');

    view.innerHTML = '';
    var teardown = match.route.handler(view, match.params);
    current.teardown = typeof teardown === 'function' ? teardown
      : (teardown && typeof teardown.teardown === 'function' ? teardown.teardown : null);

    document.querySelector('.app').dataset.mode = match.route.meta.mode || 'browse';
    document.title = (match.route.meta.title ? match.route.meta.title + ' · ' : '') +
      'Lexio';

    global.dispatchEvent(new CustomEvent('lexio:navigated', { detail: match }));
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  global.addEventListener('hashchange', render);

  global.Router = {
    register: register,
    start: render,
    go: go,
    refresh: render,
    get current() { return current; },
    /** Top-level section id used to highlight nav items. */
    section: function () {
      if (!current) { return 'home'; }
      return current.route.meta.section || 'home';
    }
  };
})(window);
