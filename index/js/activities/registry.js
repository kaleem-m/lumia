/* ==========================================================================
   Activities — the Learn-mode plugin registry.

   Every learning activity (flashcards today; anything tomorrow) registers
   itself here and instantly appears on the Learn hub. Adding a game later
   means writing one file that calls Activities.register() — no changes to
   the hub, the router or the scheduler are needed.

   An activity definition looks like:

     Activities.register({
       id:        'flashcards',        // stable id, used in routes
       name:      'Flashcards',
       icon:      'cards',             // key in js/icons.js
       tagline:   'Tap to flip…',      // one calm sentence for the hub card
       minWords:  1,                   // smallest pool this game makes sense with
       sessionSize: 12,                // preferred deck length (scheduler caps it)
       create: function (stage, ctx) {
         // build your DOM inside stage, wire interactions
         return { teardown: detachMyListeners };
       }
     });

   The `ctx` handed to create():
     deck        words chosen by the Scheduler for THIS session (ordered)
     pool        every candidate word in scope (use for distractors)
     language    active language object (may be null)
     category    category object when scoped, else null
     rate(id, correct)   record one answer — never touch Store directly
     finish()            declare the session complete (runner shows summary)
     exit()              ask to leave mid-session

   Gating decision (documented): Learn unlocks GLOBALLY once the active
   language holds at least GATE_MIN_WORDS words — one rule, easy to explain.
   The hub's category scope then narrows practice, and each activity's
   minWords is enforced again at launch, so small scoped collections degrade
   gracefully instead of dead-ending.
   ========================================================================== */
(function (global) {
  'use strict';

  var defs = [];
  var byId = {};

  /** Minimum words across the active language before Learn unlocks at all. */
  var GATE_MIN_WORDS = 4;

  function register(def) {
    if (!def || !def.id || typeof def.create !== 'function') {
      throw new Error('[Lexio] Activity needs an id and create().');
    }
    if (byId[def.id]) { return byId[def.id]; }
    def.minWords = Math.max(1, Number(def.minWords) || 1);
    def.sessionSize = Math.max(1, Number(def.sessionSize) || 12);
    defs.push(def);
    byId[def.id] = def;
    return def;
  }

  /* ---- Shared utilities --------------------------------------------------
     Small, dependency-free helpers every activity tends to need, kept in
     one place so games stay focused on their own mechanics.
     ---------------------------------------------------------------------- */
  var util = {

    esc: UI.esc,

    /** Fisher–Yates on a copy; never mutates the input. */
    shuffle: function (list) {
      var out = list.slice();
      for (var i = out.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    },

    /** Resolve display direction for a word, falling back to its language. */
    dirOf: function (word, language) {
      if (word.dir === 'rtl' || word.dir === 'ltr') { return word.dir; }
      if (language && (language.dir === 'rtl' || language.dir === 'ltr')) {
        return language.dir;
      }
      return 'auto';
    },

    /** Build a detached element from an HTML string. */
    el: function (html) {
      var tpl = document.createElement('template');
      tpl.innerHTML = html.trim();
      return tpl.content.firstElementChild;
    },

    /**
     * Bind keyboard shortcuts. `map` keys are e.key values (' ' allowed).
     * Returns a teardown that detaches everything.
     */
    onKeys: function (map) {
      function onKey(e) {
        var fn = map[e.key];
        if (fn) { fn(e); }
      }
      document.addEventListener('keydown', onKey);
      return function () { document.removeEventListener('keydown', onKey); };
    },

    /** mm:ss for match timers and summaries. */
    fmtClock: function (ms) {
      var total = Math.floor(ms / 1000);
      var m = Math.floor(total / 60);
      var s = total % 60;
      return m + ':' + String(s).padStart(2, '0');
    },

    /**
     * Horizontal swipe/pointer-drag tracking. Handlers:
     *   onStart(), onMove(dx), onCancel(), onEnd(dx)
     * Vertical intent cancels the gesture so the page can still scroll.
     * Returns a teardown.
     */
    swipe: function (elm, handlers) {
      var active = false, pid = null, sx = 0, sy = 0;

      function down(e) {
        if (active) { return; }
        active = true; pid = e.pointerId;
        sx = e.clientX; sy = e.clientY;
        if (elm.setPointerCapture) { try { elm.setPointerCapture(pid); } catch (err) {} }
        if (handlers.onStart) { handlers.onStart(); }
      }
      function move(e) {
        if (!active || e.pointerId !== pid) { return; }
        var dx = e.clientX - sx, dy = e.clientY - sy;
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 26) {
          active = false; pid = null;
          if (handlers.onCancel) { handlers.onCancel(); }
          return;
        }
        if (handlers.onMove) { handlers.onMove(dx); }
      }
      function up(e) {
        if (!active || e.pointerId !== pid) { return; }
        active = false; pid = null;
        if (handlers.onEnd) { handlers.onEnd(e.clientX - sx); }
      }
      function cancel() {
        if (!active) { return; }
        active = false; pid = null;
        if (handlers.onCancel) { handlers.onCancel(); }
      }

      elm.addEventListener('pointerdown', down);
      elm.addEventListener('pointermove', move);
      elm.addEventListener('pointerup', up);
      elm.addEventListener('pointercancel', cancel);
      return function () {
        elm.removeEventListener('pointerdown', down);
        elm.removeEventListener('pointermove', move);
        elm.removeEventListener('pointerup', up);
        elm.removeEventListener('pointercancel', cancel);
      };
    }
  };

  global.Activities = {
    register: register,
    list: function () { return defs.slice(); },
    get: function (id) { return byId[id] || null; },
    GATE_MIN_WORDS: GATE_MIN_WORDS,
    util: util
  };
})(window);
