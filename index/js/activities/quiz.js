/* ==========================================================================
   Activity: Quiz - multiple choice in both directions.
   Half the questions ask "what does this mean?", half ask "how do you say
   it?". Distractors are drawn from the user's own words, favouring the same
   category so wrong answers stay plausible. Instant feedback, then on.
   ========================================================================== */
(function (global) {
  'use strict';

  var U = Activities.util;
  var MAX_QUESTIONS = 10;
  var OPTIONS = 4;

  Activities.register({
    id: 'quiz',
    name: 'Quiz',
    icon: 'quiz',
    tagline: 'Pick the right pair from your own words - both ways round.',
    minWords: 4,
    sessionSize: 10,

    create: function (stage, ctx) {
      var questions = buildQuestions();
      var index = -1;
      var busy = false;
      var score = 0;

      var root = U.el(
        '<section class="quiz" aria-label="Quiz">' +
          '<div class="quiz-top"><span class="tag tag--accent quiz-score"></span></div>' +
          '<div class="quiz-body"></div>' +
        '</section>');
      var body = UI.$('.quiz-body', root);
      var scoreEl = UI.$('.quiz-score', root);

      function buildQuestions() {
        return ctx.deck.slice(0, MAX_QUESTIONS).map(function (word) {
          return { word: word, toMeaning: Math.random() < 0.5 };
        });
      }

      /** One selectable answer — matched by word id, rendered for humans. */
      function optionFor(word, field) {
        if (field === 'meaning') {
          return { id: word.id, text: word.meaning, native: '', dir: 'auto' };
        }
        return {
          id: word.id,
          text: WordDisplay.primary(word),
          native: WordDisplay.secondary(word),
          dir: WordDisplay.dirOf(word, ctx.language)
        };
      }

      /** The answer plus up to three plausible distractors, shuffled. */
      function buildOptions(word, toMeaning) {
        var field = toMeaning ? 'meaning' : 'term';
        var answer = optionFor(word, field);
        var seen = {};
        seen[answer.text.toLocaleLowerCase()] = true;

        var sameCat = ctx.pool.filter(function (w) {
          return w.id !== word.id && w.categoryId === word.categoryId;
        });
        var otherCat = ctx.pool.filter(function (w) {
          return w.id !== word.id && w.categoryId !== word.categoryId;
        });

        var distractors = [];
        [U.shuffle(sameCat), U.shuffle(otherCat)].some(function (group) {
          for (var i = 0; i < group.length && distractors.length < OPTIONS - 1; i++) {
            var candidate = optionFor(group[i], field);
            var key = candidate.text.toLocaleLowerCase();
            if (!key || seen[key]) { continue; }
            seen[key] = true;
            distractors.push(candidate);
          }
          return distractors.length >= OPTIONS - 1;
        });

        return U.shuffle([answer].concat(distractors));
      }

      function showScore() {
        scoreEl.textContent = score + '/' + questions.length + ' correct';
      }

      function renderQuestion() {
        index++;
        if (index >= questions.length) { ctx.finish(); return; }

        var q = questions[index];
        q.options = buildOptions(q.word, q.toMeaning);

        var promptText = q.toMeaning ? WordDisplay.primary(q.word) : q.word.meaning;
        var promptNative = q.toMeaning ? WordDisplay.secondary(q.word) : '';

        body.innerHTML =
          '<div class="quiz-prompt">' +
            '<span class="eyebrow">' +
              (q.toMeaning ? 'What does this mean?' : 'How do you say it?') +
            '</span>' +
            '<span class="quiz-prompt__text" dir="auto">' + U.esc(promptText) + '</span>' +
            (promptNative
              ? '<span class="quiz-prompt__native" dir="' +
                  WordDisplay.dirOf(q.word, ctx.language) + '">' + U.esc(promptNative) + '</span>'
              : '') +
          '</div>' +
          '<div class="quiz-options" role="group" aria-label="Answers">' +
            q.options.map(function (opt, n) {
              return '<button type="button" class="quiz-opt" data-n="' + n + '">' +
                '<span class="quiz-opt__key" aria-hidden="true">' + (n + 1) + '</span>' +
                '<span class="quiz-opt__body">' +
                  '<span class="quiz-opt__text" dir="auto">' + U.esc(opt.text) + '</span>' +
                  (opt.native
                    ? '<span class="quiz-opt__native" dir="' + opt.dir + '">' +
                        U.esc(opt.native) + '</span>'
                    : '') +
                '</span>' +
              '</button>';
            }).join('') +
          '</div>' +
          '<p class="quiz-note" role="status" aria-live="polite"></p>';

        UI.$$('.quiz-opt', body).forEach(function (btn) {
          btn.addEventListener('click', function () { choose(Number(btn.dataset.n)); });
        });
      }

      function choose(n) {
        if (busy || !questions[index] || !questions[index].options) { return; }
        if (document.querySelector('.modal')) { return; }   /* shortcuts pause */
        busy = true;

        var q = questions[index];
        var picked = q.options[n];
        var correct = !!picked && picked.id === q.word.id;

        UI.$$('.quiz-opt', body).forEach(function (btn, i) {
          btn.disabled = true;
          if (q.options[i].id === q.word.id) { btn.classList.add('is-correct'); }
          else if (i === n) { btn.classList.add('is-wrong'); }
        });

        var note = UI.$('.quiz-note', body);
        note.textContent = correct
          ? ['Nice.', 'Exactly.', 'That is the one.'][index % 3]
          : 'Almost - the highlighted answer is right.';
        if (correct) { score++; }
        showScore();

        ctx.meter.mark(index, correct);
        ctx.rate(q.word.id, correct);

        global.setTimeout(function () {
          busy = false;
          renderQuestion();
        }, correct ? 750 : 1150);
      }

      /* Number keys answer; buttons handle their own Enter/Space. */
      var detachKeys = U.onKeys({
        '1': function () { choose(0); },
        '2': function () { choose(1); },
        '3': function () { choose(2); },
        '4': function () { choose(3); }
      });

      stage.appendChild(root);
      ctx.meter.init(Math.min(questions.length, MAX_QUESTIONS));
      showScore();
      renderQuestion();

      return {
        teardown: function () { detachKeys(); }
      };
    }
  });
})(window);
