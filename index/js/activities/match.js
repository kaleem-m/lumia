/* ==========================================================================
   Activity: Match-up - pair words with their meanings against the clock.
   Tap one tile from each column; a correct pair locks in with a gentle
   pulse, a slip shakes and clears. A pair matched on the first attempt
   rates as "got it"; any slips rate it as "still learning" (once, at match
   time - the scheduler only ever sees one answer per word per session).
   ========================================================================== */
(function (global) {
  'use strict';

  var U = Activities.util;
  var PAIRS_PER_ROUND = 5;

  Activities.register({
    id: 'match',
    name: 'Match-up',
    icon: 'game',
    tagline: 'A quick, gentle race: pair every word with its meaning.',
    minWords: 3,
    sessionSize: PAIRS_PER_ROUND,

    create: function (stage, ctx) {
      var pairs = ctx.deck.slice(0, Math.max(3, Math.min(PAIRS_PER_ROUND, ctx.deck.length)));
      var terms = U.shuffle(pairs);
      var meanings = U.shuffle(pairs);

      var selected = { term: null, meaning: null };
      var attempts = {};
      var matchedCount = 0;
      var mistakes = 0;
      var startedAt = null;
      var finishedAt = null;
      var timerId = null;

      var root = U.el(
        '<section class="match" aria-label="Match-up game">' +
          '<div class="match-top">' +
            '<span class="tag match-clock">' + Icon('timer') + '<b>0:00</b></span>' +
            '<span class="tag match-slips">No slips yet</span>' +
          '</div>' +
          '<p class="match-coach">Tap a word, then its meaning.</p>' +
          '<div class="match-board">' +
            '<div class="match-col"></div>' +
            '<div class="match-col"></div>' +
          '</div>' +
        '</section>');

      var cols = UI.$$('.match-col', root);
      var clockEl = UI.$('.match-clock b', root);
      var slipsEl = UI.$('.match-slips', root);
      var board = UI.$('.match-board', root);

      function tile(word, side) {
        var native = side === 'term' ? WordDisplay.secondary(word) : '';
        var text = side === 'term' ? WordDisplay.primary(word) : word.meaning;
        return U.el(
          '<button type="button" class="match-tile" data-id="' + U.esc(word.id) + '" ' +
            'data-side="' + side + '"' +
            (native ? ' title="' + U.esc(native) + '"' : '') + '>' +
            '<span dir="auto">' + U.esc(text) + '</span>' +
          '</button>');
      }

      pairs.forEach(function (_, i) {
        cols[0].appendChild(tile(terms[i], 'term'));
        cols[1].appendChild(tile(meanings[i], 'meaning'));
      });

      function tick() {
        if (!startedAt || finishedAt) { return; }
        clockEl.textContent = U.fmtClock(Date.now() - startedAt);
      }

      function ensureTimer() {
        if (startedAt) { return; }
        startedAt = Date.now();
        timerId = global.setInterval(tick, 1000);
      }

      function updateSlips() {
        slipsEl.textContent = mistakes === 0
          ? 'No slips yet'
          : mistakes + (mistakes === 1 ? ' slip' : ' slips');
      }

      function clearSelection() {
        ['term', 'meaning'].forEach(function (side) {
          if (selected[side]) { selected[side].classList.remove('is-picked'); }
          selected[side] = null;
        });
      }

      function onTile(btn) {
        if (btn.disabled) { return; }
        ensureTimer();
        var side = btn.dataset.side;

        if (selected[side] === btn) {           /* tapped the same tile again */
          btn.classList.remove('is-picked');
          selected[side] = null;
          return;
        }
        if (selected[side]) { selected[side].classList.remove('is-picked'); }
        selected[side] = btn;
        btn.classList.add('is-picked');

        if (!selected.term || !selected.meaning) { return; }
        judge();
      }

      function judge() {
        var a = selected.term, b = selected.meaning;
        var hit = a.dataset.id === b.dataset.id;
        var wordId = a.dataset.id;

        if (!hit) {
          mistakes++;
          updateSlips();
          a.classList.add('is-wrong');
          b.classList.add('is-wrong');
          clearSelection();
          global.setTimeout(function () {
            a.classList.remove('is-wrong');
            b.classList.remove('is-wrong');
          }, 430);
          return;
        }

        /* First-try matches count as known; anything else is still learning. */
        attempts[wordId] = (attempts[wordId] || 0) + 1;
        var firstTry = attempts[wordId] === 1;

        a.classList.add('is-matched');
        b.classList.add('is-matched');
        a.disabled = true;
        b.disabled = true;
        clearSelection();

        ctx.meter.mark(matchedCount, firstTry);
        ctx.rate(wordId, firstTry);
        matchedCount++;

        if (matchedCount === pairs.length) { complete(); }
      }

      function complete() {
        finishedAt = Date.now();
        global.clearInterval(timerId); timerId = null;
        clockEl.textContent = U.fmtClock(finishedAt - startedAt);
        board.classList.add('is-done');
        global.setTimeout(function () { ctx.finish(); }, 650);
      }

      root.addEventListener('click', function (e) {
        var btn = e.target.closest('.match-tile');
        if (btn) { onTile(btn); }
      });

      stage.appendChild(root);
      ctx.meter.hide();
      updateSlips();

      return {
        teardown: function () {
          if (timerId) { global.clearInterval(timerId); }
        },
        stats: function () {
          return { durationMs: finishedAt && startedAt ? finishedAt - startedAt : 0 };
        }
      };
    }
  });
})(window);
