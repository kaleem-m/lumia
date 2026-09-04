/* ==========================================================================
   App bootstrap — navigation, theme, language sheet, live re-render on
   store changes.
   ========================================================================== */
(function (global) {
  'use strict';

  var esc = UI.esc;

  var NAV = [
    { id: 'home',   path: '/home',   label: 'Home',   icon: 'home_nav' },
    { id: 'learn',  path: '/learn',  label: 'Learn',  icon: 'learn' },
    { id: 'review', path: '/review', label: 'Review', icon: 'review' },
    { id: 'notebook', path: '/notebook', label: 'Notebook',
      fullLabel: 'Notebook', icon: 'notebook', separate: true },
    { id: 'manage', path: '/manage', label: 'Manage', fullLabel: 'Manage Words',
      icon: 'manage', separate: true }
  ];

  /* ---- Routes ------------------------------------------------------------ */
  function registerRoutes() {
    Router.register('/home', Views.home, { section: 'home', title: 'Home' });
    Router.register('/category/:id', Views.category, { section: 'home', title: 'Category' });
    Router.register('/learn', Views.learn, { section: 'learn', title: 'Learn' });
    Router.register('/learn/play/:mode', Views.learnPlay, { section: 'learn', title: 'Session' });
    Router.register('/learn/play/:mode/category/:categoryId', Views.learnPlay, { section: 'learn', title: 'Session' });
    Router.register('/review', Views.review, { section: 'review', title: 'Review' });
    Router.register('/notebook/:id', Views.notebook,
      { section: 'notebook', mode: 'notebook', title: 'Notebook' });
    Router.register('/notebook', Views.notebook,
      { section: 'notebook', mode: 'notebook', title: 'Notebook' });
    Router.register('/account', Views.account, { section: 'account', title: 'My Account' });
    Router.register('/manage/category/:categoryId', Views.manage, { section: 'manage', mode: 'manage', title: 'Manage Words' });
    Router.register('/manage', Views.manage, { section: 'manage', mode: 'manage', title: 'Manage Words' });
  }

  /* ---- Navigation -------------------------------------------------------- */
  function buildNav() {
    var tabbar = document.getElementById('tabbar');
    var sidenav = document.getElementById('sidebar-nav');

    tabbar.innerHTML = NAV.map(function (n) {
      return '<a class="tab' + (n.separate ? ' tab--manage' : '') + '" href="#' + n.path + '" ' +
             'data-nav="' + n.id + '">' + Icon(n.icon) +
             '<span>' + esc(n.label) + '</span></a>';
    }).join('');

    sidenav.innerHTML = NAV.map(function (n) {
      return (n.separate ? '<div class="nav-sep" role="presentation"></div>' : '') +
        '<a class="nav-link' + (n.separate ? ' nav-link--manage' : '') + '" href="#' + n.path + '" ' +
        'data-nav="' + n.id + '">' + Icon(n.icon) +
        '<span>' + esc(n.fullLabel || n.label) + '</span>' +
        (n.id === 'home' ? '<span class="nav-link__count" id="nav-word-count"></span>' : '') +
        '</a>';
    }).join('');
  }

  function syncNav() {
    var section = Router.section();
    UI.$$('[data-nav]').forEach(function (el) {
      if (el.dataset.nav === section) { el.setAttribute('aria-current', 'page'); }
      else { el.removeAttribute('aria-current'); }
    });

    var count = document.getElementById('nav-word-count');
    if (count) {
      var t = Store.totals().words;
      count.textContent = t ? String(t) : '';
    }

    var title = document.getElementById('topbar-title');
    var current = Router.current;
    if (current && current.route.meta.section === 'home' && current.params.id) {
      var cat = Categories.get(current.params.id);
      title.textContent = cat ? cat.name : 'Lexio';
    } else if (current && current.route.meta.section !== 'home') {
      title.textContent = current.route.meta.title;
    } else {
      title.textContent = 'Lexio';
    }
  }

  /* ---- Theme ------------------------------------------------------------- */
  function applyTheme() {
    var pref = Store.settings.theme;
    var dark = pref === 'dark' ||
      (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';

    var btn = document.getElementById('theme-toggle');
    document.getElementById('theme-toggle-icon').innerHTML = Icon(dark ? 'sun' : 'moon');
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  function initTheme() {
    applyTheme();
    document.getElementById('theme-toggle').addEventListener('click', function () {
      var dark = document.documentElement.dataset.theme === 'dark';
      Store.setSetting('theme', dark ? 'light' : 'dark');
      applyTheme();
      Router.refresh();          // category tints are theme-aware
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (Store.settings.theme === 'system') { applyTheme(); Router.refresh(); }
    });
  }

  /* ---- Language chip & sheet --------------------------------------------- */
  function syncLanguageChip() {
    var lang = Store.activeLanguage();
    document.getElementById('lang-chip-icon').innerHTML = Icon('globe');
    var label = document.getElementById('lang-chip-label');
    label.textContent = lang ? lang.name : 'Set language';
    label.parentElement.setAttribute('aria-label',
      lang ? 'Active language: ' + lang.name + '. Change it.' : 'Choose a language');
  }

  function openLanguageSheet() {
    var langs = Store.languages();
    var activeId = Store.settings.activeLanguageId;

    var list = langs.length
      ? '<div class="option-list" style="margin-block-end:var(--s-5)">' + langs.map(function (l) {
          return '<button type="button" class="option" data-pick="' + esc(l.id) + '" ' +
            'aria-pressed="' + (l.id === activeId) + '">' +
            '<span class="grow"><span class="option__title" dir="auto">' + esc(l.name) + '</span><br>' +
            '<span class="option__sub">' +
              (l.dir === 'rtl' ? 'Right to left' : l.dir === 'auto' ? 'Auto-detect' : 'Left to right') +
            '</span></span>' +
            (l.id === activeId ? Icon('check', { size: 20 }) : '') +
          '</button>';
        }).join('') + '</div>'
      : '';

    UI.modal({
      title: 'Language',
      description: 'Each language keeps its own words and reading direction.',
      body: list +
        '<form id="lang-form" class="stack" autocomplete="off">' +
          '<label class="field">' +
            '<span class="field__label">Language name</span>' +
            '<input class="field__input" name="name" dir="auto" required maxlength="40" ' +
              'placeholder="Arabic, Japanese, Spanish…" data-autofocus>' +
          '</label>' +
          '<label class="field">' +
            '<span class="field__label">Reading direction</span>' +
            '<div class="seg" role="radiogroup" aria-label="Reading direction">' +
              '<label class="seg__opt"><input type="radio" name="dir" value="ltr" checked><span>Left → right</span></label>' +
              '<label class="seg__opt"><input type="radio" name="dir" value="rtl"><span>Right ← left</span></label>' +
              '<label class="seg__opt"><input type="radio" name="dir" value="auto"><span>Auto</span></label>' +
            '</div>' +
            '<span class="field__hint">Choose Auto for mixed scripts — direction is detected per word.</span>' +
          '</label>' +
          '<div class="modal__actions">' +
            '<button type="button" class="btn" data-act="cancel">Cancel</button>' +
            '<button type="submit" class="btn btn--primary">' + Icon('plus') + 'Add language</button>' +
          '</div>' +
        '</form>',
      onMount: function (panel, close) {
        UI.$('[data-act="cancel"]', panel).addEventListener('click', close);

        UI.$$('[data-pick]', panel).forEach(function (b) {
          b.addEventListener('click', function () {
            Store.setActiveLanguage(b.dataset.pick);
            close();
            UI.toast('Switched language');
          });
        });

        UI.$('#lang-form', panel).addEventListener('submit', function (e) {
          e.preventDefault();
          var fd = new FormData(e.target);
          var name = String(fd.get('name') || '').trim();
          if (!name) { return; }
          var lang = Store.addLanguage({ name: name, dir: String(fd.get('dir')) });
          Store.setActiveLanguage(lang.id);
          close();
          UI.toast(name + ' added');
        });
      }
    });
  }

  /* ---- Scroll shadow on the top bar --------------------------------------- */
  function initScrollState() {
    var topbar = document.getElementById('topbar');
    var tick = false;
    function update() {
      topbar.dataset.scrolled = window.scrollY > 4 ? 'true' : 'false';
      tick = false;
    }
    window.addEventListener('scroll', function () {
      if (!tick) { tick = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  /* ---- Account dropdown menu ---------------------------------------------- */
  var acctMenuCleanup = [];

  function closeAccountMenu() {
    var existing = document.getElementById('acct-menu');
    if (existing) { existing.remove(); }
    var btn = document.getElementById('account-button');
    if (btn) { btn.setAttribute('aria-expanded', 'false'); }
    acctMenuCleanup.forEach(function (fn) { fn(); });
    acctMenuCleanup = [];
  }

  function menuItem(label, icon, act, danger) {
    return '<button type="button" role="menuitem" class="acct-menu__item' +
      (danger ? ' acct-menu__item--danger' : '') + '" data-menu="' + act + '">' +
      Icon(icon) + '<span>' + esc(label) + '</span></button>';
  }

  function openAccountMenu() {
    if (document.getElementById('acct-menu')) { closeAccountMenu(); return; }

    var btn = document.getElementById('account-button');
    if (!btn) { return; }
    btn.setAttribute('aria-expanded', 'true');

    var signedIn = CloudSync.isAuthenticated();
    var summary = signedIn ? CloudSync.accountSummary() : null;

    var menu = document.createElement('div');
    menu.id = 'acct-menu';
    menu.className = 'acct-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML =
      '<div class="acct-menu__head">' +
        '<strong>' + esc(summary ? (summary.displayName || 'My account') : 'Guest') + '</strong>' +
        '<span>' + esc(summary ? (summary.email || '') : 'On this device only') + '</span>' +
      '</div>' +
      menuItem('My profile', 'shield', 'profile') +
      (signedIn
        ? menuItem('Sign out', 'back', 'signout')
        : menuItem('Sign in', 'shield', 'signin'));
    document.body.appendChild(menu);

    /* Fixed position anchored under the button, right-aligned. */
    var rect = btn.getBoundingClientRect();
    menu.style.top = (rect.bottom + 6) + 'px';
    menu.style.right = Math.max(16, global.innerWidth - rect.right) + 'px';

    function onDocClick(e) {
      if (!menu.contains(e.target) && !btn.contains(e.target)) { closeAccountMenu(); }
    }
    function onKey(e) { if (e.key === 'Escape') { closeAccountMenu(); } }

    menu.addEventListener('click', function (e) {
      var item = e.target.closest('[data-menu]');
      if (!item) { return; }
      var act = item.dataset.menu;
      closeAccountMenu();
      if (act === 'profile') { Router.go('/account'); }
      if (act === 'signin') { CloudSync.openSignIn(); }
      if (act === 'signout') {
        CloudSync.signOut().then(function (done) { if (done) { Router.go('/home'); } });
      }
    });

    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey);
    global.addEventListener('resize', closeAccountMenu);
    acctMenuCleanup.push(function () {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey);
      global.removeEventListener('resize', closeAccountMenu);
    });
  }

  /* ---- Boot --------------------------------------------------------------- */
  function boot() {
    var brandMark = document.getElementById('brand-mark');
    var brandMarkMobile = document.getElementById('brand-mark-mobile');
    var accountIcon = document.getElementById('account-icon');
    /* Test pages may mirror a reduced shell — never assume every node. */
    if (brandMark) { brandMark.innerHTML = Icon('seed'); }
    if (brandMarkMobile) { brandMarkMobile.innerHTML = Icon('seed'); }
    if (accountIcon) { accountIcon.innerHTML = Icon('shield'); }

    registerRoutes();
    buildNav();
    initTheme();
    initScrollState();
    syncLanguageChip();

    document.getElementById('lang-chip').addEventListener('click', openLanguageSheet);

    // Any store change re-renders the current view and the nav counters, so
    // the "X words learned" figures are always live.
    Store.subscribe(function (reason) {
      syncLanguageChip();
      syncNav();
      if (reason === 'settings') { return; }
      Router.refresh();
    });

    global.addEventListener('lexio:navigated', syncNav);

    // Supabase must consume an OAuth callback before the hash router runs.
    // The legacy implicit flow returns tokens in location.hash; routing first
    // would replace that hash with #/home and discard the new session.
    CloudSync.init().catch(function (error) {
      console.error('[Lexio] Authentication initialization failed.', error);
      UI.toast('Authentication could not be initialized. Guest mode is still available.', {
        icon: 'warning', duration: 6000
      });
    }).then(function () {
      Router.start();
    });

    if (!Store.isPersistent) {
      UI.toast('This browser is blocking local storage — changes will not be saved.',
        { icon: 'warning', duration: 6000 });
    }
  }

  global.App = {
    openLanguageSheet: openLanguageSheet,
    applyTheme: applyTheme,
    openAccountMenu: openAccountMenu,
    closeAccountMenu: closeAccountMenu
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
