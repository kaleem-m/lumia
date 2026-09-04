/* ==========================================================================
   Activity: Memory Match - a concentration grid of words and meanings.
   Flip two cards at a time. A word rates as known only if its pair is found
   before either card has appeared in a mismatch.
   ========================================================================== */
(function (global) {
  'use strict';

  var U = Activities.util;
  var PAIRS_PER_ROUND = 4;

  Activities.register({
    id: 'memory',
    name: 'Memory Match',
    icon: 'memory',
    tagline: 'Flip cards and remember where each word meets its meaning.',
    minWords: 3,
    sessionSize: PAIRS_PER_ROUND,

    create: function (stage, ctx) {
      var pairs = ctx.deck.slice(0, Math.min(PAIRS_PER_ROUND, ctx.deck.length));
      var cards = U.shuffle(pairs.reduce(function (list, word) {
        list.push({ word: word, side: 'term' }, { word: word, side: 'meaning' });
        return list;
      }, []));
      var open = [];
      var seenInMismatch = {};
      var matches = 0;
      var moves = 0;
      var locked = false;
      var startedAt = null;
      var finishedAt = null;
      var timerId = null;
      var flipBackId = null;

      var root = U.el(
        '<section class="memory" aria-label="Memory Match game">' +
          '<div class="memory__top">' +
            '<span class="tag memory__clock">' + Icon('timer') + '<b>0:00</b></span>' +
            '<span class="tag memory__moves">0 moves</span>' +
          '</div>' +
          '<p class="memory__coach">Flip two cards. Find every word-and-meaning pair.</p>' +
          '<div class="memory__grid" role="group" aria-label="Face-down memory cards"></div>' +
          '<p class="memory__status" role="status" aria-live="polite">Choose your first card.</p>' +
        '</section>');
      var grid = UI.$('.memory__grid', root);
      var clockEl = UI.$('.memory__clock b', root);
      var movesEl = UI.$('.memory__moves', root);
      var statusEl = UI.$('.memory__status', root);

      cards.forEach(function (card, i) {
        var text = card.side === 'term' ? WordDisplay.primary(card.word) : card.word.meaning;
        var secondary = card.side === 'term' ? WordDisplay.secondary(card.word) : '';
        var btn = U.el(
          '<button type="button" class="memory-card" data-index="' + i + '" ' +
            'aria-label="Card ' + (i + 1) + ', face down" aria-pressed="false">' +
            '<span class="memory-card__inner">' +
              '<span class="memory-card__face memory-card__back" aria-hidden="true">' +
                Icon('sparkle') + '<span>' + (i + 1) + '</span>' +
              '</span>' +
              '<span class="memory-card__face memory-card__front" aria-hidden="true">' +
                '<span class="memory-card__kind">' + (card.side === 'term' ? 'Word' : 'Meaning') + '</span>' +
                '<strong dir="auto">' + U.esc(text) + '</strong>' +
                (secondary ? '<small dir="' + WordDisplay.dirOf(card.word, ctx.language) + '">' +
                  U.esc(secondary) + '</small>' : '') +
              '</span>' +
            '</span>' +
          '</button>');
        grid.appendChild(btn);
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

      function setOpen(btn, isOpen) {
        var card = cards[Number(btn.dataset.index)];
        btn.classList.toggle('is-open', isOpen);
        btn.setAttribute('aria-pressed', String(isOpen));
        btn.setAttribute('aria-label', isOpen
          ? (card.side === 'term' ? 'Word: ' + WordDisplay.primary(card.word) : 'Meaning: ' + card.word.meaning)
          : 'Card ' + (Number(btn.dataset.index) + 1) + ', face down');
      }

      function choose(btn) {
        if (locked || btn.disabled || btn.classList.contains('is-open')) { return; }
        ensureTimer();
        setOpen(btn, true);
        open.push(btn);

        if (open.length === 1) {
          statusEl.textContent = 'Now choose its match.';
          return;
        }

        moves++;
        movesEl.textContent = moves + (moves === 1 ? ' move' : ' moves');
        judge();
      }

      function judge() {
        var firstBtn = open[0];
        var secondBtn = open[1];
        var first = cards[Number(firstBtn.dataset.index)];
        var second = cards[Number(secondBtn.dataset.index)];
        var matched = first.word.id === second.word.id && first.side !== second.side;

        if (matched) {
          var wordId = first.word.id;
          var firstTry = !seenInMismatch[wordId];
          firstBtn.disabled = true;
          secondBtn.disabled = true;
          firstBtn.classList.add('is-matched');
          secondBtn.classList.add('is-matched');
          firstBtn.setAttribute('aria-label', 'Matched ' + WordDisplay.primary(first.word));
          secondBtn.setAttribute('aria-label', 'Matched ' + first.word.meaning);
          open = [];
          ctx.meter.mark(matches, firstTry);
          ctx.rate(wordId, firstTry);
          matches++;
          statusEl.textContent = firstTry ? 'A clean match.' : 'Match found.';
          if (matches === pairs.length) { complete(); }
          return;
        }

        seenInMismatch[first.word.id] = true;
        seenInMismatch[second.word.id] = true;
        locked = true;
        statusEl.textContent = 'Not this pair — remember where they are.';
        firstBtn.classList.add('is-wrong');
        secondBtn.classList.add('is-wrong');
        flipBackId = global.setTimeout(function () {
          setOpen(firstBtn, false);
          setOpen(secondBtn, false);
          firstBtn.classList.remove('is-wrong');
          secondBtn.classList.remove('is-wrong');
          open = [];
          locked = false;
          statusEl.textContent = 'Choose another card.';
          firstBtn.focus();
        }, 850);
      }

      function complete() {
        finishedAt = Date.now();
        global.clearInterval(timerId);
        timerId = null;
        clockEl.textContent = U.fmtClock(finishedAt - startedAt);
        grid.classList.add('is-done');
        statusEl.textContent = 'Board cleared in ' + moves + (moves === 1 ? ' move.' : ' moves.');
        flipBackId = global.setTimeout(function () { ctx.finish(); }, 850);
      }

      grid.addEventListener('click', function (e) {
        var btn = e.target.closest('.memory-card');
        if (btn) { choose(btn); }
      });

      stage.appendChild(root);
      ctx.meter.init(pairs.length);

      return {
        teardown: function () {
          if (timerId) { global.clearInterval(timerId); }
          if (flipBackId) { global.clearTimeout(flipBackId); }
        },
        stats: function () {
          return { durationMs: finishedAt && startedAt ? finishedAt - startedAt : 0 };
        }
      };
    }
  });
})(window);
