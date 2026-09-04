/* ==========================================================================
   Activity: Type It - produce the target word from its meaning.
   Answers are checked after Unicode normalization and whitespace/case cleanup.
   Both the transliterated spelling and optional native spelling are accepted.
   ========================================================================== */
(function (global) {
  'use strict';

  var U = Activities.util;
  var MAX_QUESTIONS = 10;

  Activities.register({
    id: 'type-it',
    name: 'Type It',
    icon: 'edit',
    tagline: 'See the meaning, then recall and type the word yourself.',
    minWords: 1,
    sessionSize: MAX_QUESTIONS,

    create: function (stage, ctx) {
      var words = ctx.deck.slice(0, MAX_QUESTIONS);
      var index = 0;
      var answered = false;
      var score = 0;

      var root = U.el(
        '<section class="type-it" aria-label="Type It spelling practice">' +
          '<div class="type-it__top"><span class="tag tag--accent type-it__score"></span></div>' +
          '<div class="type-it__card"></div>' +
        '</section>');
      var card = UI.$('.type-it__card', root);
      var scoreEl = UI.$('.type-it__score', root);

      function normalize(value) {
        var text = String(value || '').trim().replace(/\s+/g, ' ');
        if (text.normalize) { text = text.normalize('NFC'); }
        return text.toLocaleLowerCase();
      }

      function answersFor(word) {
        var values = [word.term, word.nativeScript].filter(Boolean).map(normalize);
        return values.filter(function (value, i) { return value && values.indexOf(value) === i; });
      }

      function updateScore() {
        scoreEl.textContent = score + '/' + words.length + ' correct';
      }

      function renderQuestion() {
        if (index >= words.length) { ctx.finish(); return; }
        answered = false;
        var word = words[index];
        var languageName = ctx.language ? ctx.language.name : 'the language';

        card.innerHTML =
          '<div class="type-it__prompt">' +
            '<span class="eyebrow">How do you say this in ' + U.esc(languageName) + '?</span>' +
            '<strong dir="auto">' + U.esc(word.meaning) + '</strong>' +
          '</div>' +
          '<form class="type-it__form" novalidate>' +
            '<label class="type-it__label" for="type-it-answer">Type the word from memory</label>' +
            '<div class="type-it__answer-row">' +
              '<input class="type-it__input" id="type-it-answer" name="answer" type="text" ' +
                'autocomplete="off" autocapitalize="off" spellcheck="false" dir="auto" ' +
                'aria-describedby="type-it-feedback">' +
              '<button type="submit" class="btn btn--primary type-it__submit">Check</button>' +
            '</div>' +
            '<p class="type-it__feedback" id="type-it-feedback" role="status" aria-live="polite">' +
              'Spelling counts — take your time.' +
            '</p>' +
          '</form>';

        var form = UI.$('.type-it__form', card);
        var input = UI.$('.type-it__input', card);
        form.addEventListener('submit', submit);
        global.setTimeout(function () { input.focus(); }, 0);
      }

      function submit(e) {
        e.preventDefault();
        if (answered) { next(); return; }

        var word = words[index];
        var input = UI.$('.type-it__input', card);
        var feedback = UI.$('.type-it__feedback', card);
        var button = UI.$('.type-it__submit', card);
        var value = normalize(input.value);

        if (!value) {
          feedback.textContent = 'Type an answer before checking.';
          input.focus();
          return;
        }

        answered = true;
        var correct = answersFor(word).indexOf(value) !== -1;
        var primary = WordDisplay.primary(word);
        var secondary = WordDisplay.secondary(word);

        input.disabled = true;
        input.classList.add(correct ? 'is-correct' : 'is-wrong');
        button.textContent = index === words.length - 1 ? 'See results' : 'Next word';
        feedback.classList.add(correct ? 'is-correct' : 'is-wrong');
        feedback.innerHTML = correct
          ? '<strong>Exactly.</strong> You recalled it.'
          : '<strong>Answer:</strong> <span dir="auto">' + U.esc(primary) + '</span>' +
            (secondary ? ' <span class="type-it__native" dir="' +
              WordDisplay.dirOf(word, ctx.language) + '">(' + U.esc(secondary) + ')</span>' : '');

        if (correct) { score++; }
        ctx.meter.mark(index, correct);
        ctx.rate(word.id, correct);
        updateScore();
        button.focus();
      }

      function next() {
        index++;
        updateScore();
        renderQuestion();
      }

      stage.appendChild(root);
      ctx.meter.init(words.length);
      updateScore();
      renderQuestion();

      return { teardown: function () {} };
    }
  });
})(window);
