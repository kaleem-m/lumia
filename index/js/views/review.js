/* ==========================================================================
   Review — the progress dashboard (Phase 5).

   Everything on this page is computed from one fresh call to
   Store.reviewSnapshot(): overview tiles, mastery per category, where words
   sit across the Leitner boxes, the last fourteen days of practice, the
   "needs work" list, and the session history. Charts are plain CSS and a
   little inline SVG-free markup — no dependencies, no dashboard clichés.
   ========================================================================== */
(function (global) {
  'use strict';

  var esc = UI.esc;

  function isDark() { return document.documentElement.dataset.theme === 'dark'; }

  /* ---- small formatting helpers ------------------------------------------ */

  function fmtWhen(at) {
    var d = new Date(at);
    var today = new Date();
    var yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    var time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === today.toDateString()) { return 'Today · ' + time; }
    if (d.toDateString() === yesterday.toDateString()) { return 'Yesterday · ' + time; }
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' · ' + time;
  }

  function modeInfo(mode) {
    var def = global.Activities && Activities.get(mode);
    return {
      name: def ? def.name : mode.charAt(0).toUpperCase() + mode.slice(1),
      icon: def ? def.icon : 'sparkle'
    };
  }

  /* Shorthand axis labels for the six-box chart; full names live in titles. */
  var BOX_SHORT = ['New', 'Seen', 'Warming', 'Familiar', 'Solid', 'Mastered'];

  /* ---- building blocks ----------------------------------------------------- */

  function tile(icon, value, label, opts) {
    opts = opts || {};
    return '' +
      '<' + (opts.href ? 'a href="' + opts.href + '"' : 'div') + ' class="rev-tile' +
        (opts.accent ? ' rev-tile--accent' : '') + '">' +
        '<span class="rev-tile__head">' + Icon(icon) +
          '<span>' + esc(label) + '</span></span>' +
        '<b>' + value + '</b>' +
        (opts.sub ? '<span class="rev-tile__sub">' + esc(opts.sub) + '</span>' : '') +
      '</' + (opts.href ? 'a' : 'div') + '>';
  }

  function masteryRow(cat, dark) {
    var vars = Categories.styleVars(Categories.get(cat.id), dark);
    var pct = cat.total ? Math.round((cat.learned / cat.total) * 100) : 0;
    var acc = cat.accuracy === null
      ? '<span class="mastery-acc mastery-acc--quiet">not practised yet</span>'
      : '<span class="mastery-acc">' + cat.accuracy + '% recall</span>';

    return '' +
      '<li class="mastery-row" style="' + vars + '">' +
        '<span class="mastery-row__icon" aria-hidden="true">' +
          Icon(Categories.get(cat.id).icon) + '</span>' +
        '<span class="mastery-row__text">' +
          '<span class="mastery-row__top">' +
            '<strong>' + esc(cat.name) + '</strong>' +
            '<span class="mastery-row__count">' + cat.learned + ' of ' + cat.total + '</span>' +
          '</span>' +
          '<span class="bar mastery-row__bar"><span class="bar__fill" style="inline-size:' + pct + '%"></span></span>' +
        '</span>' +
        acc +
      '</li>';
  }

  function boxChart(boxes) {
    var max = Math.max.apply(null, boxes.concat([1]));
    var cols = boxes.map(function (count, i) {
      var h = count ? Math.max(8, Math.round((count / max) * 100)) : 0;
      var full = Scheduler.BOXES[i].label;
      return '' +
        '<div class="rev-box" title="' + esc(full) + ': ' + count + '">' +
          '<b>' + (count || '') + '</b>' +
          '<span class="rev-box__track"><i class="lvl-' + i + '" style="block-size:' + h + '%"></i></span>' +
          '<span class="rev-box__label">' + BOX_SHORT[i] + '</span>' +
        '</div>';
    }).join('');
    var total = boxes.reduce(function (a, b) { return a + b; }, 0);
    return '<div class="rev-boxes" role="img" ' +
      'aria-label="Your ' + total + ' words by box: ' +
      boxes.map(function (c, i) { return Scheduler.BOXES[i].label + ' ' + c; }).join(', ') +
      '">' + cols + '</div>';
  }

  function dayChart(days) {
    var max = Math.max.apply(null, days.map(function (d) { return d.answers; }).concat([1]));
    var todayKey = new Date().toDateString();
    var best = 0;
    days.forEach(function (d) { if (d.answers > best) { best = d.answers; } });

    var cells = days.map(function (d) {
      var date = new Date(d.t);
      var active = d.answers > 0;
      var h = active ? Math.max(14, Math.round((d.answers / max) * 100)) : 7;
      var cls = 'rev-day' + (active ? ' is-active' : '') +
        (active && d.answers === best ? ' is-best' : '') +
        (date.toDateString() === todayKey ? ' is-today' : '');
      var when = date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
      return '<div class="' + cls + '" title="' + when +
        ' · ' + d.answers + ' answers · ' + d.sessions + ' ' +
        UI.plural(d.sessions, 'session') + '">' +
        '<span class="rev-day__track"><i style="block-size:' + h + '%"></i></span>' +
        '<span class="rev-day__label">' + date.getDate() + '</span>' +
      '</div>';
    }).join('');

    return '<div class="rev-days" role="img" aria-label="Answers practised each day over the last two weeks">' +
      cells + '</div>' +
      '<p class="rev-days-cap">Answers per day, last two weeks. Today has an outline.</p>';
  }

  function needsList(items, langName) {
    if (!items.length) {
      return '<p class="rev-note">Nothing keeps tripping you up right now — misses heal as ' +
        'words climb their boxes.</p>';
    }
    return '' +
      '<ul class="summary__words work-list">' +
        items.map(function (w) {
          var native = WordDisplay.secondary(w);
          return '' +
            '<li class="sum-word">' +
              '<span class="sum-word__icon is-soft" aria-hidden="true">' + Icon('replay') + '</span>' +
              '<span class="sum-word__text">' +
                '<strong dir="auto">' + esc(WordDisplay.primary(w)) + '</strong>' +
                (native
                  ? '<span class="sum-word__native" dir="' + w.dir + '">' + esc(native) + '</span>'
                  : '') +
                '<span dir="auto">' + esc(w.meaning) + '</span>' +
              '</span>' +
              '<span class="tag">missed ' + UI.plural(w.misses, 'time') + '</span>' +
              '<span class="tag tag--accent">' + esc(Scheduler.describeBox(w.box)) + '</span>' +
            '</li>';
        }).join('') +
      '</ul>' +
      '<p class="section-footnote">These come back sooner than everything else — that is ' +
      'the scheduler earning its keep.' + (langName ? ' Practising in ' + esc(langName) + ' will surface them.' : '') + '</p>';
  }

  function historyList(sessions) {
    if (!sessions.length) {
      return '<div class="rev-note rev-note--action">' +
        '<strong>No sessions logged yet.</strong>' +
        '<p>Your first ten minutes will start filling this page.</p>' +
        '<a class="btn btn--primary btn--sm" href="#/learn">' + Icon('sparkle') + 'Start learning</a>' +
      '</div>';
    }
    return '<ul class="history-list">' + sessions.map(function (s) {
      var mode = modeInfo(s.mode);
      var scope = s.categoryId && Categories.get(s.categoryId)
        ? Categories.get(s.categoryId).name
        : 'All categories';
      var pct = s.total ? Math.round((s.correct / s.total) * 100) : 0;
      return '' +
        '<li class="hist-row">' +
          '<span class="hist-row__icon" aria-hidden="true">' + Icon(mode.icon) + '</span>' +
          '<span class="hist-row__text">' +
            '<span class="hist-row__top"><strong>' + esc(mode.name) + '</strong>' +
              '<span>· ' + esc(scope) + '</span></span>' +
            '<span class="hist-row__when">' + fmtWhen(s.at) + ' · ' +
              Activities.util.fmtClock(s.durationMs) + '</span>' +
            '<span class="bar hist-row__bar"><span class="bar__fill" style="inline-size:' + pct + '%"></span></span>' +
          '</span>' +
          '<span class="tag' + (pct >= 80 ? ' tag--accent' : '') + '">' + s.correct + '/' + s.total + '</span>' +
        '</li>';
    }).join('') + '</ul>';
  }

  /* ---- render ---------------------------------------------------------------- */

  function render(root) {
    var snap = Store.reviewSnapshot();
    var t = snap.totals;
    var lang = Store.activeLanguage();

    var head = '<header class="page-head">' +
      '<span class="eyebrow">Review</span>' +
      '<h1>How it is going.</h1>' +
      '<p>Everything here is calculated on this device, from your own sessions — no ' +
      'accounts, no cloud, just your notebook telling the truth.</p>' +
      '</header>';

    if (!t.words) {
      root.innerHTML = head + UI.emptyState({
        icon: 'review',
        title: 'Your chart starts here',
        body: 'Once you add words and finish a session, this page fills up with your ' +
              'streak, category progress and the words that need another look.',
        actions: '<a class="btn btn--primary" href="#/manage">' + Icon('plus') + 'Add your first words</a>'
      });
      return;
    }

    var tiles = '<div class="rev-tiles">' +
      tile('check', t.learned, 'words learned', { sub: 'of ' + t.words + ' collected' }) +
      tile('flame', t.streak, UI.plural(t.streak, 'day') + ' in a row', { sub: 'practice streak' }) +
      (snap.allTime.accuracy === null
        ? tile('quiz', '—', 'all-time accuracy', { sub: 'answers a session first' })
        : tile('quiz', snap.allTime.accuracy + '%', 'all-time accuracy',
            { sub: snap.allTime.answers + ' answers so far' })) +
      (snap.dueNow
        ? tile('sparkle', snap.dueNow, 'ready for review', {
            accent: true, href: '#/learn', sub: 'tap to practise them'
          })
        : tile('cards', t.words, 'in your collection', { sub: 'across ' + t.categoriesStarted + ' categories' })) +
    '</div>';

    var dark = isDark();

    var mastery =
      '<section class="rev-section" aria-labelledby="rv-mastery">' +
        '<h2 id="rv-mastery">Mastery by category</h2>' +
        '<p class="section-sub">Learned means three correct answers. Recall is how often ' +
        'you have been right about that category overall.</p>' +
        '<ul class="mastery-list">' +
          snap.categories.map(function (c) { return masteryRow(c, dark); }).join('') +
        '</ul>' +
      '</section>';

    var boxesSec =
      '<section class="rev-section" aria-labelledby="rv-boxes">' +
        '<h2 id="rv-boxes">Where your words sit</h2>' +
        '<p class="section-sub">Right answers move words up a box; misses send them back ' +
        'to the start. Higher boxes come around less often.</p>' +
        boxChart(snap.boxes) +
      '</section>';

    var daysSec =
      '<section class="rev-section" aria-labelledby="rv-days">' +
        '<h2 id="rv-days">A little, often</h2>' +
        dayChart(snap.days) +
      '</section>';

    var workSec =
      '<section class="rev-section" aria-labelledby="rv-work">' +
        '<h2 id="rv-work">Needs another look</h2>' +
        needsList(snap.needsWork, lang ? lang.name : '') +
      '</section>';

    var historySec =
      '<section class="rev-section" aria-labelledby="rv-history">' +
        '<h2 id="rv-history">Past sessions</h2>' +
        '<p class="section-sub">The latest thirty are kept on this device.</p>' +
        historyList(snap.recentSessions) +
      '</section>';

    root.innerHTML = '<div class="rev-page">' + head + tiles +
      '<div class="rev-grid">' +
        '<div class="rev-col">' + mastery + boxesSec + '</div>' +
        '<div class="rev-col">' + daysSec + workSec + historySec + '</div>' +
      '</div></div>';
  }

  global.Views = global.Views || {};
  global.Views.review = render;
})(window);
