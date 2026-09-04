/* ==========================================================================
   Store — the single source of truth for the current browser session.

   Persistence: one localStorage key ('lexio.v1') holding a versioned JSON
   document. Signed-in users additionally sync through the optional remote
   adapter installed by cloud.js; guests remain local-only.

   Vocabulary entries use a stable, documented shape and are migrated on
   read/import. localStorage keeps the implementation synchronous and simple;
   the module API is deliberately storage-agnostic if IndexedDB is needed later.

   Word schema (schemaVersion 3):
   {
     id, languageId, categoryId,
     term,                 // what the user types first — transliteration by
                           // default; legacy entries hold the native script
     nativeScript,         // optional native spelling (e.g. Urdu/Arabic)
     meaning, example,
     dir: 'auto'|'ltr'|'rtl', dateAdded, updatedAt,
     stats: { seen, correct, incorrect, streak, box, lastReviewedAt, nextReviewAt }
   }
   At least one of term / nativeScript is required.

   Phase 4: `stats` is the durable source of truth for learning state and is
   synced through the ordinary vocabulary_entries row. The top-level
   `progress` map becomes a derived local cache kept in step by recordAnswer()
   and backfilled from stats on load/import/hydration. Session writes persist
   QUIETLY (no pub/sub emit) so an active Learn session is never re-rendered
   out from under the user; other tabs still hear the storage event.
   ========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'lexio.v1';
  var SCHEMA_VERSION = 3;

  /* ---- Default document -------------------------------------------------- */
  function defaults() {
    return {
      schemaVersion: SCHEMA_VERSION,
      createdAt: Date.now(),
      settings: {
        theme: 'system',         // 'system' | 'light' | 'dark'
        uiDir: 'ltr',            // interface direction
        activeLanguageId: null,
        dailyGoal: 10,
        learnScopeId: null,      // Learn hub scope: null = whole language
        showNativeScript: true,  // Preferences → native spellings on cards
        profile: { displayName: '' } // guest-mode display name; signed-in
                                     // users live in Supabase user metadata
      },
      languages: [],             // {id,name,code,dir,script,createdAt}
      words: [],                 // entries normalized by normalizeWord()
      progress: {},              // wordId -> {box, seen, correct, lastSeen}
      sessions: []               // review history
    };
  }

  /** A tiny first-run notebook makes browsing tangible without hiding the fact
      that every entry is ordinary, editable local data. Reset still clears all. */
  function starterDocument() {
    var doc = defaults();
    var languageId = 'lang_sample_ar';
    var added = new Date().toISOString();
    doc.settings.activeLanguageId = languageId;
    doc.languages.push({
      id: languageId,
      name: 'Arabic',
      code: 'ar',
      dir: 'rtl',
      createdAt: Date.now()
    });
    [
      { id: 'word_sample_marhaban', categoryId: 'greetings', term: 'marhaba', nativeScript: 'مرحباً',
        meaning: 'Hello', example: 'مرحباً، كيف حالك؟', dir: 'rtl' },
      { id: 'word_sample_shukran', categoryId: 'greetings', term: 'shukran', nativeScript: 'شكراً',
        meaning: 'Thank you', example: 'شكراً جزيلاً', dir: 'rtl' },
      { id: 'word_sample_salaam', categoryId: 'greetings', term: 'salaam',
        meaning: 'Peace / hello', example: 'Salaam, my friend.', dir: 'ltr' },
      { id: 'word_sample_ana', categoryId: 'pronouns', term: 'ana', nativeScript: 'أنا',
        meaning: 'I / me', example: 'أنا بخير', dir: 'rtl' },
      { id: 'word_sample_blue', categoryId: 'colors', term: 'azraq', nativeScript: 'أزرق',
        meaning: 'Blue', example: '', dir: 'rtl' }
    ].forEach(function (sample) {
      doc.words.push(normalizeWord({
        id: sample.id,
        languageId: languageId,
        categoryId: sample.categoryId,
        term: sample.term,
        nativeScript: sample.nativeScript || '',
        meaning: sample.meaning,
        example: sample.example,
        dir: sample.dir || 'rtl',
        dateAdded: added
      }, true));
    });
    return doc;
  }

  /* ---- Load / save ------------------------------------------------------- */
  var state = load();
  var listeners = [];
  var saveTimer = null;
  var remoteAdapter = null;

  function load() {
    var raw;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) { return starterDocument(); }
    try {
      return migrate(JSON.parse(raw));
    } catch (e) {
      console.warn('[Lexio] Stored data was unreadable; starting fresh.', e);
      return defaults();
    }
  }

  /** Forward-compatible: fills in anything a newer build expects. */
  function migrate(doc) {
    var base = defaults();
    if (!doc || typeof doc !== 'object') { return base; }
    var out = Object.assign(base, doc);
    out.settings = Object.assign(base.settings, doc.settings || {});
    ['languages', 'words', 'sessions'].forEach(function (k) {
      if (!Array.isArray(out[k])) { out[k] = []; }
    });
    if (!out.progress || typeof out.progress !== 'object') { out.progress = {}; }
    out.words = out.words.map(function (word) { return normalizeWord(word, true); });
    backfillProgress(out);
    out.schemaVersion = SCHEMA_VERSION;
    return out;
  }

  /** Rebuild any missing progress entries from synced per-word stats. */
  function backfillProgress(doc) {
    doc.words.forEach(function (w) {
      var s = w.stats;
      if (!s || !(Number(s.seen) > 0) || doc.progress[w.id]) { return; }
      doc.progress[w.id] = {
        box: Math.max(0, Number(s.box) || 0),
        seen: Number(s.seen) || 0,
        correct: Number(s.correct) || 0,
        lastSeen: s.lastReviewedAt ? Date.parse(s.lastReviewedAt) : null
      };
    });
  }

  function cleanText(value, max) {
    return String(value == null ? '' : value).trim().slice(0, max);
  }

  function validDir(value) {
    return value === 'rtl' || value === 'ltr' ? value : 'auto';
  }

  function emptyStats(existing) {
    existing = existing && typeof existing === 'object' ? existing : {};
    return {
      seen: Number(existing.seen) || 0,
      correct: Number(existing.correct) || 0,
      incorrect: Number(existing.incorrect) || 0,
      streak: Number(existing.streak) || 0,
      box: Number(existing.box) || 0,
      lastReviewedAt: existing.lastReviewedAt || null,
      nextReviewAt: existing.nextReviewAt || null
    };
  }

  /** Normalize both newly-created entries and older imported entries. */
  function normalizeWord(data, preserveId) {
    data = data || {};
    var added = data.dateAdded || data.createdAt || new Date().toISOString();
    return {
      id: preserveId && data.id ? String(data.id) : uid('word'),
      languageId: String(data.languageId || ''),
      categoryId: String(data.categoryId || ''),
      term: cleanText(data.term, 200),
      nativeScript: cleanText(data.nativeScript != null ? data.nativeScript : data.native_script, 200),
      meaning: cleanText(data.meaning, 300),
      example: cleanText(data.example, 1000),
      dir: validDir(data.dir),
      dateAdded: typeof added === 'number' ? new Date(added).toISOString() : String(added),
      updatedAt: data.updatedAt || null,
      stats: emptyStats(data.stats)
    };
  }

  function validateWord(word) {
    if (!word.term && !word.nativeScript) {
      throw new Error('Type the word — transliterated or in its native script.');
    }
    if (!word.meaning) { throw new Error('A meaning is required.'); }
    if (!Categories.exists(word.categoryId)) { throw new Error('Choose a valid category.'); }
    var languageExists = state.languages.some(function (l) { return l.id === word.languageId; });
    if (!languageExists) { throw new Error('Choose a valid language.'); }
  }

  var persistOk = true;

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      if (!persistOk) { persistOk = true; }
    } catch (e) {
      persistOk = false;
      console.error('[Lexio] Could not save to localStorage.', e);
      emit('storage-error', e);
    }
  }

  /** Coalesces bursts of writes into one serialization. */
  function scheduleSave() {
    if (saveTimer) { clearTimeout(saveTimer); }
    saveTimer = setTimeout(function () { saveTimer = null; persist(); }, 120);
  }

  /* ---- Pub/sub ----------------------------------------------------------- */
  function emit(reason, payload) {
    listeners.forEach(function (fn) {
      try { fn(reason, payload); } catch (e) { console.error(e); }
    });
  }

  function commit(reason, payload) {
    scheduleSave();
    emit(reason, payload);
  }

  function remote(method, payload) {
    if (remoteAdapter && typeof remoteAdapter[method] === 'function') {
      remoteAdapter[method](payload);
    }
  }

  /* Keep multiple tabs of the same site in sync. */
  global.addEventListener('storage', function (e) {
    if (e.key !== KEY) { return; }
    state = load();
    dirtyWords = {};
    emit('external-change');
  });

  /* ---- Helpers ----------------------------------------------------------- */
  function uid(prefix) {
    var rnd = (global.crypto && global.crypto.randomUUID)
      ? global.crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    return (prefix || 'id') + '_' + Date.now().toString(36) + rnd;
  }

  /** A word counts as "learned" once it has been answered correctly 3x. */
  var LEARNED_AT = 3;

  function isLearned(wordId) {
    var p = state.progress[wordId];
    if (p && p.correct >= LEARNED_AT) { return true; }
    var w = Store.getWord(wordId);
    return !!w && Number(w.stats.correct) >= LEARNED_AT;
  }

  /* ---- Learning sessions (Phase 4) ---------------------------------------
     Answers persist quietly — scheduleSave() only, no emit — because the
     active session view owns its own DOM. A bulk record of the session is
     appended at the end, and every word touched is queued to Supabase so
     signed-in users keep their boxes across devices. */
  var dirtyWords = {};

  function recordAnswer(id, wasCorrect) {
    var word = Store.getWord(id);
    if (!word) { return null; }
    var box = global.Scheduler
      ? Scheduler.answer(word.stats, wasCorrect)
      : (wasCorrect ? Math.min(5, (word.stats.box || 0) + 1) : 0);
    state.progress[id] = {
      box: box,
      seen: Number(word.stats.seen) || 0,
      correct: Number(word.stats.correct) || 0,
      lastSeen: Date.now()
    };
    dirtyWords[id] = true;
    scheduleSave();
    return { box: box, learned: isLearned(id) };
  }

  /** Display direction for a word, falling back to its language's setting. */
  function wordDir(word) {
    if (word.dir === 'rtl' || word.dir === 'ltr') { return word.dir; }
    var lang = null;
    state.languages.some(function (l) {
      if (l.id === word.languageId) { lang = l; return true; }
      return false;
    });
    if (lang && (lang.dir === 'rtl' || lang.dir === 'ltr')) { return lang.dir; }
    return 'auto';
  }

  /**
   * Everything the Review page renders, aggregated fresh on every call so
   * the page can never show stale numbers. Read-only; no persistence.
   */
  function reviewSnapshot() {
    var words = Store.words();
    var today = new Date();

    /* Box distribution, weak-word candidates and lifetime answer totals. */
    var boxes = [0, 0, 0, 0, 0, 0];
    var workPool = [];
    var answers = 0;
    var correctAnswers = 0;

    words.forEach(function (w) {
      var s = w.stats;
      var seenN = Number(s.seen) || 0;
      var cor = Number(s.correct) || 0;
      var inc = Number(s.incorrect) || 0;
      boxes[global.Scheduler ? Scheduler.boxOf(w) : 0]++;
      if (seenN > 0) {
        answers += seenN;
        correctAnswers += cor;
        if (inc > 0) { workPool.push(w); }
      }
    });

    /* Miss-heavy first, then the shakiest box, then longest-lingering. */
    workPool.sort(function (a, b) {
      var byMisses = (Number(b.stats.incorrect) || 0) - (Number(a.stats.incorrect) || 0);
      if (byMisses) { return byMisses; }
      return (Number(a.stats.box) || 0) - (Number(b.stats.box) || 0);
    });

    /* Per-category mastery and recall, in taxonomy order. */
    var categories = [];
    Categories.all.forEach(function (cat) {
      var total = 0, learned = 0, practised = 0, seenSum = 0, correctSum = 0;
      words.forEach(function (w) {
        if (w.categoryId !== cat.id) { return; }
        total++;
        if (isLearned(w.id)) { learned++; }
        var seenN = Number(w.stats.seen) || 0;
        if (seenN > 0) {
          practised++;
          seenSum += seenN;
          correctSum += Number(w.stats.correct) || 0;
        }
      });
      if (!total) { return; }
      categories.push({
        id: cat.id,
        name: cat.name,
        total: total,
        learned: learned,
        practised: practised,
        accuracy: practised ? Math.round((correctSum / seenSum) * 100) : null
      });
    });

    /* Session log, genuinely newest first regardless of insert order. */
    var recentSessions = state.sessions.slice(-30)
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); })
      .map(function (s) {
      return {
        at: s.at,
        mode: s.mode || 'session',
        categoryId: s.categoryId || null,
        total: Number(s.total) || 0,
        correct: Number(s.correct) || 0,
        durationMs: Number(s.durationMs) || 0
      };
    });

    var seconds = 0;
    state.sessions.forEach(function (s) { seconds += (Number(s.durationMs) || 0) / 1000; });

    /* Last fourteen days, oldest to newest, zero-filled. */
    var byDay = {};
    state.sessions.forEach(function (s) {
      var key = new Date(s.at).toDateString();
      var b = byDay[key] || (byDay[key] = { answers: 0, correct: 0, sessions: 0 });
      b.answers += Number(s.total) || 0;
      b.correct += Number(s.correct) || 0;
      b.sessions += 1;
    });
    var days = [];
    for (var i = 13; i >= 0; i--) {
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      var b = byDay[d.toDateString()] || { answers: 0, correct: 0, sessions: 0 };
      days.push({ t: d.getTime(), answers: b.answers, correct: b.correct, sessions: b.sessions });
    }

    return {
      totals: Store.totals(),
      dueNow: global.Scheduler ? Scheduler.dueCount(words) : 0,
      boxes: boxes,
      allTime: {
        answers: answers,
        correct: correctAnswers,
        accuracy: answers ? Math.round((correctAnswers / answers) * 100) : null,
        seconds: Math.round(seconds)
      },
      categories: categories,
      needsWork: workPool.slice(0, 8).map(function (w) {
        return {
          id: w.id,
          term: w.term,
          nativeScript: w.nativeScript || '',
          meaning: w.meaning,
          dir: wordDir(w),
          misses: Number(w.stats.incorrect) || 0,
          box: global.Scheduler ? Scheduler.boxOf(w) : 0
        };
      }),
      recentSessions: recentSessions,
      days: days
    };
  }

  function finishSession(record) {
    var entry = {
      at: new Date().toISOString(),
      mode: String(record.mode || ''),
      categoryId: record.categoryId || null,
      total: Number(record.total) || 0,
      correct: Number(record.correct) || 0,
      durationMs: Math.max(0, Number(record.durationMs) || 0)
    };
    state.sessions.push(entry);
    if (state.sessions.length > 400) { state.sessions = state.sessions.slice(-400); }
    var touched = Object.keys(dirtyWords)
      .map(function (id) { return Store.getWord(id); })
      .filter(Boolean);
    dirtyWords = {};
    scheduleSave();
    remote('saveWords', touched);
    return entry;
  }

  /**
   * Wipe every word and its learning history while keeping languages,
   * settings, and the session log. Remote mirror: replaceAll with an empty
   * word list re-uploads the surviving languages.
   */
  function clearVocabulary() {
    state.words = [];
    state.progress = {};
    dirtyWords = {};
    persist();
    emit('vocabulary-cleared');
    remote('replaceAll', { languages: state.languages.slice(), words: [] });
  }

  /* ==========================================================================
     Public API
     ========================================================================== */
  var Store = {
    LEARNED_AT: LEARNED_AT,

    /* -- subscription -- */
    subscribe: function (fn) {
      listeners.push(fn);
      return function () {
        listeners = listeners.filter(function (l) { return l !== fn; });
      };
    },

    /* -- raw access (read-only by convention) -- */
    get state() { return state; },
    get settings() { return state.settings; },
    get isPersistent() { return persistOk; },

    /* CloudSync installs this only after the signed-in user's data is loaded. */
    setRemoteAdapter: function (adapter) { remoteAdapter = adapter || null; },

    replaceCloudData: function (languages, words) {
      state.languages = Array.isArray(languages) ? languages.slice() : [];
      state.words = Array.isArray(words)
        ? words.map(function (word) { return normalizeWord(word, true); })
        : [];
      state.progress = {};
      backfillProgress(state);
      var activeExists = state.languages.some(function (lang) {
        return lang.id === state.settings.activeLanguageId;
      });
      state.settings.activeLanguageId = activeExists
        ? state.settings.activeLanguageId
        : (state.languages[0] ? state.languages[0].id : null);
      persist();
      emit('cloud-hydrate');
    },

    flushLocal: function () {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      persist();
    },

    /* -- settings -- */
    setSetting: function (key, value) {
      state.settings[key] = value;
      commit('settings', { key: key, value: value });
    },

    /* -- languages -- */
    languages: function () { return state.languages.slice(); },

    activeLanguage: function () {
      var id = state.settings.activeLanguageId;
      if (!id) { return null; }
      return state.languages.filter(function (l) { return l.id === id; })[0] || null;
    },

    addLanguage: function (data) {
      var lang = {
        id: uid('lang'),
        name: (data.name || 'Untitled').trim(),
        code: (data.code || '').trim(),
        dir: data.dir === 'rtl' ? 'rtl' : (data.dir === 'auto' ? 'auto' : 'ltr'),
        createdAt: Date.now()
      };
      state.languages.push(lang);
      if (!state.settings.activeLanguageId) { state.settings.activeLanguageId = lang.id; }
      commit('languages', lang);
      remote('saveLanguage', lang);
      return lang;
    },

    updateLanguage: function (id, patch) {
      var lang = state.languages.filter(function (l) { return l.id === id; })[0];
      if (!lang) { return null; }
      Object.assign(lang, patch);
      commit('languages', lang);
      remote('saveLanguage', lang);
      return lang;
    },

    removeLanguage: function (id) {
      var removedWordIds = {};
      state.words.forEach(function (w) { if (w.languageId === id) { removedWordIds[w.id] = true; } });
      state.languages = state.languages.filter(function (l) { return l.id !== id; });
      state.words = state.words.filter(function (w) { return w.languageId !== id; });
      Object.keys(removedWordIds).forEach(function (wordId) { delete state.progress[wordId]; });
      if (state.settings.activeLanguageId === id) {
        state.settings.activeLanguageId = state.languages.length ? state.languages[0].id : null;
      }
      commit('languages');
      remote('deleteLanguage', id);
    },

    setActiveLanguage: function (id) {
      state.settings.activeLanguageId = id;
      commit('active-language', id);
    },

    /* -- vocabulary CRUD -- */
    words: function (filter) {
      filter = filter || {};
      var langId = filter.languageId === undefined
        ? state.settings.activeLanguageId
        : filter.languageId;
      return state.words.filter(function (w) {
        if (langId && w.languageId !== langId) { return false; }
        if (filter.categoryId && w.categoryId !== filter.categoryId) { return false; }
        if (filter.query) {
          var q = String(filter.query).toLocaleLowerCase();
          var haystack = (w.term + '\n' + (w.nativeScript || '') + '\n' +
            w.meaning + '\n' + w.example).toLocaleLowerCase();
          if (haystack.indexOf(q) === -1) { return false; }
        }
        return true;
      }).slice();
    },

    getWord: function (id) {
      return state.words.filter(function (w) { return w.id === id; })[0] || null;
    },

    addWord: function (data) {
      var word = normalizeWord(data, false);
      if (!word.languageId) { word.languageId = state.settings.activeLanguageId || ''; }
      validateWord(word);
      state.words.push(word);
      commit('words', { action: 'add', word: word });
      remote('saveWord', word);
      return word;
    },

    addWords: function (entries) {
      if (!Array.isArray(entries) || !entries.length) { return []; }
      var words = entries.map(function (data) {
        var word = normalizeWord(data, false);
        if (!word.languageId) { word.languageId = state.settings.activeLanguageId || ''; }
        validateWord(word);
        return word;
      });
      Array.prototype.push.apply(state.words, words);
      commit('words', { action: 'bulk-add', words: words });
      remote('saveWords', words);
      return words;
    },

    updateWord: function (id, patch) {
      var word = Store.getWord(id);
      if (!word) { return null; }
      var candidate = normalizeWord(Object.assign({}, word, patch, {
        id: word.id,
        dateAdded: word.dateAdded,
        updatedAt: new Date().toISOString(),
        stats: word.stats
      }), true);
      validateWord(candidate);
      var index = state.words.indexOf(word);
      state.words[index] = candidate;
      commit('words', { action: 'update', word: candidate });
      remote('saveWord', candidate);
      return candidate;
    },

    deleteWord: function (id) {
      var word = Store.getWord(id);
      if (!word) { return false; }
      state.words = state.words.filter(function (w) { return w.id !== id; });
      delete state.progress[id];
      commit('words', { action: 'delete', word: word });
      remote('deleteWord', id);
      return true;
    },

    isLearned: isLearned,
    recordAnswer: recordAnswer,
    finishSession: finishSession,
    clearVocabulary: clearVocabulary,
    reviewSnapshot: reviewSnapshot,

    /** {total, learned} for one category in the active language. */
    categoryStats: function (categoryId) {
      var words = Store.words({ categoryId: categoryId });
      var learned = 0;
      for (var i = 0; i < words.length; i++) { if (isLearned(words[i].id)) { learned++; } }
      return { total: words.length, learned: learned };
    },

    /** Counts for every category at once — one pass, used by the Home grid. */
    allCategoryStats: function () {
      var out = {};
      Categories.all.forEach(function (c) { out[c.id] = { total: 0, learned: 0 }; });
      Store.words().forEach(function (w) {
        var bucket = out[w.categoryId];
        if (!bucket) { return; }
        bucket.total++;
        if (isLearned(w.id)) { bucket.learned++; }
      });
      return out;
    },

    totals: function () {
      var words = Store.words();
      var learned = 0;
      words.forEach(function (w) { if (isLearned(w.id)) { learned++; } });
      var cats = {};
      words.forEach(function (w) { cats[w.categoryId] = true; });
      return {
        words: words.length,
        learned: learned,
        categoriesStarted: Object.keys(cats).length,
        languages: state.languages.length,
        streak: Store.streak()
      };
    },

    /** Consecutive days (ending today or yesterday) with at least one session. */
    streak: function () {
      if (!state.sessions.length) { return 0; }
      var days = {};
      state.sessions.forEach(function (s) {
        days[new Date(s.at).toDateString()] = true;
      });
      var count = 0;
      var cursor = new Date();
      if (!days[cursor.toDateString()]) { cursor.setDate(cursor.getDate() - 1); }
      while (days[cursor.toDateString()]) {
        count++;
        cursor.setDate(cursor.getDate() - 1);
      }
      return count;
    },

    /* -- backup / portability -- */
    exportJSON: function () {
      return JSON.stringify({
        app: 'lexio',
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        data: state
      }, null, 2);
    },

    exportFilename: function () {
      var d = new Date();
      var pad = function (n) { return String(n).padStart(2, '0'); };
      return 'lexio-backup-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
    },

    /**
     * @param {string} json
     * @param {'replace'|'merge'} mode
     */
    importJSON: function (json, mode) {
      var parsed = JSON.parse(json);
      var incoming = parsed && parsed.data ? parsed.data : parsed;
      if (!incoming || typeof incoming !== 'object') { throw new Error('Not a Lexio backup file.'); }
      var doc = migrate(incoming);

      if (mode === 'merge') {
        var seenLang = {};
        state.languages.forEach(function (l) { seenLang[l.id] = true; });
        doc.languages.forEach(function (l) { if (!seenLang[l.id]) { state.languages.push(l); } });

        var seenWord = {};
        state.words.forEach(function (w) { seenWord[w.id] = true; });
        doc.words.forEach(function (w) { if (!seenWord[w.id]) { state.words.push(normalizeWord(w, true)); } });

        Object.keys(doc.progress).forEach(function (k) {
          if (!state.progress[k]) { state.progress[k] = doc.progress[k]; }
        });
        state.sessions = state.sessions.concat(doc.sessions);
      } else {
        state = doc;
      }
      dirtyWords = {};
      if (!state.settings.activeLanguageId && state.languages.length) {
        state.settings.activeLanguageId = state.languages[0].id;
      }
      persist();
      emit('import');
      remote('replaceAll', { languages: state.languages.slice(), words: state.words.slice() });
      return { languages: doc.languages.length, words: doc.words.length };
    },

    resetAll: function () {
      state = defaults();
      dirtyWords = {};
      persist();
      emit('reset');
      remote('replaceAll', { languages: [], words: [] });
    },

    /** Rough footprint of the stored document, for the Manage screen. */
    storageBytes: function () {
      try { return (localStorage.getItem(KEY) || '').length; } catch (e) { return 0; }
    },

    uid: uid,
    schemaVersion: SCHEMA_VERSION,
    wordSchema: function () {
      return {
        required: ['id', 'languageId', 'categoryId', 'term', 'meaning', 'dir', 'dateAdded', 'stats'],
        optional: ['nativeScript', 'example'],
        directions: ['auto', 'ltr', 'rtl']
      };
    }
  };

  global.Store = Store;
})(window);
