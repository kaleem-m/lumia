/* ==========================================================================
   Activity: Flashcards — flip term ↔ meaning, then self-rate.
   Input: click/tap the card, Space, or swipe. Rating: buttons, ←/→ keys,
   or swipe left ("still learning") / right ("got it").
   ========================================================================== */
(function (global) {
  'use strict';

  var U = Activities.util;

  Activities.register({
    id: 'flashcards',
    name: 'Flashcards',
    icon: 'cards',
    tagline: 'Flip each card, then be honest: got it, or still learning.',
    minWords: 1,
    sessionSize: 12,

    create: function (stage, ctx) {
      var deck = ctx.deck;
      var index = 0;
      var flipped = false;
      var busy = false;
      var lastDx = 0;

      var root = U.el(
        '<section class="fc" aria-label="Flashcards">' +
          '<div class="fc-stage">' +
            '<div class="fc-card" tabindex="0" role="button" aria-pressed="false">' +
              '<div class="fc-card__inner">' +
                '<div class="fc-card__face fc-card__face--front">' +
                  '<span class="fc-card__eyebrow">Term</span>' +
                  '<span class="fc-card__term"></span>' +
                  '<span class="fc-card__native" hidden></span>' +
                  '<span class="fc-card__coach">' + Icon('flip') + '<span>tap to flip</span></span>' +
                '</div>' +
                '<div class="fc-card__face fc-card__face--back">' +
                  '<span class="fc-card__eyebrow">Meaning</span>' +
                  '<span class="fc-card__term fc-card__term--back"></span>' +
                  '<span class="fc-card__example" hidden></span>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="fc-actions">' +
            '<button type="button" class="btn fc-rate fc-rate--still">' +
              '<span class="rate-icon rate-icon--left" aria-hidden="true">&#8592;</span>Still learning</button>' +
            '<button type="button" class="btn btn--primary fc-rate fc-rate--got">' +
              'Got it<span class="rate-icon" aria-hidden="true">&#8594;</span></button>' +
          '</div>' +
          '<p class="session-kbd" aria-hidden="true">' +
            '<span class="kbd">space</span> flip&ensp;<span class="kbd">&larr;</span> still learning&ensp;' +
            '<span class="kbd">&rarr;</span> got it</p>' +
        '</section>');

      var card = UI.$('.fc-card', root);
      var frontTerm = UI.$('.fc-card__face--front .fc-card__term', root);
      var frontNative = UI.$('.fc-card__native', root);
      var backTerm = UI.$('.fc-card__term--back', root);
      var example = UI.$('.fc-card__example', root);

      function fillCard() {
        var word = deck[index];
        var dir = WordDisplay.dirOf(word, ctx.language);

        frontTerm.textContent = WordDisplay.primary(word);
        frontTerm.setAttribute('dir', 'auto');
        frontTerm.classList.toggle('is-long', WordDisplay.primary(word).length > 16);

        var native = WordDisplay.secondary(word);
        frontNative.hidden = !native;
        if (native) {
          frontNative.textContent = native;
          frontNative.setAttribute('dir', dir);
        }

        backTerm.textContent = word.meaning;
        backTerm.setAttribute('dir', 'auto');

        example.hidden = !word.example;
        example.textContent = word.example ? '\u201C' + word.example + '\u201D' : '';
        example.setAttribute('dir', dir);

        card.classList.remove('is-flipped');
        flipped = false;
        syncPressed();

        card.setAttribute('aria-label',
          'Card ' + (index + 1) + ' of ' + deck.length + '. Front: ' +
          WordDisplay.primary(word) + '. Activate to reveal the meaning.');
      }

      function syncPressed() {
        card.setAttribute('aria-pressed', flipped ? 'true' : 'false');
      }

      function flip() {
        if (busy || modalOpen()) { return; }
        flipped = !flipped;
        card.classList.toggle('is-flipped', flipped);
        syncPressed();
      }

      function rate(wasCorrect) {
        if (busy || modalOpen()) { return; }
        busy = true;
        var word = deck[index];
        ctx.meter.mark(index, wasCorrect);
        ctx.rate(word.id, wasCorrect);
        card.classList.add(wasCorrect ? 'fly-got' : 'fly-still');
        global.setTimeout(function () { advance(); }, 240);
      }

      function advance() {
        busy = false;
        index++;
        if (index >= deck.length) { ctx.finish(); return; }
        card.classList.remove('fly-got', 'fly-still', 'is-flipped');
        void card.offsetWidth;               /* restart the enter animation */
        card.classList.add('enter');
        fillCard();
        global.setTimeout(function () { card.classList.remove('enter'); }, 280);
        card.focus({ preventScroll: true });
      }

      function release() {
        card.classList.remove('drag-still', 'drag-got');
        card.style.transition = '';
        card.style.transform = '';
      }

      /* ---- interactions --------------------------------------------------- */
      root.addEventListener('click', function (e) {
        if (e.target.closest('.fc-rate')) {
          rate(e.target.closest('.fc-rate--got') !== null);
          return;
        }
        if (Math.abs(lastDx) > 12) { lastDx = 0; return; }   /* end of a drag */
        flip();
      });

      var detachKeys = U.onKeys({
        ' ': function (e) { if (onButton(e)) { return; } e.preventDefault(); flip(); },
        'ArrowUp': function (e) { if (onButton(e)) { return; } e.preventDefault(); flip(); },
        'Enter': function (e) { if (onButton(e)) { return; } e.preventDefault(); flip(); },
        'ArrowLeft': function (e) { e.preventDefault(); rate(false); },
        '1': function () { rate(false); },
        'ArrowRight': function (e) { e.preventDefault(); rate(true); },
        '2': function () { rate(true); }
      });

      /* Rate buttons handle their own activation — don't double-fire flips. */
      function onButton(e) {
        return !!(e.target && e.target.closest && e.target.closest('button'));
      }

      /* Keyboard shortcuts pause while a modal sheet is open. */
      function modalOpen() { return !!document.querySelector('.modal'); }

      var detachSwipe = U.swipe(UI.$('.fc-stage', root), {
        onStart: function () {
          if (busy) { return; }
          lastDx = 0;
          card.style.transition = 'none';
        },
        onMove: function (dx) {
          if (busy) { return; }
          lastDx = dx;
          card.style.transform = 'translateX(' + dx + 'px) rotate(' + (dx * 0.05) + 'deg)';
          card.classList.toggle('drag-still', dx < -26);
          card.classList.toggle('drag-got', dx > 26);
        },
        onCancel: release,
        onEnd: function (dx) {
          if (!busy) {
            if (dx < -84) { release(); rate(false); return; }
            if (dx > 84) { release(); rate(true); return; }
          }
          release();
        }
      });

      stage.appendChild(root);
      ctx.meter.init(deck.length);
      fillCard();
      card.classList.add('enter');
      global.setTimeout(function () {
        card.classList.remove('enter');
        card.focus({ preventScroll: true });
      }, 60);

      return {
        teardown: function () {
          detachKeys();
          detachSwipe();
        }
      };
    }
  });
})(window);
