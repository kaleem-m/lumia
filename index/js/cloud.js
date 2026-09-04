/* ========================================================================== 
   Supabase authentication and private vocabulary synchronization.
   Guests continue to use Store's local cache; authenticated users hydrate from
   RLS-protected tables and every subsequent mutation is queued to Supabase.
   ========================================================================== */
(function (global) {
  'use strict';

  var config = global.LEXIO_SUPABASE_CONFIG || {};
  var client = null;
  var session = null;
  var activeUserId = null;
  var queue = Promise.resolve();
  var initialized = false;
  var esc = global.UI && UI.esc;

  function configured() {
    return !!(config.url && config.publishableKey && global.supabase);
  }

  function mapLanguage(row) {
    return {
      id: row.id,
      name: row.name,
      code: row.code || '',
      dir: row.direction || 'ltr',
      createdAt: new Date(row.created_at).getTime()
    };
  }

  function mapWord(row) {
    return {
      id: row.id,
      languageId: row.language_id,
      categoryId: row.category_id,
      term: row.term,
      nativeScript: row.native_script || '',
      meaning: row.meaning,
      example: row.example || '',
      dir: row.direction || 'auto',
      dateAdded: row.date_added,
      updatedAt: row.updated_at,
      stats: row.stats || {}
    };
  }

  function languageRow(language) {
    return {
      id: language.id,
      user_id: activeUserId,
      name: language.name,
      code: language.code || '',
      direction: language.dir || 'ltr',
      created_at: new Date(language.createdAt || Date.now()).toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  function wordRow(word) {
    return {
      id: word.id,
      user_id: activeUserId,
      language_id: word.languageId,
      category_id: word.categoryId,
      term: word.term,
      native_script: word.nativeScript || '',
      meaning: word.meaning,
      example: word.example || '',
      direction: word.dir || 'auto',
      date_added: word.dateAdded || new Date().toISOString(),
      updated_at: word.updatedAt || null,
      stats: word.stats || {}
    };
  }

  function assertResult(result) {
    if (result.error) { throw result.error; }
    return result.data;
  }

  function enqueue(operation) {
    if (!activeUserId) { return; }
    queue = queue.then(operation).catch(function (error) {
      console.error('[Lexio] Supabase sync failed.', error);
      UI.toast('Cloud sync failed. Your local copy is still available.', { icon: 'warning', duration: 5000 });
    });
  }

  function replaceAll(data) {
    enqueue(async function () {
      assertResult(await client.from('vocabulary_entries').delete().eq('user_id', activeUserId));
      assertResult(await client.from('user_languages').delete().eq('user_id', activeUserId));
      if (data.languages.length) {
        assertResult(await client.from('user_languages').insert(data.languages.map(languageRow)));
      }
      if (data.words.length) {
        assertResult(await client.from('vocabulary_entries').insert(data.words.map(wordRow)));
      }
    });
  }

  var adapter = {
    saveLanguage: function (language) {
      enqueue(async function () {
        assertResult(await client.from('user_languages').upsert(languageRow(language), { onConflict: 'user_id,id' }));
      });
    },
    deleteLanguage: function (id) {
      enqueue(async function () {
        assertResult(await client.from('user_languages').delete().eq('user_id', activeUserId).eq('id', id));
      });
    },
    saveWord: function (word) {
      enqueue(async function () {
        assertResult(await client.from('vocabulary_entries').upsert(wordRow(word), { onConflict: 'user_id,id' }));
      });
    },
    saveWords: function (words) {
      enqueue(async function () {
        if (words.length) {
          assertResult(await client.from('vocabulary_entries').upsert(words.map(wordRow), { onConflict: 'user_id,id' }));
        }
      });
    },
    deleteWord: function (id) {
      enqueue(async function () {
        assertResult(await client.from('vocabulary_entries').delete().eq('user_id', activeUserId).eq('id', id));
      });
    },
    replaceAll: replaceAll
  };

  async function loadUserData() {
    var languageResult = await client.from('user_languages').select('*').order('created_at');
    var wordResult = await client.from('vocabulary_entries').select('*').order('date_added');
    var languages = assertResult(languageResult).map(mapLanguage);
    var words = assertResult(wordResult).map(mapWord);
    return { languages: languages, words: words };
  }

  function hasMeaningfulLocalData() {
    return Store.languages().length > 0 || Store.words({ languageId: null }).length > 0;
  }

  function askToMoveGuestData() {
    return new Promise(function (resolve) {
      UI.modal({
        title: 'Save your guest vocabulary?',
        description: 'This account has no cloud vocabulary yet. You can move the words currently on this device into your private account.',
        body: '<div class="stack"><button type="button" class="option" data-choice="move"><span class="grow">' +
          '<span class="option__title">Move guest data to my account</span><br><span class="option__sub">Upload languages and words securely</span></span></button>' +
          '<button type="button" class="option" data-choice="fresh"><span class="grow"><span class="option__title">Start with an empty account</span><br>' +
          '<span class="option__sub">Leave guest data off the account</span></span></button></div>',
        onMount: function (panel, close) {
          UI.$$('[data-choice]', panel).forEach(function (button) {
            button.addEventListener('click', function () {
              var choice = button.dataset.choice;
              close();
              resolve(choice);
            });
          });
        },
        onClose: function () { resolve('fresh'); }
      });
    });
  }

  async function activateUser(user) {
    if (!user || activeUserId === user.id) { syncAuthUI(); return; }
    Store.setRemoteAdapter(null);
    var remote = await loadUserData();
    // The session can change while the database requests are in flight.
    if (!session || !session.user || session.user.id !== user.id) { return; }
    // Only mark activation complete after cloud access succeeds. A missing
    // schema or RLS error can then be retried instead of leaving a stale id.
    activeUserId = user.id;
    if (!remote.languages.length && !remote.words.length && hasMeaningfulLocalData()) {
      var choice = await askToMoveGuestData();
      if (choice === 'move') {
        replaceAll({ languages: Store.languages(), words: Store.words({ languageId: null }) });
      } else {
        Store.replaceCloudData([], []);
      }
    } else {
      Store.replaceCloudData(remote.languages, remote.words);
    }
    Store.setRemoteAdapter(adapter);
    syncAuthUI();
    UI.toast('Signed in. Your private vocabulary is synced.');
    /* Sections beyond vocabulary (e.g. Notebook) listen for this to switch
       their storage backend and offer local-note migration. */
    global.dispatchEvent(new CustomEvent('lexio:signed-in'));
  }

  function deactivateUser() {
    Store.setRemoteAdapter(null);
    activeUserId = null;
    session = null;
    Store.replaceCloudData([], []);
    syncAuthUI();
  }

  function syncAuthUI() {
    var button = document.getElementById('account-button');
    var label = document.getElementById('account-label');
    var note = document.getElementById('storage-note-copy');
    var name = session && session.user
      ? (session.user.user_metadata &&
         (session.user.user_metadata.display_name || session.user.user_metadata.full_name)) || ''
      : '';
    if (button) {
      button.dataset.signedIn = session && session.user ? 'true' : 'false';
      button.setAttribute('aria-label', session && session.user ? 'Account menu' : 'Sign in or create an account');
    }
    if (label) { label.textContent = session && session.user ? (name || 'Account') : 'Sign in'; }
    if (note) {
      note.textContent = session && session.user
        ? 'Your vocabulary is privately synced to your account.'
        : 'Guest mode: words stay on this device and are not securely backed up.';
    }
    var saveNotes = UI.$$('.form-submit__note');
    saveNotes.forEach(function (node) {
      node.textContent = session && session.user ? 'Saved privately to your account' : 'Guest mode · saved only on this device';
    });
  }

  function authError(error) {
    UI.toast(error && error.message ? error.message : 'Authentication failed', { icon: 'warning', duration: 5000 });
  }

  function openAccount() {
    if (!configured()) {
      UI.modal({
        title: 'Cloud setup needed',
        description: 'The public Supabase browser configuration is missing from this deployment.',
        body: '<div class="modal__actions"><button type="button" class="btn" data-act="close">Close</button></div>',
        onMount: function (panel, close) { UI.$('[data-act="close"]', panel).addEventListener('click', close); }
      });
      return;
    }
    if (session && session.user) { openSignedInAccount(); }
    else { openSignIn(); }
  }

  function openSignIn() {
    UI.modal({
      title: 'Your private vocabulary',
      description: 'Sign in to securely sync words across devices, or continue as a guest on this device.',
      body: '<div class="guest-warning">' + Icon('warning') + '<p><strong>Guest words are not securely saved.</strong><br>Clearing browser data or changing devices can remove them.</p></div>' +
        '<button type="button" class="btn btn--google" data-auth="google">Continue with Google</button>' +
        '<div class="auth-divider"><span>or use email</span></div>' +
        '<form id="auth-form" class="stack" autocomplete="on">' +
          '<label class="field"><span class="field__label">Email</span><input class="field__input" type="email" name="email" required autocomplete="email" data-autofocus></label>' +
          '<label class="field"><span class="field__label">Password</span><input class="field__input" type="password" name="password" required minlength="6" autocomplete="current-password"></label>' +
          '<div class="auth-actions"><button type="submit" class="btn btn--primary" data-auth="signin">Sign in</button>' +
          '<button type="button" class="btn" data-auth="signup">Create account</button></div>' +
        '</form><button type="button" class="btn btn--ghost auth-guest" data-auth="guest">Continue as guest</button>',
      onMount: function (panel, close) {
        UI.$('[data-auth="guest"]', panel).addEventListener('click', close);
        UI.$('[data-auth="google"]', panel).addEventListener('click', async function () {
          var result = await client.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: global.location.origin + global.location.pathname }
          });
          if (result.error) { authError(result.error); }
        });
        var form = UI.$('#auth-form', panel);
        form.addEventListener('submit', async function (event) {
          event.preventDefault();
          var fd = new FormData(form);
          var result = await client.auth.signInWithPassword({ email: String(fd.get('email')), password: String(fd.get('password')) });
          if (result.error) { authError(result.error); } else { close(); }
        });
        UI.$('[data-auth="signup"]', panel).addEventListener('click', async function () {
          if (!form.reportValidity()) { return; }
          var fd = new FormData(form);
          var result = await client.auth.signUp({ email: String(fd.get('email')), password: String(fd.get('password')) });
          if (result.error) { authError(result.error); return; }
          close();
          UI.toast(result.data.session ? 'Account created' : 'Check your email to confirm your account.', { duration: 5000 });
        });
      }
    });
  }

  function openSignedInAccount() {
    var email = session.user.email || 'Signed-in user';
    UI.modal({
      title: 'Account',
      description: 'Your languages and vocabulary are protected by per-user database policies.',
      body: '<div class="account-card"><strong>' + esc(email) + '</strong><span>Private cloud sync is on</span></div>' +
        '<div class="modal__actions"><button type="button" class="btn" data-act="close">Close</button>' +
        '<button type="button" class="btn btn--danger" data-auth="signout">Sign out</button></div>',
      onMount: function (panel, close) {
        UI.$('[data-act="close"]', panel).addEventListener('click', close);
        UI.$('[data-auth="signout"]', panel).addEventListener('click', async function () {
          var result = await client.auth.signOut();
          if (result.error) { authError(result.error); return; }
          close();
          UI.toast('Signed out. Guest mode is active.');
        });
      }
    });
  }

  async function init() {
    if (initialized) { return; }
    initialized = true;
    var button = document.getElementById('account-button');
    if (button) { button.addEventListener('click', function () { App.openAccountMenu(); }); }
    syncAuthUI();
    if (!configured()) {
      console.warn('[Lexio] Supabase is not configured. Guest mode is active.');
      return;
    }
    client = global.supabase.createClient(config.url, config.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // PKCE returns the OAuth code in the query string instead of putting
        // access tokens in the hash used by Lexio's client-side router.
        flowType: 'pkce'
      }
    });
    var current = await client.auth.getSession();
    if (current.error) { authError(current.error); }
    session = current.data.session;
    // Authentication and cloud hydration are separate states. Reflect a valid
    // session immediately even if loading the user's vocabulary later fails.
    syncAuthUI();
    if (session && session.user) {
      try { await activateUser(session.user); } catch (error) { authError(error); }
    }
    client.auth.onAuthStateChange(function (event, nextSession) {
      session = nextSession;
      syncAuthUI();
      setTimeout(function () {
        if (nextSession && nextSession.user) {
          activateUser(nextSession.user).catch(authError);
        } else if (event === 'SIGNED_OUT') {
          deactivateUser();
        } else {
          syncAuthUI();
        }
      }, 0);
    });
  }

  global.CloudSync = {
    init: init,
    openAccount: openAccount,
    openSignIn: openSignIn,
    isConfigured: configured,
    isAuthenticated: function () { return !!(session && session.user); },
    /** The authenticated user's id, or null in guest mode. */
    userId: function () { return session && session.user ? session.user.id : null; },

    /**
     * The shared Supabase client (or null when unconfigured/signed-out
     * initialization hasn't run). Lets additional modules reuse the single
     * authenticated session instead of creating duplicate clients.
     */
    client: function () { return session && session.user ? client : null; },

    /** Sign out and return to the signed-out (guest) state. */
    signOut: async function () {
      if (!client) { return; }
      var result = await client.auth.signOut();
      if (result.error) { authError(result.error); return false; }
      UI.toast('Signed out. Guest mode is active.');
      return true;
    },

    /** Safe snapshot of the signed-in identity for the Account page. */
    accountSummary: function () {
      if (!(session && session.user)) {
        var guestName = Store.settings.profile && Store.settings.profile.displayName;
        return {
          authenticated: false,
          email: null,
          createdAt: null,
          provider: null,
          displayName: guestName || '',
        };
      }
      var u = session.user;
      var meta = u.user_metadata || {};
      var provider = (u.app_metadata && u.app_metadata.provider) ||
        (u.identities && u.identities[0] && u.identities[0].provider) || 'email';
      return {
        authenticated: true,
        email: u.email || '',
        createdAt: u.created_at || null,
        provider: provider === 'email' ? 'email' : provider,
        displayName: meta.display_name || meta.full_name || '',
      };
    },

    /** Persist the display name to Supabase user metadata. */
    updateDisplayName: async function (name) {
      if (!configured() || !(session && session.user)) {
        throw new Error('Sign in to save your profile across devices.');
      }
      var result = await client.auth.updateUser({ data: { display_name: name } });
      if (result.error) { throw result.error; }
      session.user = result.data.user;
      syncAuthUI();
      return true;
    },

    changePassword: async function (currentPassword, nextPassword) {
      if (!configured() || !(session && session.user)) {
        throw new Error('Sign in first.');
      }
      // Verify the current password before allowing a change.
      var check = await client.auth.signInWithPassword({
        email: session.user.email,
        password: currentPassword,
      });
      if (check.error) { throw new Error('Current password is incorrect.'); }
      var result = await client.auth.updateUser({ password: nextPassword });
      if (result.error) { throw result.error; }
      return true;
    },

    sendResetEmail: async function () {
      if (!configured() || !(session && session.user) || !session.user.email) {
        throw new Error('Sign in first.');
      }
      var result = await client.auth.resetPasswordForEmail(session.user.email, {
        redirectTo: global.location.origin + global.location.pathname,
      });
      if (result.error) { throw result.error; }
      return true;
    },

    /** Permanently delete the account via the service-role edge function. */
    requestAccountDeletion: async function () {
      if (!configured()) { throw new Error('Cloud is not configured.'); }
      var result = await client.functions.invoke('delete-account');
      if (result.error) { throw result.error; }
      if (result.data && result.data.error) { throw new Error(result.data.error); }
      await global.CloudSync.signOut();
      Store.resetAll();
      return true;
    },

    /**
     * Call the storage-only AI gateway. The key is present in this request only
     * when the user saves it; neither the response nor browser storage retains it.
     */
    aiInvoke: async function (body) {
      if (!configured()) { throw new Error('Cloud is not configured.'); }
      if (!(session && session.user)) { throw new Error('Sign in to connect an AI provider.'); }

      var result = await client.functions.invoke('ai-gateway', { body: body });
      if (!result.error) { return result.data; }

      // FunctionsHttpError keeps the Edge Function response in `context`.
      // Surface its safe JSON message instead of Supabase's generic wrapper.
      var context = result.error.context;
      if (context && typeof context.clone === 'function') {
        try {
          var payload = await context.clone().json();
          if (payload && payload.error) { throw new Error(String(payload.error)); }
        } catch (parseError) {
          if (parseError instanceof Error && parseError.message &&
              parseError.name !== 'SyntaxError') {
            throw parseError;
          }
        }
      }

      if (result.error.name === 'FunctionsFetchError') {
        throw new Error('The AI gateway could not be reached. Check that the function is deployed and try again.');
      }
      throw new Error(result.error.message || 'The AI gateway request failed.');
    },
  };
})(window);
