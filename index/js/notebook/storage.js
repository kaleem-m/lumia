/* ==========================================================================
   Notebook — document storage.

   Two backends behind one small API:
   • Guests      → IndexedDB ('lexio-notebook' db), with a localStorage
                   fallback where IndexedDB is unavailable. Data never leaves
                   the device.
   • Signed-in   → the existing Supabase project (`notebook_documents` table,
                   RLS-scoped per user), mirrored into IndexedDB so recently
                   opened notes stay readable offline and reopen instantly.

   Guest notes are migrated automatically after sign-in. Each note is removed
   from guest storage only after Supabase confirms the upsert, while account
   notes keep an owner-scoped offline mirror for fast/offline reopening.
   ========================================================================== */
(function (global) {
  'use strict';

  var DB_NAME = 'lexio-notebook';
  var DB_VERSION = 1;
  var STORE = 'docs';
  var LS_KEY = 'lexio.notebook.v1';
  var MAX_CONTENT = 1000000;

  var db = null;
  var initPromise = null;
  var idbOk = true;
  var syncCb = null;
  var remoteQueue = Promise.resolve();
  /* Set when Supabase reports the notebook schema is missing (migration not
     run yet). Remote writes pause for the session; local saving continues
     and the UI shows "Saved locally" instead of an error loop. */
  var cloudBroken = false;

  /** True when the failure means "backend table missing", not a network blip. */
  function isSetupError(error) {
    if (!error) { return false; }
    var code = error.code || '';
    var msg = String(error.message || error.msg || '');
    return code === '42P01' ||
      /does not exist|not found in schema cache|schema cache/i.test(msg);
  }

  /* ---- Normalization ------------------------------------------------------ */

  function uid(prefix) {
    var rnd = (global.crypto && global.crypto.randomUUID)
      ? global.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 10);
    return prefix + '_' + Date.now().toString(36) + rnd;
  }

  function normalize(doc) {
    var d = doc && typeof doc === 'object' ? doc : {};
    var now = new Date().toISOString();
    return {
      id: typeof d.id === 'string' && d.id ? d.id : uid('nb'),
      title: String(d.title || 'Untitled Note').slice(0, 200),
      contentHtml: typeof d.contentHtml === 'string'
        ? d.contentHtml.slice(0, MAX_CONTENT) : '',
      searchText: String(d.searchText || '').slice(0, 20000),
      script: typeof d.script === 'string' ? d.script : 'latin',
      fontFamily: typeof d.fontFamily === 'string' ? d.fontFamily : '',
      fontSize: Number(d.fontSize) || 17,
      dir: d.dir === 'rtl' || d.dir === 'ltr' || d.dir === 'auto' ? d.dir : 'auto',
      lineHeight: Number(d.lineHeight) || 1.7,
      starred: !!d.starred,
      wordCount: Math.max(0, Number(d.wordCount) || 0),
      charCount: Math.max(0, Number(d.charCount) || 0),
      createdAt: d.createdAt || now,
      updatedAt: d.updatedAt || now,
      /* Offline cloud mirrors are scoped so they never appear as guest notes
         after sign-out or get copied into a different account. */
      localOwnerId: typeof d.localOwnerId === 'string' && d.localOwnerId
        ? d.localOwnerId : null,
      cloudPending: !!d.cloudPending,
      migrated: !!d.migrated
    };
  }

  /* ---- IndexedDB ----------------------------------------------------------- */

  function openDb() {
    return new Promise(function (resolve) {
      if (!global.indexedDB) { idbOk = false; resolve(null); return; }
      var req;
      try { req = global.indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { idbOk = false; resolve(null); return; }
      req.onupgradeneeded = function () {
        var store = req.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      };
      req.onsuccess = function () { db = req.result; resolve(db); };
      req.onerror = function () { idbOk = false; resolve(null); };
      req.onblocked = function () { idbOk = false; resolve(null); };
    });
  }

  function idbAll() {
    return new Promise(function (resolve, reject) {
      var req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbGet(id) {
    return new Promise(function (resolve, reject) {
      var req = db.transaction(STORE).objectStore(STORE).get(id);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function idbPut(doc) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(doc);
      tx.oncomplete = function () { resolve(doc); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function idbDelete(id) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  /* ---- localStorage fallback ---------------------------------------------- */
  function lsRead() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function lsWrite(arr) {
    try {
      if (arr.length) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }
      else { localStorage.removeItem(LS_KEY); }
    } catch (e) { /* full */ }
  }

  async function localAll() {
    if (idbOk && db) {
      try { return await idbAll(); } catch (e) { return lsRead(); }
    }
    return lsRead();
  }

  async function localPut(doc) {
    if (idbOk && db) {
      try {
        await idbPut(doc);
        /* Clear a stale fallback copy left by an earlier IndexedDB failure. */
        lsRemove(doc.id);
        return doc;
      } catch (e) { /* fall through */ }
    }
    lsUpsert(doc);
    return doc;
  }

  async function localRemove(id) {
    if (idbOk && db) {
      try { await idbDelete(id); } catch (e) { /* also clear fallback below */ }
    }
    /* Always clear localStorage too. A note must not survive invisibly in a
       fallback store after the user deletes or successfully migrates it. */
    lsRemove(id);
  }

  async function storeCloudMirror(doc) {
    if (idbOk && db) {
      try {
        await idbPut(doc);
        lsRemove(doc.id);
        return;
      } catch (e) { /* do not put completed cloud copies in localStorage */ }
    }
    /* localStorage is only a fallback for unsynced data. Once Supabase has the
       note, remove that fallback copy rather than retaining a duplicate. */
    lsRemove(doc.id);
  }

  /* ---- Supabase mapping ---------------------------------------------------- */

  function clientAvailable() {
    return !!(global.CloudSync && global.CloudSync.isAuthenticated() &&
              typeof global.CloudSync.client === 'function' && global.CloudSync.client());
  }

  function docToRow(doc) {
    var userId = global.CloudSync && global.CloudSync.userId
      ? global.CloudSync.userId() : null;
    if (!userId) { throw new Error('A signed-in user is required to sync notes.'); }
    return {
      id: doc.id,
      user_id: userId,
      title: doc.title,
      content_html: doc.contentHtml,
      search_text: doc.searchText || '',
      script: doc.script,
      font_family: doc.fontFamily || '',
      font_size: doc.fontSize,
      direction: doc.dir,
      line_height: doc.lineHeight,
      starred: doc.starred,
      word_count: doc.wordCount,
      char_count: doc.charCount,
      created_at: doc.createdAt,
      updated_at: doc.updatedAt
    };
  }

  function rowToDoc(row) {
    return normalize({
      id: row.id,
      title: row.title,
      contentHtml: row.content_html,
      searchText: row.search_text,
      script: row.script,
      fontFamily: row.font_family,
      fontSize: row.font_size,
      dir: row.direction,
      lineHeight: row.line_height,
      starred: row.starred,
      wordCount: row.word_count,
      charCount: row.char_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      localOwnerId: global.CloudSync && global.CloudSync.userId
        ? global.CloudSync.userId() : null
    });
  }

  /** Fire-and-forget remote mutation with sync status callbacks. */
  function enqueueRemote(operation) {
    if (!clientAvailable() || cloudBroken) { return; }
    remoteQueue = remoteQueue.then(function () {
      if (syncCb) { syncCb('syncing'); }
      return operation();
    }).then(function () {
      if (syncCb) { syncCb('saved'); }
    }).catch(function (error) {
      console.warn('[Notebook] Cloud sync failed.', error);
      if (isSetupError(error)) {
        cloudBroken = true;
        if (syncCb) { syncCb('setup'); }
      } else {
        if (syncCb) { syncCb(navigator.onLine ? 'error' : 'offline'); }
      }
    });
  }

  function flushQueue() {
    var tail = remoteQueue;
    remoteQueue = Promise.resolve();
    return tail.catch(function () {});
  }

  /* ---- Public API ----------------------------------------------------------- */

  var api = {
    /** Open IndexedDB (best effort). New notebooks deliberately start empty. */
    init: async function () {
      if (!initPromise) { initPromise = openDb(); }
      await initPromise;
    },

    isCloud: function () { return clientAvailable(); },

    /** All documents visible in the current mode, newest edit first. */
    list: async function () {
      var docs = (await localAll()).map(normalize);

      if (clientAvailable() && !cloudBroken) {
        try {
          var rows = await global.CloudSync.client()
            .from('notebook_documents')
            .select('*')
            .order('updated_at', { ascending: false })
            .limit(500);
          if (rows.error) { throw rows.error; }
          var cloudDocs = rows.data.map(rowToDoc);
          var userId = global.CloudSync.userId();
          var cloudIds = {};
          cloudDocs.forEach(function (cloudDoc) { cloudIds[cloudDoc.id] = true; });

          /* Remove stale mirrors for this account and replace live ones. Guest
             documents stay alongside them until automatic migration succeeds. */
          for (var i = 0; i < docs.length; i++) {
            if (docs[i].localOwnerId === userId && !docs[i].cloudPending &&
                !cloudIds[docs[i].id]) {
              await localRemove(docs[i].id);
            }
          }
          for (var j = 0; j < cloudDocs.length; j++) {
            await storeCloudMirror(cloudDocs[j]);
          }

          var localOnlyDocs = docs.filter(function (localDoc) {
            var guest = !localDoc.localOwnerId && !localDoc.migrated;
            var pending = localDoc.localOwnerId === userId && localDoc.cloudPending;
            return (guest || pending) && !cloudIds[localDoc.id] &&
              hasRealContent(localDoc);
          });
          return cloudDocs.concat(localOnlyDocs).sort(function (a, b) {
            return new Date(b.updatedAt) - new Date(a.updatedAt);
          });
        } catch (error) {
          console.warn('[Notebook] Cloud list failed; using cached copies.', error);
          if (isSetupError(error)) {
            cloudBroken = true;
            if (syncCb) { syncCb('setup'); }
          } else if (syncCb) {
            syncCb('offline');
          }
          /* fall through to cached guest+mirror docs */
        }
      }
      docs = docs.filter(function (localDoc) {
        if (clientAvailable()) {
          var userId = global.CloudSync.userId();
          return !localDoc.localOwnerId || localDoc.localOwnerId === userId;
        }
        return !localDoc.localOwnerId && !localDoc.migrated;
      });
      docs.sort(function (a, b) {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });
      return docs;
    },

    /** Local-only list (no network). Used for instant first paint. */
    listLocal: async function () {
      var docs = (await localAll()).map(normalize);
      if (clientAvailable()) {
        var userId = global.CloudSync.userId();
        docs = docs.filter(function (d) {
          return !d.localOwnerId || d.localOwnerId === userId;
        });
      } else {
        docs = docs.filter(function (d) { return !d.localOwnerId && !d.migrated; });
      }
      docs.sort(function (a, b) {
        return new Date(b.updatedAt) - new Date(a.updatedAt);
      });
      return docs;
    },

    get: async function (id) {
      var doc = null;
      if (idbOk && db) {
        try { doc = await idbGet(id); } catch (e) { doc = null; }
      }
      if (!doc) {
        doc = lsRead().filter(function (d) { return d.id === id; })[0] || null;
      }
      if (!doc && clientAvailable() && !cloudBroken) {
        try {
          var res = await global.CloudSync.client()
            .from('notebook_documents').select('*').eq('id', id).maybeSingle();
          if (!res.error && res.data) { doc = rowToDoc(res.data); }
        } catch (e) { /* offline */ }
      }
      return doc ? normalize(doc) : null;
    },

    /**
     * Persist one document. Resolves after the LOCAL write completes (so the
     * editor can show "Saved" quickly); the cloud copy follows in background.
     * @param {object} doc already-sanitized document object
     */
    put: async function (doc) {
      var clean = normalize(doc);
      clean.updatedAt = new Date().toISOString();
      if (clientAvailable()) {
        clean.localOwnerId = global.CloudSync.userId();
        clean.cloudPending = true;
        clean.migrated = false;
      }
      await localPut(clean);
      if (clientAvailable()) {
        enqueueRemote(async function () {
          var res = await global.CloudSync.client()
            .from('notebook_documents')
            .upsert(docToRow(clean), { onConflict: 'user_id,id' });
          if (res.error) { throw res.error; }
          var mirror = normalize(clean);
          mirror.cloudPending = false;
          await storeCloudMirror(mirror);
        });
      }
      return clean;
    },

    remove: async function (id) {
      await localRemove(id);
      if (clientAvailable() && !cloudBroken) {
        enqueueRemote(async function () {
          var res = await global.CloudSync.client()
            .from('notebook_documents').delete().eq('id', id);
          if (res.error) { throw res.error; }
        });
      }
      return true;
    },

    /** False once the backend schema is known to be missing this session. */
    remoteHealthy: function () { return !cloudBroken; },

    /** Wait for pending cloud writes (used before navigation/unload). */
    settle: flushQueue,

    /**
     * Automatically move guest notes into the authenticated account. The local
     * guest copy is deleted only after its Supabase upsert succeeds. Existing
     * cloud IDs are treated as already migrated, preventing an old mirror from
     * overwriting a newer server copy.
     * @returns {number} how many guest notes were uploaded
     */
    migrateLocalToCloud: async function () {
      var allDocs = (await localAll()).map(normalize);
      var guestDocs = allDocs.filter(function (d) {
        return !d.localOwnerId && !d.migrated && hasRealContent(d);
      });
      if (!guestDocs.length) { return 0; }

      var cl = global.CloudSync && global.CloudSync.client
        ? global.CloudSync.client() : null;
      if (!cl || !clientAvailable()) {
        var authError = new Error('Your account session is not ready yet.');
        authError.code = 'NB_AUTH_UNAVAILABLE';
        throw authError;
      }

      try {
        var existing = await cl.from('notebook_documents').select('id');
        if (existing.error) { throw existing.error; }
        var cloudIds = {};
        (existing.data || []).forEach(function (row) { cloudIds[row.id] = true; });
        var imported = 0;

        for (var i = 0; i < guestDocs.length; i++) {
          var d = guestDocs[i];
          if (!cloudIds[d.id]) {
            var res = await cl.from('notebook_documents')
              .upsert(docToRow(d), { onConflict: 'user_id,id' });
            if (res.error) { throw res.error; }
            imported++;
          }
          await localRemove(d.id);
        }

        /* Clean up legacy migration markers once their cloud counterpart is
           confirmed. They were intentionally retained by older releases. */
        for (var j = 0; j < allDocs.length; j++) {
          if (!allDocs[j].localOwnerId && allDocs[j].migrated && cloudIds[allDocs[j].id]) {
            await localRemove(allDocs[j].id);
          }
        }
        return imported;
      } catch (error) {
        if (isSetupError(error)) {
          cloudBroken = true;
          if (syncCb) { syncCb('setup'); }
        }
        throw error;
      }
    },

    onSync: function (cb) { syncCb = cb || null; },
    uid: uid,
    normalize: normalize
  };

  function lsUpsert(doc) {
    var arr = lsRead().filter(function (d) { return d.id !== doc.id; });
    arr.push(doc);
    lsWrite(arr);
  }
  function lsRemove(id) {
    lsWrite(lsRead().filter(function (d) { return d.id !== id; }));
  }

  /** Empty generated drafts are not migration candidates. */
  function hasRealContent(doc) {
    var html = String((doc && doc.contentHtml) || '');
    var text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, 'x')
      .replace(/\s+/g, ' ').trim();
    var title = String((doc && doc.title) || '').trim();
    return !!text || /<(img|table|hr)\b/i.test(html) ||
      (!!title && !/^Untitled Note(?: \d+)?$/.test(title));
  }

  global.NBStorage = api;
})(window);
