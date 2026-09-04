/* ==========================================================================
   WordDisplay — the single way Lexio renders a vocabulary entry.

   Data model (schema v3): `term` holds whatever the user types first —
   transliteration by default; `nativeScript` optionally holds the word in
   its own script. Legacy entries keep the native script in `term` and an
   empty nativeScript, so every helper below falls back gracefully:

     primary()    best single-line representation (translit or native)
     secondary()  the native spelling, ONLY when it genuinely adds a line
     pairHTML()   the two-part card: script block | divider | meaning block

   The card layout is the user-facing contract:

     ┌──────────────────┬──────────────────┐
     │ marhaba          │ Hello            │
     │ مرحباً            │ ──────────────   │
     │                  │ “مرحباً، كيف حالك؟”│
     └──────────────────┴──────────────────┘
   ========================================================================== */
(function (global) {
  'use strict';

  var esc = UI.esc;

  /** Resolve display direction for a word, falling back to its language. */
  function dirOf(word, language) {
    if (word.dir === 'rtl' || word.dir === 'ltr') { return word.dir; }
    if (language && (language.dir === 'rtl' || language.dir === 'ltr')) {
      return language.dir;
    }
    return 'auto';
  }

  function sameText(a, b) {
    return String(a).trim().toLocaleLowerCase() === String(b).trim().toLocaleLowerCase();
  }

  /** Preferences → native script spellings may be hidden app-wide. */
  function nativeAllowed() {
    return !(global.Store && Store.settings && Store.settings.showNativeScript === false);
  }

  /** Best single-line representation, used wherever space is tight. */
  function primary(word) {
    return (word && (word.term || word.nativeScript)) || '';
  }

  /**
   * The optional second line. Only when BOTH spellings exist and actually
   * differ, AND the user hasn't turned native script display off.
   */
  function secondary(word) {
    if (!word || !nativeAllowed()) { return ''; }
    if (!(word.term && word.nativeScript)) { return ''; }
    return sameText(word.term, word.nativeScript) ? '' : word.nativeScript;
  }

  /**
   * The two-part card body: script stack on one side, meaning + example on
   * the other, divided. Works inside any container; styling lives in CSS.
   * @param {object} word     entry from the store
   * @param {object} [lang]   active language (for direction fallback)
   * @param {object} [opts]   { example: false } to omit the example line
   */
  function pairHTML(word, lang, opts) {
    opts = opts || {};
    var dir = dirOf(word, lang);
    var prim = primary(word);
    var sec = secondary(word);
    var showExample = opts.example !== false && !!word.example;

    return '<div class="word-pair">' +
      '<div class="word-pair__script">' +
        '<span class="word-pair__eyebrow word-pair__eyebrow--cat">Term</span>' +
        '<span class="word-pair__term" dir="auto">' + esc(prim) + '</span>' +
        (sec ? '<span class="word-pair__native" dir="' + dir + '">' + esc(sec) + '</span>' : '') +
      '</div>' +
      '<div class="word-pair__sense">' +
        '<span class="word-pair__eyebrow">Meaning</span>' +
        '<span class="word-pair__meaning" dir="auto">' + esc(word.meaning) + '</span>' +
        (showExample
          ? '<span class="word-pair__example" dir="' + dir + '">' +
              '<span aria-hidden="true">\u201C</span>' + esc(word.example) +
              '<span aria-hidden="true">\u201D</span></span>'
          : '') +
      '</div>' +
    '</div>';
  }

  global.WordDisplay = {
    dirOf: dirOf,
    primary: primary,
    secondary: secondary,
    pairHTML: pairHTML
  };
})(window);
