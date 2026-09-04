/* ==========================================================================
   Notebook — script & font registry.

   One entry per writing system. Each script declares its default text
   direction, comfortable default line-height, sample text for pickers, and a
   list of fonts. Downloadable fonts are lazy-loaded from Google Fonts the
   first time their script is chosen; every stack ends in system fallbacks so
   text is never rendered as missing-glyph boxes when offline.

   Extensible: add an object to SCRIPTS and (optionally) reference it from a
   group — nothing else needs to change.
   ========================================================================== */
(function (global) {
  'use strict';

  var GF = 'https://fonts.googleapis.com/css2?family=';

  /* Each font: name shown in the picker, css = full CSS font-family stack,
     gf = Google Fonts query fragment (null for device/system fonts). */
  function f(name, css, gf) { return { name: name, css: css, gf: gf || null }; }
  function n(name, base) {
    return f(name, "'" + name + "'," + (base || 'sans-serif'),
      name.replace(/ /g, '+') + ':wght@400..700');
  }

  var LATIN_BASE = "'Inter',system-ui";
  var NOTO_UI = "'Noto Sans','Inter',system-ui";

  var SCRIPTS = {
    latin: { name: 'Latin', native: 'Aa Bb', dir: 'ltr', lh: 1.7,
      fonts: [
        f('Inter (default)', LATIN_BASE + ",sans-serif", null),
        f('System sans', "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", null),
        f('Georgia (serif)', "Georgia,'Times New Roman',serif", null),
        f('Serif', "'Noto Serif',Georgia,serif", 'Noto+Serif:ital,wght@0,400..700;1,400..700'),
        f('Monospace', "'Cascadia Mono','Consolas','Courier New',monospace", null)
      ] },

    arabic: { name: 'Arabic', native: 'العربية', dir: 'rtl', lh: 1.9,
      fonts: [
        n('Noto Naskh Arabic', "'Amiri','Traditional Arabic',serif"),
        f('Amiri', "'Amiri','Noto Naskh Arabic',serif", 'Amiri:wght@400;700'),
        n('Noto Sans Arabic', "'Segoe UI',Tahoma,sans-serif"),
        f('Scheherazade New', "'Scheherazade New','Noto Naskh Arabic',serif",
          'Scheherazade+New:wght@400;500;600;700'),
        f('Cairo', "'Cairo','Noto Sans Arabic',sans-serif", 'Cairo:wght@400..700')
      ] },

    persian: { name: 'Persian', native: 'فارسی', dir: 'rtl', lh: 1.9,
      fonts: [
        f('Vazirmatn (default)', "'Vazirmatn','Noto Naskh Arabic',Tahoma,sans-serif",
          'Vazirmatn:wght@400..700'),
        n('Noto Naskh Arabic', "'Vazirmatn',serif"),
        f('Amiri', "'Amiri','Noto Naskh Arabic',serif", 'Amiri:wght@400;700'),
        n('Noto Sans Arabic', "Tahoma,sans-serif")
      ] },

    urdu: { name: 'Urdu', native: 'اردو', dir: 'rtl', lh: 2.3,
      fonts: [
        n('Noto Nastaliq Urdu', "'Jameel Noori Nastaleeq','Urdu Typesetting','Noto Naskh Arabic',serif"),
        f('Noto Naskh Arabic', "'Noto Naskh Arabic','Urdu Typesetting',serif",
          'Noto+Naskh+Arabic:wght@400..700'),
        f('Amiri', "'Amiri','Noto Naskh Arabic',serif", 'Amiri:wght@400;700')
      ] },

    hebrew: { name: 'Hebrew', native: 'עברית', dir: 'rtl', lh: 1.8,
      fonts: [
        n('Noto Sans Hebrew', "'Arial Hebrew',Tahoma,sans-serif"),
        n('Noto Serif Hebrew', "Georgia,serif"),
        f('Frank Ruhl Libre', "'Frank Ruhl Libre','Noto Serif Hebrew',serif",
          'Frank+Ruhl+Libre:wght@400..700')
      ] },

    devanagari: { name: 'Devanagari', native: 'देवनागरी · हिन्दी', dir: 'ltr', lh: 1.9,
      fonts: [
        n('Noto Sans Devanagari', "'Mangal',sans-serif"),
        n('Noto Serif Devanagari', "serif")
      ] },

    bengali: { name: 'Bengali', native: 'বাংলা', dir: 'ltr', lh: 1.9,
      fonts: [
        n('Noto Sans Bengali', "'Vrinda',sans-serif"),
        n('Noto Serif Bengali', "serif")
      ] },

    gurmukhi: { name: 'Gurmukhi', native: 'ਗੁਰਮੁਖੀ', dir: 'ltr', lh: 1.9,
      fonts: [
        n('Noto Sans Gurmukhi', "'Raavi',sans-serif"),
        n('Noto Serif Gurmukhi', "serif")
      ] },

    gujarati: { name: 'Gujarati', native: 'ગુજરાતી', dir: 'ltr', lh: 1.9,
      fonts: [
        n('Noto Sans Gujarati', "'Shruti',sans-serif"),
        n('Noto Serif Gujarati', "serif")
      ] },

    tamil: { name: 'Tamil', native: 'தமிழ்', dir: 'ltr', lh: 2.0,
      fonts: [
        n('Noto Sans Tamil', "'Latha',sans-serif"),
        n('Noto Serif Tamil', "serif")
      ] },

    telugu: { name: 'Telugu', native: 'తెలుగు', dir: 'ltr', lh: 1.9,
      fonts: [
        n('Noto Sans Telugu', "'Gautami',sans-serif"),
        n('Noto Serif Telugu', "serif")
      ] },

    kannada: { name: 'Kannada', native: 'ಕನ್ನಡ', dir: 'ltr', lh: 1.9,
      fonts: [
        n('Noto Sans Kannada', "'Tunga',sans-serif"),
        n('Noto Serif Kannada', "serif")
      ] },

    malayalam: { name: 'Malayalam', native: 'മലയാളം', dir: 'ltr', lh: 1.9,
      fonts: [
        n('Noto Sans Malayalam', "'Kartika',sans-serif"),
        n('Noto Serif Malayalam', "serif")
      ] },

    sinhala: { name: 'Sinhala', native: 'සිංහල', dir: 'ltr', lh: 1.9,
      fonts: [
        n('Noto Sans Sinhala', "'Iskoola Pota',sans-serif"),
        n('Noto Serif Sinhala', "serif")
      ] },

    cyrillic: { name: 'Cyrillic', native: 'Русский', dir: 'ltr', lh: 1.7,
      fonts: [
        f('Inter (default)', LATIN_BASE + ',sans-serif', null),
        n('Noto Sans', "system-ui,sans-serif"),
        n('Noto Serif', "Georgia,serif"),
        f('PT Serif', "'PT Serif',Georgia,serif", 'PT+Serif:wght@400;700')
      ] },

    greek: { name: 'Greek', native: 'Ελληνικά', dir: 'ltr', lh: 1.7,
      fonts: [
        f('Inter (default)', LATIN_BASE + ',sans-serif', null),
        n('Noto Sans', "system-ui,sans-serif"),
        f('EB Garamond', "'EB Garamond',Georgia,serif", 'EB+Garamond:wght@400..700'),
        n('Noto Serif', "Georgia,serif")
      ] },

    armenian: { name: 'Armenian', native: 'Հայերեն', dir: 'ltr', lh: 1.8,
      fonts: [
        n('Noto Sans Armenian', "system-ui,sans-serif"),
        n('Noto Serif Armenian', "serif")
      ] },

    georgian: { name: 'Georgian', native: 'ქართული', dir: 'ltr', lh: 1.8,
      fonts: [
        n('Noto Sans Georgian', "system-ui,sans-serif"),
        n('Noto Serif Georgian', "serif")
      ] },

    ethiopic: { name: 'Ethiopic', native: 'ግዕዝ · አማርኛ', dir: 'ltr', lh: 1.9,
      fonts: [
        n('Noto Sans Ethiopic', "system-ui,sans-serif"),
        n('Noto Serif Ethiopic', "serif")
      ] },

    thai: { name: 'Thai', native: 'ไทย', dir: 'ltr', lh: 2.0,
      fonts: [
        n('Noto Sans Thai', "'Leelawadee UI',Tahoma,sans-serif"),
        n('Noto Serif Thai', "serif"),
        f('Sarabun', "'Sarabun','Noto Sans Thai',sans-serif", 'Sarabun:wght@400;500;600;700')
      ] },

    lao: { name: 'Lao', native: 'ລາວ', dir: 'ltr', lh: 2.0,
      fonts: [
        n('Noto Sans Lao', "'Leelawadee UI',sans-serif"),
        n('Noto Serif Lao', "serif")
      ] },

    khmer: { name: 'Khmer', native: 'ខ្មែរ', dir: 'ltr', lh: 2.2,
      fonts: [
        n('Noto Sans Khmer', "'Leelawadee UI',sans-serif"),
        n('Noto Serif Khmer', "serif")
      ] },

    myanmar: { name: 'Myanmar', native: 'မြန်မာ', dir: 'ltr', lh: 2.0,
      fonts: [
        n('Noto Sans Myanmar', "'Myanmar Text',sans-serif"),
        f('Padauk', "'Padauk','Myanmar Text',sans-serif", 'Padauk:wght@400;700'),
        n('Noto Serif Myanmar', "serif")
      ] },

    chinese: { name: 'Chinese', native: '中文', dir: 'ltr', lh: 1.9,
      fonts: [
        n('Noto Sans SC', "'Microsoft YaHei','PingFang SC',sans-serif"),
        n('Noto Serif SC', "'SimSun','Songti SC',serif")
      ] },

    japanese: { name: 'Japanese', native: 'にほんご', dir: 'ltr', lh: 1.9,
      fonts: [
        n('Noto Sans JP', "'Yu Gothic','Hiragino Kaku Gothic Pro','Meiryo',sans-serif"),
        n('Noto Serif JP', "'Yu Mincho','Hiragino Mincho Pro','MS Mincho',serif")
      ] },

    korean: { name: 'Korean', native: '한국어', dir: 'ltr', lh: 1.9,
      fonts: [
        n('Noto Sans KR', "'Malgun Gothic','Apple SD Gothic Neo',sans-serif"),
        n('Noto Serif KR', "'Batang',serif")
      ] }
  };

  /* Logical groupings for the script picker. */
  var GROUPS = [
    { id: 'latin',   label: 'European',       scripts: ['latin', 'cyrillic', 'greek'] },
    { id: 'mideast', label: 'Middle East',    scripts: ['arabic', 'persian', 'urdu', 'hebrew'] },
    { id: 'southasia', label: 'South Asia',
      scripts: ['devanagari', 'bengali', 'gurmukhi', 'gujarati', 'tamil', 'telugu',
                'kannada', 'malayalam', 'sinhala'] },
    { id: 'africa',  label: 'Africa & Caucasus', scripts: ['ethiopic', 'armenian', 'georgian'] },
    { id: 'seasia',  label: 'Southeast Asia', scripts: ['thai', 'lao', 'khmer', 'myanmar'] },
    { id: 'eastasia', label: 'East Asia',     scripts: ['chinese', 'japanese', 'korean'] }
  ];

  var RTL = { arabic: true, persian: true, urdu: true, hebrew: true };
  Object.keys(RTL).forEach(function (k) { if (SCRIPTS[k]) { SCRIPTS[k].dir = 'rtl'; } });

  /* ---- Lazy font loading -------------------------------------------------- */
  var loaded = {};

  function loadScriptFonts(scriptId) {
    var script = SCRIPTS[scriptId];
    if (!script) { return; }
    var fragments = [];
    script.fonts.forEach(function (font) {
      if (font.gf && !loaded[font.gf]) { loaded[font.gf] = true; fragments.push(font.gf); }
    });
    if (!fragments.length) { return; }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    /* Fragments are built URL-safe (spaces pre-encoded as +), join raw. */
    link.href = GF + fragments.join('&family=') + '&display=swap';
    document.head.appendChild(link);
  }

  global.NBScripts = {
    all: function () { return SCRIPTS; },
    groups: function () { return GROUPS.slice(); },
    get: function (id) { return SCRIPTS[id] || null; },
    exists: function (id) { return Object.prototype.hasOwnProperty.call(SCRIPTS, id); },
    /** Default direction of a script ('rtl' | 'ltr'). */
    dirOf: function (id) { return (SCRIPTS[id] && SCRIPTS[id].dir) || 'ltr'; },
    fontsOf: function (id) { return (SCRIPTS[id] ? SCRIPTS[id].fonts : []).slice(); },
    defaultFont: function (id) {
      var fonts = this.fontsOf(id);
      return fonts.length ? fonts[0] : f('System', 'inherit');
    },
    lineHeight: function (id) { return (SCRIPTS[id] && SCRIPTS[id].lh) || 1.7; },
    loadFonts: loadScriptFonts
  };
})(window);
