/* ==========================================================================
   Scheduler — Lexio's learning algorithm. Deliberately simple and
   transparent: a five-box Leitner system with fixed intervals and plain,
   inspectable weights. No AI, no hidden scoring.

   How it works
   ------------
   Every word lives in a box from 0 to 5 (word.stats.box):

     box 0  "Just added / shaky"  due immediately, reappears within a session
     box 1  "Seen once"           due in 1 day
     box 2  "Getting there"       due in 2 days
     box 3  "Familiar"            due in 4 days
     box 4  "Solid"               due in 8 days
     box 5  "Mastered"            due in 16 days

   A correct answer moves a word up one box; a miss drops it straight back to
   box 0. `nextReviewAt` is always "now + interval of the new box".

   Session decks are built by weighted sampling without replacement. The
   weights are the whole "which word comes next" logic:

     never seen          weight 6   new words are welcomed in generously
     due for review      weight 10  overdue words dominate the deck
     not yet due         weight by box: 5,4,3,2 then 1 (weakest first)

   Everything above is public via Scheduler.BOXES so the Learn hub can show
   users exactly how their practice is chosen.
   ========================================================================== */
(function (global) {
  'use strict';

  var DAY = 86400000;

  var BOXES = [
    { id: 0, label: 'New',        days: 0 },
    { id: 1, label: 'Seen once',  days: 1 },
    { id: 2, label: 'Getting there', days: 2 },
    { id: 3, label: 'Familiar',   days: 4 },
    { id: 4, label: 'Solid',      days: 8 },
    { id: 5, label: 'Mastered',   days: 16 }
  ];

  function clampBox(n) {
    n = Number(n);
    if (!(n >= 0)) { return 0; }
    return Math.min(BOXES.length - 1, Math.floor(n));
  }

  /**
   * Apply one answer to a word's stats object (mutates it) and return the
   * resulting box. Pure data work — persistence stays in Store.
   * @param {object} stats  word.stats (seen/correct/incorrect/streak/box/…)
   * @param {boolean} wasCorrect
   */
  function answer(stats, wasCorrect) {
    stats.seen = (Number(stats.seen) || 0) + 1;
    if (wasCorrect) {
      stats.correct = (Number(stats.correct) || 0) + 1;
      stats.streak = (Number(stats.streak) || 0) + 1;
    } else {
      stats.incorrect = (Number(stats.incorrect) || 0) + 1;
      stats.streak = 0;
    }
    var box = clampBox(Number(stats.box) || 0);
    box = wasCorrect ? Math.min(BOXES.length - 1, box + 1) : 0;
    stats.box = box;
    stats.lastReviewedAt = new Date().toISOString();
    stats.nextReviewAt = Date.now() + BOXES[box].days * DAY;
    return box;
  }

  /** True when a word's review time has arrived (or it has never been seen). */
  function isDue(word, now) {
    now = now || Date.now();
    if (!word.stats.seen) { return false; }
    return !word.stats.nextReviewAt || word.stats.nextReviewAt <= now;
  }

  /**
   * Selection weight. Higher = more likely to be drawn into a session deck.
   * Kept as small integers on purpose: easy to explain, easy to tune.
   */
  function weight(word, now) {
    var s = word.stats;
    if (!s.seen) { return 6; }
    if (isDue(word, now)) { return 10; }
    var byBox = [0, 5, 4, 3, 2, 1];
    return byBox[clampBox(s.box)] || 1;
  }

  function pickIndex(pool) {
    var total = 0;
    var i;
    for (i = 0; i < pool.length; i++) { total += pool[i].w; }
    var roll = Math.random() * total;
    for (i = 0; i < pool.length; i++) {
      roll -= pool[i].w;
      if (roll <= 0) { return i; }
    }
    return pool.length - 1;
  }

  /**
   * Draw a session deck: weighted sampling WITHOUT replacement, so a word
   * appears at most once per session and stronger words still get the
   * occasional look-in.
   * @param {Array} words  candidate words
   * @param {number} size  maximum deck length
   */
  function buildDeck(words, size, now) {
    now = now || Date.now();
    var pool = words.map(function (w) { return { w: weight(w, now), word: w }; });
    var deck = [];
    while (pool.length && deck.length < size) {
      var picked = pool.splice(pickIndex(pool), 1)[0];
      deck.push(picked.word);
    }
    return deck;
  }

  function dueCount(words, now) {
    now = now || Date.now();
    return words.filter(function (w) { return isDue(w, now); }).length;
  }

  function describeBox(box) {
    return BOXES[clampBox(box)].label;
  }

  /** Safe read of a word's current box (0 when unknown). */
  function boxOf(word) {
    return clampBox(word && word.stats ? Number(word.stats.box) || 0 : 0);
  }

  global.Scheduler = {
    BOXES: BOXES,
    answer: answer,
    isDue: isDue,
    weight: weight,
    buildDeck: buildDeck,
    dueCount: dueCount,
    describeBox: describeBox,
    boxOf: boxOf
  };
})(window);
