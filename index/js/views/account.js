/* ==========================================================================
   My Account — profile, learning overview, preferences, BYOK-AI connector,
   security, and data controls.

   Identity lives in Supabase Auth (guests fall back to local settings).
   AI keys are NEVER stored in the browser: the client sends a key once to
   the 'ai-gateway' edge function, which keeps it encrypted in Supabase
   Vault and uses it server-side. This UI only ever handles status/hints.
   ========================================================================== */
(function (global) {
  'use strict';

  var esc = UI.esc;

  /* ---- small helpers ------------------------------------------------------ */

  function initials(summary) {
    var source = summary.displayName || summary.email || '';
    var parts = source.trim().split(/[\s@._-]+/).filter(Boolean);
    var letters = (parts[0] ? parts[0][0] : '') + (parts[1] ? parts[1][0] : '');
    return (letters || 'L').toUpperCase();
  }

  function fmtMemberSince(iso) {
    if (!iso) { return null; }
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function csvCell(value) {
    value = String(value == null ? '' : value);
    return /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
  }

  function exportVocabularyCSV() {
    var lang = Store.activeLanguage();
    var header = 'category,term,native_script,meaning,example,direction,date_added';
    var rows = Store.words().map(function (w) {
      return [w.categoryId, w.term, w.nativeScript || '', w.meaning,
        w.example, w.dir, w.dateAdded].map(csvCell).join(',');
    });
    download('lexio-vocabulary.csv', [header].concat(rows).join('\n'), 'text/csv;charset=utf-8');
    UI.toast('Vocabulary exported as CSV', { icon: 'download' });
  }

  function downloadFullBackup() {
    download(Store.exportFilename(), Store.exportJSON(), 'application/json');
    UI.toast('Full backup downloaded', { icon: 'download' });
  }

  /* ---- section builders ----------------------------------------------------- */

  function profileCard(summary, langName) {
    var memberSince = fmtMemberSince(summary.createdAt);
    var identityRows =
      row('Email', summary.email ? esc(summary.email) : '<em>Not signed in</em>') +
      row('Member since', memberSince ? esc(memberSince) : '<em>—</em>') +
      row('Signed in via', summary.provider === 'google' ? 'Google account'
        : summary.provider === 'email' ? 'Email &amp; password'
        : '<em>Guest mode</em>');

    return '' +
      '<section class="card card--pad acct-section" aria-labelledby="ac-profile">' +
        '<div class="acct-profile">' +
          '<span class="avatar" aria-hidden="true">' + esc(initials(summary)) + '</span>' +
          '<div class="acct-profile__text">' +
            '<h2 id="ac-profile" class="acct-name">' +
              esc(summary.displayName || (summary.authenticated ? 'Your account' : 'Guest')) + '</h2>' +
            '<p class="acct-sub">' +
              (summary.authenticated ? esc(summary.email) + ' · ' : '') +
              esc(langName ? 'Studying ' + langName : 'No language yet') + '</p>' +
          '</div>' +
          '<button type="button" class="btn btn--sm" data-act="edit-profile">' + Icon('edit') + 'Edit profile</button>' +
        '</div>' +
        '<dl class="acct-rows">' + identityRows + '</dl>' +
      '</section>';

    function row(label, value) {
      return '<div class="acct-row"><dt>' + label + '</dt><dd>' + value + '</dd></div>';
    }
  }

  function learningCard(snap, recentWords, lang) {
    var t = snap.totals;
    var inProgress = 0;
    Store.words().forEach(function (w) {
      if ((Number(w.stats.seen) || 0) > 0 && !Store.isLearned(w.id)) { inProgress++; }
    });
    var pct = t.words ? Math.round((t.learned / t.words) * 100) : 0;

    var langs = Store.languages();
    var langChips = langs.length
      ? langs.map(function (l) {
          var active = lang && l.id === lang.id;
          return '<span class="tag' + (active ? ' tag--accent' : '') + '">' +
            esc(l.name) + ' · ' + Store.words({ languageId: l.id }).length + '</span>';
        }).join('')
      : '<span class="acct-empty-line">No languages yet.</span>';

    var recent = recentWords.length
      ? '<ul class="summary__words">' + recentWords.map(function (w) {
          var native = WordDisplay.secondary(w);
          return '' +
            '<li class="sum-word">' +
              '<span class="sum-word__icon is-good" aria-hidden="true">' + Icon('seed') + '</span>' +
              '<span class="sum-word__text">' +
                '<strong dir="auto">' + esc(WordDisplay.primary(w)) + '</strong>' +
                (native ? '<span class="sum-word__native" dir="' + WordDisplay.dirOf(w, lang) + '">' + esc(native) + '</span>' : '') +
                '<span dir="auto">' + esc(w.meaning) + '</span>' +
              '</span>' +
            '</li>';
        }).join('') + '</ul>'
      : '<p class="acct-empty-line">Words you add will collect here.</p>';

    return '' +
      '<section class="card card--pad acct-section" aria-labelledby="ac-learning">' +
        '<h2 id="ac-learning">My learning</h2>' +
        '<div class="acct-stats">' +
          acctStat(t.words, 'in vocabulary') +
          acctStat(t.learned, 'learned') +
          acctStat(inProgress, 'still learning') +
          acctStat(t.streak, 'day streak') +
        '</div>' +
        '<div class="acct-progress">' +
          '<div class="row row--between"><span class="acct-label">Overall progress</span>' +
            '<span class="acct-pct">' + pct + '%</span></div>' +
          '<span class="bar"><span class="bar__fill" style="inline-size:' + pct + '%"></span></span>' +
        '</div>' +
        '<div class="acct-block"><span class="acct-label">Languages</span>' +
          '<div class="acct-chips">' + langChips + '</div></div>' +
        '<div class="acct-block"><span class="acct-label">Recently added</span>' + recent + '</div>' +
      '</section>';

    function acctStat(value, label) {
      return '<div class="summary__stat"><b>' + value + '</b><span>' + esc(label) + '</span></div>';
    }
  }

  function preferencesCard(dark) {
    var nativeOn = Store.settings.showNativeScript !== false;
    var theme = Store.settings.theme || 'system';
    return '' +
      '<section class="card card--pad acct-section" aria-labelledby="ac-prefs">' +
        '<h2 id="ac-prefs">Preferences</h2>' +
        '<label class="switch">' +
          '<input type="checkbox" id="pref-native"' + (nativeOn ? ' checked' : '') + '>' +
          '<span class="switch__track" aria-hidden="true"><span class="switch__thumb"></span></span>' +
          '<span class="switch__text"><strong>Show native script spellings</strong>' +
            '<small>The second line under transliterated words, everywhere.</small></span>' +
        '</label>' +
        '<div class="acct-block"><span class="acct-label">Theme</span>' +
          '<div class="seg" role="radiogroup" aria-label="Theme">' +
            segOpt('light', 'Light', theme) +
            segOpt('dark', 'Dark', theme) +
            segOpt('system', 'System', theme) +
          '</div></div>' +
      '</section>';

    function segOpt(value, label, current) {
      return '<label class="seg__opt"><input type="radio" name="pref-theme" value="' + value + '"' +
        (current === value ? ' checked' : '') + '><span>' + label + '</span></label>';
    }
  }

  const PROVIDERS = [
    { id: 'openai', name: 'OpenAI', hint: 'sk-…' },
    { id: 'anthropic', name: 'Anthropic', hint: 'sk-ant-…' },
    { id: 'gemini', name: 'Google Gemini', hint: 'AIza…' },
    { id: 'openrouter', name: 'OpenRouter', hint: 'sk-or-…' },
    { id: 'omni', name: 'OmniRouter', hint: '' },
    { id: 'custom', name: 'Other compatible', hint: 'OpenAI-style base URL' },
  ];

  function aiCard(summary) {
    var ready = summary.authenticated && global.CloudSync.isConfigured();
    var body = ready
      ? '<div id="ai-status" class="ai-status" aria-live="polite">Checking your connection…</div>' +
        '<form id="ai-form" class="stack">' +
          '<fieldset class="ai-providers"><legend class="acct-label">Provider</legend>' +
            PROVIDERS.map(function (p, i) {
              return '<label class="ai-provider"><input type="radio" name="ai-provider" value="' + p.id + '"' +
                (i === 0 ? ' checked' : '') + '><span class="ai-provider__tile"><strong>' + esc(p.name) + '</strong>' +
                (p.hint ? '<small>Keys start with <code>' + esc(p.hint) + '</code></small>'
                        : '<small>&nbsp;</small>') + '</span></label>';
            }).join('') +
          '</fieldset>' +
          '<label class="field"><span class="field__label">API key</span>' +
            '<input class="field__input" type="password" name="apiKey" autocomplete="off" spellcheck="false" ' +
            'placeholder="Paste your key — it is sent once, encrypted at rest, never stored here">' +
            '<span class="field__hint">Sent over HTTPS straight to the gateway, stored encrypted in Supabase Vault, never written to this browser.</span></label>' +
          '<label class="field" data-show-when="custom" hidden><span class="field__label">API base URL <span class="optional">Custom provider only</span></span>' +
            '<input class="field__input" type="url" name="baseUrl" placeholder="https://api.example.com/v1"></label>' +
          '<div class="modal__actions"><button type="button" class="btn" data-act="ai-clear">Disconnect</button>' +
            '<button type="submit" class="btn btn--primary">' + Icon('shield') + 'Save key securely</button></div>' +
        '</form>'
      : '<p class="acct-note">' + Icon('lock') +
        'Connect your own AI provider to unlock AI-powered language-learning features. ' +
        (summary.authenticated
          ? 'The cloud configuration is missing on this deployment.'
          : 'Sign in first — keys belong to an account.') + '</p>';

    return '' +
      '<section class="card card--pad acct-section" aria-labelledby="ac-ai">' +
        '<h2 id="ac-ai">AI assistant <span class="tag">Bring your own key</span></h2>' +
        '<p class="acct-lede">Connect your own AI provider to unlock AI-powered language-learning ' +
        'features. Your API key belongs to you — Lexio never pays for your usage and never ' +
        'sees your key beyond this one encrypted handoff.</p>' +
        '<ol class="ai-flow" aria-label="How your key is handled">' +
          '<li>Your browser sends the key once over HTTPS to our gateway.</li>' +
          '<li>A Supabase Edge Function encrypts it in Vault. It is not stored in this browser.</li>' +
          '<li>When you use an AI feature, the gateway reads it server-side and calls your provider.</li>' +
          '<li>Only the response comes back to you.</li>' +
        '</ol>' +
        body +
      '</section>';
  }

  function securityCard(summary) {
    if (!summary.authenticated) {
      return '' +
        '<section class="card card--pad acct-section" aria-labelledby="ac-security">' +
          '<h2 id="ac-security">Security</h2>' +
          '<p class="acct-note">' + Icon('lock') + 'You are browsing as a guest — nothing to secure yet.</p>' +
          '<button type="button" class="btn btn--primary" data-act="signin">' + 'Sign in or create an account</button>' +
        '</section>';
    }
    var isGoogle = summary.provider === 'google';
    var passwordRows = isGoogle
      ? acctNote('Password settings are managed by your Google account.')
      : '<button type="button" class="btn btn--sm" data-act="change-password">Change password</button>' +
        '<button type="button" class="btn btn--sm" data-act="reset-password">Email me a reset link</button>';
    return '' +
      '<section class="card card--pad acct-section" aria-labelledby="ac-security">' +
        '<h2 id="ac-security">Security</h2>' +
        '<dl class="acct-rows">' +
          '<div class="acct-row"><dt>Connected Google account</dt>' +
            '<dd>' + (isGoogle ? '<span class="tag tag--accent">Connected</span>' : '<span class="tag">Not linked</span>') + '</dd></div>' +
        '</dl>' +
        '<div class="acct-actions">' + passwordRows + '</div>' +
        '<div class="acct-actions">' +
          '<button type="button" class="btn" data-act="signout">Sign out</button>' +
          '<button type="button" class="btn btn--danger" data-act="delete-account">Delete account</button>' +
        '</div>' +
      '</section>';
  }

  function dataCard(summary) {
    return '' +
      '<section class="card card--pad acct-section" aria-labelledby="ac-data">' +
        '<h2 id="ac-data">Data</h2>' +
        '<p class="acct-lede">Your notebook is yours. Take it anywhere.</p>' +
        '<div class="acct-actions">' +
          '<button type="button" class="btn btn--sm" data-act="export-csv">' + Icon('download') + 'Export vocabulary (CSV)</button>' +
          '<button type="button" class="btn btn--sm" data-act="export-json">' + Icon('download') + 'Download my data (JSON)</button>' +
          '<button type="button" class="btn btn--sm" data-act="import-json">' + Icon('upload') + 'Import backup</button>' +
          (summary.authenticated
            ? '<button type="button" class="btn btn--sm" data-act="copy-device-notes">' +
                Icon('cloud') + 'Copy device notes to account</button>'
            : '') +
          '<button type="button" class="btn btn--danger btn--sm" data-act="clear-vocab">' + Icon('trash') + 'Delete my vocabulary</button>' +
        '</div>' +
        '<input type="file" id="acct-import-file" accept="application/json,.json" class="sr-only">' +
      '</section>';
  }

  function acctNote(text) {
    return '<p class="acct-note">' + Icon('info') + esc(text) + '</p>';
  }

  /* ---- render ---------------------------------------------------------------- */

  function render(root) {
    var summary = global.CloudSync.accountSummary();
    var snap = Store.reviewSnapshot();
    var lang = Store.activeLanguage();
    var dark = document.documentElement.dataset.theme === 'dark';
    var recentWords = Store.words()
      .slice()
      .sort(function (a, b) { return String(b.dateAdded).localeCompare(String(a.dateAdded)); })
      .slice(0, 6);

    root.innerHTML =
      '<header class="page-head">' +
        '<span class="eyebrow">My Account</span>' +
        '<h1>' + esc(summary.displayName ||
          (summary.authenticated ? 'Your place in Lexio.' : 'Guest, by choice.')) + '</h1>' +
        '<p>' + (summary.authenticated
          ? 'Everything about your membership — profile, progress, keys, and your data.'
          : 'You have full access on this device. Sign in to sync words and unlock AI features.') + '</p>' +
      '</header>' +
      '<div class="acct-grid">' +
        '<div class="acct-col">' +
          profileCard(summary, lang ? lang.name : '') +
          preferencesCard(dark) +
        '</div>' +
        '<div class="acct-col">' +
          learningCard(snap, recentWords, lang) +
          aiCard(summary) +
          securityCard(summary) +
          dataCard(summary) +
        '</div>' +
      '</div>';

    bind(root, summary);
    refreshAiStatus(summary);
  }

  function refreshAiStatus(summary) {
    var slot = document.getElementById('ai-status');
    if (!slot || !summary.authenticated || !global.CloudSync.isConfigured()) { return; }
    CloudSync.aiInvoke({ action: 'status' }).then(function (state) {
      if (!slot.isConnected) { return; }
      slot.innerHTML = state.connected
        ? '<span class="tag tag--accent">Connected · ' + esc(String(state.provider)) +
          ' ····' + esc(String(state.hint)) + '</span>'
        : '<span class="tag">No provider connected yet</span>';
    }).catch(function () {
      slot.innerHTML = '<span class="tag">Gateway unavailable on this deployment</span>';
    });
  }

  /* ---- interactions ----------------------------------------------------------- */

  function bind(root, summary) {
    root.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-act]');
      if (!btn) { return; }
      var act = btn.dataset.act;

      if (act === 'edit-profile') { openProfileEditor(summary); }
      if (act === 'signin') { CloudSync.openSignIn(); }
      if (act === 'signout') {
        CloudSync.signOut().then(function (done) {
          if (done) { Router.go('/home'); }
        });
      }
      if (act === 'change-password') { openChangePassword(); }
      if (act === 'reset-password') {
        UI.confirm({
          title: 'Send a reset link?',
          description: 'A password-reset email will be sent to ' + (summary.email || 'your address') + '.',
          confirmText: 'Send email'
        }, function () {
          CloudSync.sendResetEmail().then(function () {
            UI.toast('Reset link sent — check your inbox.');
          }).catch(function (e) { UI.toast(e.message, { icon: 'warning' }); });
        });
      }
      if (act === 'delete-account') { confirmDeleteAccount(); }
      if (act === 'export-csv') { exportVocabularyCSV(); }
      if (act === 'export-json') { downloadFullBackup(); }
      if (act === 'import-json') { UI.$('#acct-import-file', root).click(); }
      if (act === 'copy-device-notes') { offerNotebookMigration(); }
      if (act === 'clear-vocab') {
        UI.confirm({
          title: 'Delete every word?',
          description: 'All words and their learning history are removed. Languages and backups are kept.',
          confirmText: 'Delete vocabulary', danger: true
        }, function () {
          Store.clearVocabulary();
          UI.toast('Vocabulary deleted', { icon: 'trash' });
        });
      }
      if (act === 'ai-clear') {
        CloudSync.aiInvoke({ action: 'clear-key' }).then(function () {
          UI.toast('Provider disconnected.', { icon: 'shield' });
          refreshAiStatus(summary);
        }).catch(function (e) { UI.toast(e.message, { icon: 'warning' }); });
      }
    });

    var nativeToggle = UI.$('#pref-native', root);
    if (nativeToggle) {
      nativeToggle.addEventListener('change', function () {
        Store.setSetting('showNativeScript', nativeToggle.checked);
        Router.refresh();
        UI.toast(nativeToggle.checked ? 'Native script shown' : 'Native script hidden');
      });
    }

    UI.$$('input[name="pref-theme"]', root).forEach(function (radio) {
      radio.addEventListener('change', function () {
        Store.setSetting('theme', radio.value);
        global.App.applyTheme();
      });
    });

    var aiForm = UI.$('#ai-form', root);
    if (aiForm) {
      aiForm.addEventListener('change', function (e) {
        if (e.target.name === 'ai-provider') {
          var customHint = UI.$('[data-show-when="custom"]', aiForm);
          var baseUrlInput = UI.$('[name="baseUrl"]', aiForm);
          var isCustom = e.target.value === 'custom';
          if (customHint) { customHint.hidden = !isCustom; }
          if (baseUrlInput) { baseUrlInput.required = isCustom; }
        }
      });
      aiForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var fd = new FormData(aiForm);
        var payload = {
          action: 'save-key',
          provider: String(fd.get('ai-provider') || ''),
          apiKey: String(fd.get('apiKey') || '').trim(),
          baseUrl: String(fd.get('baseUrl') || '').trim(),
        };
        if (!payload.apiKey) { UI.toast('Paste your API key first.', { icon: 'warning' }); return; }
        var submitBtn = UI.$('button[type="submit"]', aiForm);
        if (submitBtn) { submitBtn.disabled = true; }
        CloudSync.aiInvoke(payload).then(function (res) {
          UI.$('[name="apiKey"]', aiForm).value = '';
          UI.toast('Key saved securely ····' + (res && res.hint ? res.hint : ''), { icon: 'shield' });
          refreshAiStatus(summary);
        }).catch(function (e) {
          UI.toast(e.message || 'Could not save the key.', { icon: 'warning', duration: 5000 });
        }).then(function () {
          if (submitBtn) { submitBtn.disabled = false; }
        });
      });
    }

    var importFile = UI.$('#acct-import-file', root);
    if (importFile) {
      importFile.addEventListener('change', function () {
        var selected = importFile.files && importFile.files[0];
        if (!selected) { return; }
        var reader = new FileReader();
        reader.onload = function () { chooseImportMode(String(reader.result)); };
        reader.onerror = function () { UI.toast('That file could not be read', { icon: 'warning' }); };
        reader.readAsText(selected);
        importFile.value = '';
      });
    }
  }

  /* ---- dialogs ------------------------------------------------------------------ */

  function notebookMigrationFailureMessage(error) {
    var progress = error && error.migrationProgress;
    var prefix = progress && progress.imported
      ? 'Copied ' + progress.imported + ' of ' + progress.total + ' notes. ' : '';
    if (error && error.code === 'NB_AUTH_UNAVAILABLE') {
      return prefix + 'Your account session is still starting. Wait a moment, then try again.';
    }
    return prefix + 'The remaining notes could not be copied. Check your connection and try again.';
  }

  async function offerNotebookMigration() {
    try {
      await NBStorage.init();
      var count = await NBStorage.unmergedLocalCount();
      if (!count) {
        UI.toast('There are no device notes waiting to be copied.');
        return;
      }
      UI.modal({
        title: 'Copy device notes?',
        description: count + ' note' + (count === 1 ? '' : 's') +
          ' from this browser will be copied into your account. The originals stay on this device.',
        body: '<div class="modal__actions">' +
          '<button type="button" class="btn" data-act="cancel">Cancel</button>' +
          '<button type="button" class="btn btn--primary" data-act="copy-notes">' +
            Icon('upload') + 'Copy notes</button></div>',
        onMount: function (panel, close) {
          UI.$('[data-act="cancel"]', panel).addEventListener('click', close);
          UI.$('[data-act="copy-notes"]', panel).addEventListener('click', async function () {
            var button = this;
            button.disabled = true;
            button.textContent = 'Copying…';
            try {
              var imported = await NBStorage.migrateLocalToCloud();
              close();
              UI.toast('Copied ' + imported + ' note' +
                (imported === 1 ? '' : 's') + ' to your account');
            } catch (error) {
              console.warn('[Notebook] Manual migration failed.', error);
              UI.toast(notebookMigrationFailureMessage(error),
                { icon: 'warning', duration: 7000 });
              button.disabled = false;
              button.textContent = 'Try again';
            }
          });
        }
      });
    } catch (error) {
      console.warn('[Notebook] Could not inspect device notes.', error);
      UI.toast('Device notes could not be checked. Try again in a moment.',
        { icon: 'warning', duration: 6000 });
    }
  }

  function openProfileEditor(summary) {
    UI.modal({
      title: 'Edit profile',
      description: summary.authenticated
        ? 'Saved privately to your account.'
        : 'Saved on this device while you browse as a guest.',
      body: '<form id="profile-form" class="stack" autocomplete="off">' +
        '<label class="field"><span class="field__label">Display name</span>' +
          '<input class="field__input" name="displayName" dir="auto" maxlength="60" required ' +
          'value="' + esc(summary.displayName || '') + '" data-autofocus></label>' +
        '<div class="modal__actions"><button type="button" class="btn" data-act="cancel">Cancel</button>' +
          '<button type="submit" class="btn btn--primary">Save profile</button></div></form>',
      onMount: function (panel, close) {
        UI.$('[data-act="cancel"]', panel).addEventListener('click', close);
        UI.$('#profile-form', panel).addEventListener('submit', function (event) {
          event.preventDefault();
          var name = String(new FormData(event.target).get('displayName') || '').trim();
          if (!name) { return; }
          if (summary.authenticated) {
            CloudSync.updateDisplayName(name).then(function () {
              close(); UI.toast('Profile saved');
            }).catch(function (e) { UI.toast(e.message, { icon: 'warning' }); });
          } else {
            Store.setSetting('profile', { displayName: name });
            close(); UI.toast('Profile saved on this device');
          }
        });
      },
    });
  }

  function openChangePassword() {
    UI.modal({
      title: 'Change password',
      body: '<form id="pw-form" class="stack" autocomplete="off">' +
        '<label class="field"><span class="field__label">Current password</span>' +
          '<input class="field__input" type="password" name="current" required autocomplete="current-password"></label>' +
        '<label class="field"><span class="field__label">New password</span>' +
          '<input class="field__input" type="password" name="next" required minlength="8" autocomplete="new-password"></label>' +
        '<div class="modal__actions"><button type="button" class="btn" data-act="cancel">Cancel</button>' +
          '<button type="submit" class="btn btn--primary">Update password</button></div></form>',
      onMount: function (panel, close) {
        UI.$('[data-act="cancel"]', panel).addEventListener('click', close);
        UI.$('#pw-form', panel).addEventListener('submit', function (event) {
          event.preventDefault();
          var fd = new FormData(event.target);
          CloudSync.changePassword(String(fd.get('current')), String(fd.get('next')))
            .then(function () { close(); UI.toast('Password updated.'); })
            .catch(function (e) { UI.toast(e.message, { icon: 'warning' }); });
        });
      },
    });
  }

  function confirmDeleteAccount() {
    UI.modal({
      title: 'Delete account permanently?',
      description: 'Your vocabulary, progress, languages, and AI connection are erased. This cannot be undone.',
      body: '<form id="del-form" class="stack" autocomplete="off">' +
        '<p class="acct-note">' + Icon('warning') + 'Type <strong>DELETE</strong> to confirm.</p>' +
        '<input class="field__input" name="confirmWord" autocomplete="off" spellcheck="false">' +
        '<div class="modal__actions"><button type="button" class="btn" data-act="cancel">Keep my account</button>' +
          '<button type="submit" class="btn btn--danger">Delete forever</button></div></form>',
      onMount: function (panel, close) {
        UI.$('[data-act="cancel"]', panel).addEventListener('click', close);
        UI.$('#del-form', panel).addEventListener('submit', function (event) {
          event.preventDefault();
          var word = String(new FormData(event.target).get('confirmWord') || '').trim();
          if (word !== 'DELETE') { UI.toast('Type DELETE to confirm.', { icon: 'warning' }); return; }
          CloudSync.requestAccountDeletion().then(function () {
            close();
            UI.toast('Account deleted.', { icon: 'trash', duration: 5000 });
            Router.go('/home');
          }).catch(function (e) {
            UI.toast(e.message || 'Deletion failed — try again later.', { icon: 'warning', duration: 5000 });
          });
        });
      },
    });
  }

  function chooseImportMode(text) {
    UI.modal({
      title: 'Import backup',
      description: 'Choose whether to keep your current data or restore only what is in this file.',
      body: '<div class="option-list"><button type="button" class="option" data-mode="merge"><span class="grow">' +
        '<span class="option__title">Merge</span><br><span class="option__sub">Keep current data and add anything new</span></span></button>' +
        '<button type="button" class="option" data-mode="replace"><span class="grow">' +
        '<span class="option__title">Replace</span><br><span class="option__sub">Discard current data and restore this file</span></span></button></div>' +
        '<div class="modal__actions"><button type="button" class="btn" data-act="cancel">Cancel</button></div>',
      onMount: function (panel, close) {
        UI.$('[data-act="cancel"]', panel).addEventListener('click', close);
        UI.$$('[data-mode]', panel).forEach(function (button) {
          button.addEventListener('click', function () {
            try {
              var result = Store.importJSON(text, button.dataset.mode);
              close();
              UI.toast('Imported ' + result.words + ' ' + UI.plural(result.words, 'word'));
            } catch (err) {
              UI.toast('That file is not a valid Lexio backup', { icon: 'warning', duration: 4000 });
            }
          });
        });
      },
    });
  }

  global.Views = global.Views || {};
  global.Views.account = render;
})(window);
