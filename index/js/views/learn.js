/* ==========================================================================
   Learn — hub, activity runner, and session summary in one file:

   1. Hub        activity cards from the Activities registry, scoped by an
                 optional category filter, gated until the language holds
                 enough words (see registry.js GATE_MIN_WORDS).
   2. Runner     builds a weighted deck via the Scheduler, mounts the chosen
                 activity inside a shared chrome (meter, exit), records every
                 answer through Store.recordAnswer().
   3. Summary    end-of-session recap that feeds Review in Phase 5.
   ========================================================================== */
(function (global) {
  'use strict';

  var esc = UI.esc;
  var U = Activities.util;

  /* ---- shared helpers ---------------------------------------------------- */

  function scopeCategory() {
    var id = Store.settings.learnScopeId;
    return id ? Categories.get(id) : null;
  }

  function poolFor(cat) {
    return cat ? Store.words({ categoryId: cat.id }) : Store.words();
  }

  function wordRow(result, index) {
    var icon = result.correct ? Icon('check') : Icon('replay');
    return '' +
      '<li class="sum-word">' +
        '<span class="sum-word__icon' + (result.correct ? ' is-good' : ' is-soft') + '" aria-hidden="true">' + icon + '</span>' +
        '<span class="sum-word__text">' +
          '<strong dir="auto">' + esc(result.term) + '</strong>' +
          (result.native
            ? '<span class="sum-word__native" dir="' + result.dir + '">' + esc(result.native) + '</span>'
            : '') +
          '<span dir="auto">' + esc(result.meaning) + '</span>' +
        '</span>' +
        '<span class="tag' + (result.correct ? ' tag--accent' : '') + '">' +
          (result.correct ? 'Got it' : 'Again soon') + '</span>' +
      '</li>';
  }

  /* ==========================================================================
     1. HUB
     ========================================================================== */
  function render(root) {
    var lang = Store.activeLanguage();
    var cat = scopeCategory();
    var pool = poolFor(cat);
    var gate = Activities.GATE_MIN_WORDS;
    var dark = document.documentElement.dataset.theme === 'dark';
    /* The gate belongs to the whole language: it decides whether Learn is
       open at all. Once open, a scoped collection only answers to each
       activity's own minWords (enforced again inside the runner). */
    var unlocked = Store.words().length >= gate;

    var head = '<header class="page-head">' +
      '<span class="eyebrow">Learn</span>' +
      '<h1>Ten minutes, well spent.</h1>' +
      '<p>Every session is built from your own words' +
      (lang ? ' — right now, ' + esc(lang.name) : '') +
      '. Nothing is pre-loaded, so you only practise vocabulary you chose.</p>' +
      '</header>';

    var body = (!unlocked && !cat)
      ? gateHTML(pool.length, gate)
      : hubHTML(cat, pool);

    root.innerHTML =
      '<div style="' + (cat ? Categories.styleVars(cat, dark) : '') + '" class="learn-page' +
      (cat ? ' learn-page--scoped' : '') + '">' +
      head + body + '</div>';

    UI.$$('.scope-chip', root).forEach(function (chip) {
      chip.addEventListener('click', function () {
        var id = chip.dataset.scope || null;
        if ((cat && cat.id) === id || (!cat && !id)) { return; }
        Store.setSetting('learnScopeId', id);
        Router.refresh();
      });
    });
  }

  /** Encouraging gate shown below GATE_MIN_WORDS. */
  function gateHTML(count, gate) {
    var remaining = gate - count;
    var body = UI.emptyState({
      icon: 'sparkle',
      title: count === 0 ? 'No words to practise yet' : 'Just ' + remaining + ' more to go',
      body: count === 0
        ? 'Add a handful of words — even four is enough for a first session — and flashcards, quizzes and games all unlock automatically.'
        : 'You have ' + count + (count === 1 ? ' word' : ' words') + '. Add ' + remaining +
          ' more and Learn mode opens up with flashcards, quizzes and games.',
      actions: '<a class="btn btn--primary" href="#/manage">' + Icon('plus') + 'Add words</a>' +
               '<a class="btn" href="#/home">See the categories</a>'
    });

    /* The modes stay visible behind the gate so the shape of Learn is
       never a mystery. */
    var previews = '<div class="preview-grid learn-gate-grid">' +
      Activities.list().map(function (m) {
        return '' +
          '<article class="preview-card preview-card--soon">' +
            '<span class="preview-card__icon" aria-hidden="true">' + Icon(m.icon) + '</span>' +
            '<h3>' + esc(m.name) + '</h3>' +
            '<p>' + esc(m.tagline) + '</p>' +
            '<span class="tag">' + Icon('lock') + 'Needs ' + Math.max(gate, m.minWords) + '+ words</span>' +
          '</article>';
      }).join('') + '</div>';

    return body + previews;
  }

  function hubHTML(cat, pool) {
    var totals = Store.totals();
    var due = Scheduler.dueCount(pool);

    var pills = '<div class="hero__stats learn-pills">' +
      '<span class="stat-pill">' + Icon('cards') + '<b>' + pool.length + '</b><span>in play</span></span>' +
      '<span class="stat-pill">' + Icon('flame') + '<b>' + totals.streak + '</b><span>day streak</span></span>' +
      (due
        ? '<span class="stat-pill stat-pill--accent">' + Icon('sparkle') + '<b>' + due + '</b><span>due now</span></span>'
        : '') +
      '</div>';

    var chips =
      '<div class="scope-chips" role="tablist" aria-label="Practice scope">' +
        scopeChip(null, 'All words', pool.length, !cat) +
        categoriesWithWords().map(function (c) {
          return scopeChip(c.id, c.name, c.count, !!(cat && cat.id === c.id));
        }).join('') +
      '</div>';

    var cards = '<div class="preview-grid mode-grid">' +
      Activities.list().map(function (act) {
        var ready = pool.length >= act.minWords;
        var href = '#/learn/play/' + act.id + (cat ? '/category/' + cat.id : '');
        return '' +
          '<a class="mode-card' + (ready ? '' : ' mode-card--locked') + '" ' +
             (ready ? 'href="' + href + '"' : 'aria-disabled="true"') + '>' +
            '<span class="mode-card__icon" aria-hidden="true">' + Icon(act.icon) + '</span>' +
            '<span class="mode-card__body">' +
              '<span class="mode-card__name">' + esc(act.name) + '</span>' +
              '<span class="mode-card__desc">' + esc(act.tagline) + '</span>' +
              '<span class="mode-card__meta">' + (ready
                ? esc(sessionMeta(act, pool))
                : Icon('lock') + ' Needs ' + act.minWords + '+ words here') + '</span>' +
            '</span>' +
            '<span class="mode-card__go" aria-hidden="true">' + Icon('chevron') + '</span>' +
          '</a>';
      }).join('') + '</div>';

    var how = '' +
      '<details class="learn-how">' +
        '<summary>' + Icon('info') + 'How Lexio picks what you practise</summary>' +
        '<p>Each word lives in one of five boxes. A right answer moves it up a box and pushes ' +
        'its next review further away; a miss sends it straight back to the start. Words that ' +
        'are due lead the deck, brand-new words get a warm welcome, and strong ones drop by ' +
        'less often.</p>' +
        '<ul class="learn-how__boxes">' +
          Scheduler.BOXES.map(function (b) {
            return '<li><b>' + b.label + '</b><span>' +
              (b.days === 0 ? 'due immediately' : 'again in ' + b.days + (b.days === 1 ? ' day' : ' days')) +
              '</span></li>';
          }).join('') +
        '</ul>' +
      '</details>';

    return pills + chips + cards + how;
  }

  function categoriesWithWords() {
    var counts = {};
    Store.words().forEach(function (w) { counts[w.categoryId] = (counts[w.categoryId] || 0) + 1; });
    return Categories.all
      .filter(function (c) { return counts[c.id]; })
      .map(function (c) { return { id: c.id, name: c.name, count: counts[c.id], icon: c.icon }; });
  }

  function scopeChip(id, label, count, selected) {
    return '' +
      '<button type="button" class="scope-chip' + (selected ? ' is-active' : '') + '" ' +
        'data-scope="' + (id || '') + '" role="tab" aria-selected="' + !!selected + '">' +
        esc(label) + '<b>' + count + '</b>' +
      '</button>';
  }

  function sessionMeta(act, pool) {
    var n = Math.min(act.sessionSize, pool.length);
    if (act.id === 'match') { return Math.min(5, pool.length) + ' pairs on the board'; }
    if (act.id === 'memory') { return Math.min(4, pool.length) + ' pairs to remember'; }
    if (act.id === 'quiz') { return n + ' ' + UI.plural(n, 'question'); }
    if (act.id === 'type-it') { return n + ' words to recall and type'; }
    return n + ' ' + UI.plural(n, 'card') + ', weighted for you';
  }

  /* ==========================================================================
     2. RUNNER
     ========================================================================== */
  function renderPlay(root, params) {
    var act = Activities.get(params.mode);
    if (!act) { Router.go('/learn', true); return; }

    var cat = params.categoryId ? Categories.get(params.categoryId) : null;
    if (params.categoryId && !cat) { Router.go('/learn', true); return; }

    var pool = poolFor(cat);
    if (pool.length < act.minWords) {
      root.innerHTML = '<div class="session session--gate">' + UI.emptyState({
        icon: act.icon,
        title: 'A few short of a session',
        body: act.name + ' needs at least ' + act.minWords + ' words' +
          (cat ? ' in ' + esc(cat.name) : '') + ' — you have ' + pool.length + '. ' +
          'A quick trip to Manage Words fixes that.',
        actions: (cat
            ? '<a class="btn btn--primary" href="#/manage/category/' + cat.id + '">' + Icon('plus') + 'Add ' + esc(cat.name) + ' words</a>'
            : '<a class="btn btn--primary" href="#/manage">' + Icon('plus') + 'Add words</a>') +
          '<a class="btn" href="#/learn">Back to Learn</a>'
      }) + '</div>';
      return;
    }

    var lang = Store.activeLanguage();
    var deck = Scheduler.buildDeck(pool, act.sessionSize);
    var startedAt = Date.now();
    var tally = { total: 0, correct: 0, results: [] };
    var controller = null;
    var finished = false;

    var meterStates = [];
    var meterEl = null;

    root.innerHTML = '' +
      '<div class="session">' +
        '<header class="session-head">' +
          '<button type="button" class="icon-btn session-exit" aria-label="Leave this session">' +
            '<span class="flip-rtl">' + Icon('back') + '</span></button>' +
          '<div class="session-head__title">' +
            '<span class="eyebrow">' + esc(act.name) + '</span>' +
            '<strong>' + esc(scopeLabel(cat, lang)) + '</strong>' +
          '</div>' +
          '<span class="tag tag--accent" id="session-meter-label" hidden></span>' +
        '</header>' +
        '<div class="session-meter" id="session-meter"></div>' +
        '<div class="session-stage" id="session-stage"></div>' +
      '</div>';

    var stageEl = document.getElementById('session-stage');
    meterEl = document.getElementById('session-meter');

    var ctx = {
      deck: deck,
      pool: pool,
      language: lang,
      category: cat,

      meter: {
        init: function (total) {
          /* Array.from, not `new Array(n)`: map skips holes in sparse
             arrays, which silently produced an empty meter. */
          meterStates = Array.from({ length: total });
          meterEl.innerHTML =
            '<span class="session-meter__dots" aria-hidden="true">' +
              meterStates.map(function (_, i) {
                return '<i class="is-now" data-i="' + i + '"></i>';
              }).join('') +
            '</span>';
          var label = document.getElementById('session-meter-label');
          label.hidden = false;
          label.textContent = '1 of ' + total;
          paint(0);
        },
        mark: function (index, wasCorrect) {
          meterStates[index] = wasCorrect;
          paint(index + 1 <= meterStates.length - 1 ? index + 1 : -1);
        },
        hide: function () {
          meterEl.hidden = true;
          var label = document.getElementById('session-meter-label');
          if (label) { label.hidden = true; }
        }
      },

      rate: function (wordId, wasCorrect) {
        Store.recordAnswer(wordId, wasCorrect);
        var word = Store.getWord(wordId);
        tally.total++;
        if (wasCorrect) { tally.correct++; }
        tally.results.push({
          id: wordId,
          term: WordDisplay.primary(word),
          native: WordDisplay.secondary(word),
          meaning: word.meaning,
          dir: WordDisplay.dirOf(word, lang),
          correct: wasCorrect
        });
      },

      finish: function () {
        finished = true;
        var durationMs = Date.now() - startedAt;
        var extra = controller && typeof controller.stats === 'function' ? controller.stats() : {};
        Store.finishSession({
          mode: act.id,
          categoryId: cat ? cat.id : null,
          total: tally.total,
          correct: tally.correct,
          durationMs: extra.durationMs || durationMs
        });
        teardownActivity();
        showSummary(root, { act: act, cat: cat, tally: tally, durationMs: extra.durationMs || durationMs });
      },

      exit: promptExit
    };

    function paint(activeIndex) {
      var dots = UI.$$('.session-meter__dots i', meterEl);
      var done = 0;
      dots.forEach(function (dot, i) {
        dot.classList.remove('is-now');
        if (meterStates[i] === true) { dot.classList.add('is-good'); done++; }
        else if (meterStates[i] === false) { dot.classList.add('is-soft'); done++; }
        else if (i === activeIndex) { dot.classList.add('is-now'); }
      });
      var label = document.getElementById('session-meter-label');
      if (label && !label.hidden && meterStates.length) {
        label.textContent = Math.min(done + 1, meterStates.length) + ' of ' + meterStates.length;
      }
    }

    function scopeLabel(catRef, langRef) {
      if (catRef) { return catRef.name; }
      return langRef ? langRef.name : 'All categories';
    }

    function promptExit() {
      if (finished) { leave(); return; }
      if (!tally.total) { leave(); return; }
      /* A modal sheet owns Escape while it is open (e.g. this very confirm). */
      if (document.querySelector('.modal')) { return; }
      UI.confirm({
        title: 'End this session?',
        description: 'No problem — everything you have answered so far is already saved.',
        confirmText: 'End session',
        cancelText: 'Keep going'
      }, leave);
    }

    function leave() {
      Router.go(cat ? '/category/' + cat.id : '/learn');
    }

    root.querySelector('.session-exit').addEventListener('click', promptExit);
    var detachKeys = U.onKeys({ 'Escape': function () { promptExit(); } });

    controller = act.create(stageEl, ctx);

    function teardownActivity() {
      detachKeys();
      if (controller && typeof controller.teardown === 'function') { controller.teardown(); }
      controller = null;
    }

    return teardownActivity;
  }

  /* ==========================================================================
     3. SUMMARY
     ========================================================================== */
  function showSummary(root, o) {
    var t = o.tally;
    var pct = t.total ? Math.round((t.correct / t.total) * 100) : 100;
    var wrong = t.total - t.correct;

    var mood = pct === 100
      ? { title: 'Flawless round.', sub: 'Every single answer landed. The boxes will remember.' }
      : pct >= 80
        ? { title: 'Strong session.', sub: 'Most of them stuck. The wobbly ones come back sooner.' }
        : pct >= 50
          ? { title: 'Good, honest work.', sub: 'This is exactly how words move into long-term memory.' }
          : { title: 'Seeds planted.', sub: 'Tricky words return first — that is the system doing its job.' };

    var html = '' +
      '<section class="summary" aria-label="Session summary">' +
        '<div class="summary__hero">' +
          '<span class="summary__badge" aria-hidden="true">' +
            Icon(pct === 100 && t.total > 0 ? 'trophy' : o.act.icon) + '</span>' +
          '<span class="eyebrow">' + esc(o.act.name) + ' complete</span>' +
          '<h1>' + mood.title + '</h1>' +
          '<p>' + mood.sub + '</p>' +
        '</div>' +
        '<div class="summary__stats">' +
          sumStat(t.total, 'practised') +
          sumStat(t.correct, 'got it') +
          sumStat(wrong, 'again soon') +
          sumStat(U.fmtClock(o.durationMs), 'of your time') +
        '</div>' +
        '<div class="summary__ring-wrap"><span class="bar summary__bar"><span class="bar__fill" style="inline-size:' +
          pct + '%"></span></span><span class="summary__pct">' + pct + '%</span></div>' +
        (t.results.length
          ? '<ul class="summary__words">' + t.results.map(wordRow).join('') + '</ul>'
          : '') +
        '<div class="summary__actions">' +
          '<button type="button" class="btn btn--primary" data-sum="again">' + Icon('replay') + 'Practise again</button>' +
          '<a class="btn btn--soft" href="#/review">' + Icon('review') + 'See progress</a>' +
          '<a class="btn" href="#/learn">Choose something else</a>' +
        '</div>' +
      '</section>';

    root.innerHTML = html;

    UI.$('[data-sum="again"]', root).addEventListener('click', function () {
      Router.refresh();   /* re-runs the runner: a freshly weighted deck */
    });

    function sumStat(value, label) {
      return '<div class="summary__stat"><b>' + value + '</b><span>' + esc(label) + '</span></div>';
    }
  }

  global.Views = global.Views || {};
  global.Views.learn = render;
  global.Views.learnPlay = renderPlay;
})(window);
