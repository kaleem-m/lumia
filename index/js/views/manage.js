/* ==========================================================================
   Manage Words — the only editing surface in Lexio.
   Single-entry CRUD, bulk paste preview, language setup, and JSON portability.
   ========================================================================== */
(function (global) {
  'use strict';

  var esc = UI.esc;
  var viewState = { query: '', categoryId: '', bulkRows: [] };

  function cloudOn() { return CloudSync && CloudSync.isAuthenticated(); }
  function saveNote() {
    return cloudOn() ? 'Saved privately to your account' : 'Guest mode · saved only on this device';
  }

  function categoryOptions(selected, allLabel) {
    var first = allLabel
      ? '<option value="">' + esc(allLabel) + '</option>'
      : '<option value="" disabled' + (selected ? '' : ' selected') + '>Choose a category</option>';
    return first + Categories.all.map(function (cat) {
      return '<option value="' + cat.id + '"' + (cat.id === selected ? ' selected' : '') + '>' +
        esc(cat.name) + '</option>';
    }).join('');
  }

  function directionOptions(selected) {
    return [
      { value: 'auto', label: 'Auto-detect' },
      { value: 'ltr', label: 'Left to right' },
      { value: 'rtl', label: 'Right to left' }
    ].map(function (item) {
      return '<option value="' + item.value + '"' + (selected === item.value ? ' selected' : '') + '>' +
        item.label + '</option>';
    }).join('');
  }

  function languageRows(langs, activeId) {
    if (!langs.length) {
      return UI.emptyState({
        small: true,
        variant: 'edit',
        icon: 'globe',
        title: 'Set up a language first',
        body: 'A language gives your words a home and a default reading direction.',
        actions: '<button type="button" class="btn btn--edit" data-act="add-lang">' +
          Icon('plus') + 'Add a language</button>'
      });
    }

    return '<div class="card language-list">' + langs.map(function (lang) {
      var dirLabel = lang.dir === 'rtl' ? 'Right to left' : (lang.dir === 'auto' ? 'Auto-detect' : 'Left to right');
      return '<div class="data-row">' +
        '<span class="preview-card__icon" aria-hidden="true">' + Icon('globe') + '</span>' +
        '<span class="data-row__text"><strong dir="auto">' + esc(lang.name) + '</strong>' +
          '<span>' + esc(dirLabel) + (lang.code ? ' · ' + esc(lang.code) : '') + '</span></span>' +
        (lang.id === activeId
          ? '<span class="tag tag--edit">Active</span>'
          : '<button type="button" class="btn btn--sm" data-act="use-lang" data-id="' + esc(lang.id) + '">Use</button>') +
        '<button type="button" class="icon-btn icon-btn--plain" data-act="del-lang" data-id="' +
          esc(lang.id) + '" aria-label="Remove ' + esc(lang.name) + '">' + Icon('trash') + '</button>' +
      '</div>';
    }).join('') + '</div>';
  }

  function addWordPanel(active, scopedCategoryId) {
    if (!active) { return ''; }
    return '<section class="editor-card card" aria-labelledby="add-word-title">' +
      '<div class="editor-card__head"><span class="editor-card__icon">' + Icon('plus') + '</span><div>' +
        '<span class="eyebrow">One at a time</span><h2 id="add-word-title">Add a word</h2>' +
        '<p>Type it the way you say it. The native script is welcome but optional.</p></div></div>' +
      '<form id="word-form" class="word-form" autocomplete="off">' +
        '<label class="field"><span class="field__label">Word (transliterated)</span>' +
          '<input class="field__input word-input" name="term" dir="auto" maxlength="200" ' +
          'placeholder="e.g. marhaba" data-autofocus>' +
          '<span class="field__hint">However you spell it in English letters.</span></label>' +
        '<label class="field"><span class="field__label">Native script <span class="optional">Optional</span></span>' +
          '<input class="field__input word-input" name="nativeScript" dir="auto" maxlength="200" ' +
          'placeholder="e.g. مرحبا"></label>' +
        '<label class="field"><span class="field__label">Meaning</span>' +
          '<input class="field__input word-input" name="meaning" dir="auto" required maxlength="300" ' +
          'placeholder="e.g. hello"></label>' +
        '<label class="field"><span class="field__label">Category</span>' +
          '<select class="field__select" name="categoryId" required>' + categoryOptions(scopedCategoryId || '', '') + '</select></label>' +
        '<label class="field"><span class="field__label">Text direction</span>' +
          '<select class="field__select" name="dir">' + directionOptions(active.dir || 'auto') + '</select>' +
          '<span class="field__hint">Guides the native script and example. Auto handles mixed scripts.</span></label>' +
        '<label class="field word-form__wide"><span class="field__label">Example sentence <span class="optional">Optional</span></span>' +
          '<textarea class="field__textarea field__textarea--short word-input" name="example" dir="auto" maxlength="1000" ' +
          'placeholder="Use this word in a sentence…"></textarea></label>' +
        '<div class="word-form__wide form-submit"><span class="form-submit__note">' + saveNote() + '</span>' +
          '<button type="submit" class="btn btn--edit">' + Icon('plus') + 'Save word</button></div>' +
      '</form></section>';
  }

  function bulkPanel(active, scopedCategoryId) {
    if (!active) { return ''; }
    return '<section class="editor-card card" aria-labelledby="bulk-title">' +
      '<div class="editor-card__head"><span class="editor-card__icon">' + Icon('inbox') + '</span><div>' +
        '<span class="eyebrow">Many at once</span><h2 id="bulk-title">Bulk add</h2>' +
        '<p>One pair per line using <code>word - meaning</code> — transliterated spellings work great here.</p></div></div>' +
      '<div class="bulk-form">' +
        '<label class="field bulk-form__paste"><span class="field__label">Paste your list</span>' +
          '<textarea id="bulk-text" class="field__textarea word-input" dir="auto" ' +
          'placeholder="bonjour - hello\nmerci - thank you\nau revoir - goodbye"></textarea></label>' +
        '<label class="field"><span class="field__label">Category for this batch</span>' +
          '<select id="bulk-category" class="field__select">' + categoryOptions(scopedCategoryId || '', '') + '</select></label>' +
        '<label class="field"><span class="field__label">Text direction</span>' +
          '<select id="bulk-dir" class="field__select">' + directionOptions(active.dir || 'auto') + '</select></label>' +
        '<button type="button" class="btn bulk-form__preview" data-act="preview-bulk">Preview words</button>' +
      '</div><div id="bulk-preview" aria-live="polite"></div></section>';
  }

  function wordRow(word) {
    var cat = Categories.get(word.categoryId);
    var lang = Store.activeLanguage();
    var dir = WordDisplay.dirOf(word, lang);
    var name = entryName(word);
    var native = WordDisplay.secondary(word);
    return '<article class="word-row" data-word-id="' + esc(word.id) + '">' +
      '<div class="word-row__main"><strong class="word-row__term" dir="auto">' + esc(name) + '</strong>' +
        (native ? '<span class="word-row__native" dir="' + dir + '">' + esc(native) + '</span>' : '') +
        '<span class="word-row__meaning" dir="auto">' + esc(word.meaning) + '</span>' +
        (word.example ? '<span class="word-row__example" dir="' + dir + '">“' + esc(word.example) + '”</span>' : '') +
      '</div><div class="word-row__meta"><span class="tag">' + esc(cat ? cat.name : 'Unknown') + '</span>' +
        '<span class="direction-badge" title="Text direction">' + dir.toUpperCase() + '</span></div>' +
      '<div class="word-row__actions">' +
        '<button type="button" class="icon-btn icon-btn--plain" data-act="edit-word" data-id="' + esc(word.id) +
          '" aria-label="Edit ' + esc(name) + '">' + Icon('edit') + '</button>' +
        '<button type="button" class="icon-btn icon-btn--plain word-row__delete" data-act="delete-word" data-id="' + esc(word.id) +
          '" aria-label="Delete ' + esc(name) + '">' + Icon('trash') + '</button></div></article>';
  }

  function wordLibrary(active) {
    if (!active) { return ''; }
    var words = Store.words({ query: viewState.query, categoryId: viewState.categoryId });
    words.sort(function (a, b) { return String(b.dateAdded).localeCompare(String(a.dateAdded)); });
    var allCount = Store.words().length;
    var empty = allCount === 0;
    var content;
    if (empty) {
      content = UI.emptyState({
        small: true, variant: 'edit', icon: 'inbox', title: 'Your word list is empty',
        body: 'Use the form above to add your first word. It will appear here right away.'
      });
    } else if (!words.length) {
      content = '<div class="list-empty">' + Icon('search') + '<strong>No matching words</strong>' +
        '<p>Try another search or category.</p><button type="button" class="btn btn--sm" data-act="clear-filters">Clear filters</button></div>';
    } else {
      content = '<div class="word-list">' + words.map(wordRow).join('') + '</div>';
    }

    return '<section class="library" aria-labelledby="library-title"><div class="section-head library__head"><div>' +
      '<span class="eyebrow">Your collection</span><h2 id="library-title">' + allCount + ' ' + UI.plural(allCount, 'word') + '</h2>' +
      '<p>Search, filter, edit, or carefully remove entries.</p></div></div>' +
      '<div class="library-tools">' +
        '<label class="search-box"><span aria-hidden="true">' + Icon('search') + '</span>' +
          '<span class="sr-only">Search words</span><input id="word-search" type="search" value="' + esc(viewState.query) +
          '" placeholder="Search words or meanings…" autocomplete="off"></label>' +
        '<label class="filter-box"><span class="sr-only">Filter by category</span>' +
          '<select id="word-filter" class="field__select">' + categoryOptions(viewState.categoryId, 'All categories') + '</select></label>' +
      '</div><div id="word-results">' + content + '</div></section>';
  }

  function backupPanel(totals) {
    var backupCopy = cloudOn()
      ? 'Your private account is synced. You can also export a portable JSON copy.'
      : 'Guest data lives only in this browser. Export JSON regularly to keep a copy.';
    return '<section class="backup-section"><header class="page-head"><span class="eyebrow">Your data</span>' +
      '<h2>Backup &amp; portability</h2><p>' + backupCopy + '</p></header>' +
      '<div class="card"><div class="data-row"><span class="preview-card__icon">' + Icon('download') + '</span>' +
        '<span class="data-row__text"><strong>Export JSON</strong><span>' + totals.words + ' ' + UI.plural(totals.words, 'word') +
        ' · ' + UI.fmtBytes(Store.storageBytes()) + ' stored</span></span>' +
        '<button type="button" class="btn btn--sm" data-act="export">Export</button></div>' +
      '<div class="data-row"><span class="preview-card__icon">' + Icon('upload') + '</span>' +
        '<span class="data-row__text"><strong>Import a backup</strong><span>Merge or replace this browser’s data</span></span>' +
        '<button type="button" class="btn btn--sm" data-act="import">Import</button></div>' +
      '<div class="data-row data-row--danger"><span class="preview-card__icon">' + Icon('warning') + '</span>' +
        '<span class="data-row__text"><strong>Erase everything</strong><span>Deletes languages, words, and progress</span></span>' +
        '<button type="button" class="btn btn--sm btn--danger" data-act="reset">Erase</button></div></div></section>' +
      '<input type="file" id="import-file" accept="application/json,.json" class="sr-only">';
  }

  function render(root, params) {
    params = params || {};
    var scopedCategory = Categories.get(params.categoryId);
    if (params.categoryId && !scopedCategory) { Router.go('/manage', true); return; }
    if (scopedCategory) { viewState.categoryId = scopedCategory.id; }
    var langs = Store.languages();
    var active = Store.activeLanguage();
    var totals = Store.totals();
    var scopeNotice = scopedCategory
      ? '<div class="manage-scope"><a href="#/category/' + scopedCategory.id + '" class="btn btn--ghost btn--sm">' +
          '<span class="flip-rtl">' + Icon('back') + '</span>Back to ' + esc(scopedCategory.name) + '</a>' +
          '<span>Editing <strong>' + esc(scopedCategory.name) + '</strong></span></div>'
      : '';
    var accountNotice = cloudOn()
      ? '<div class="manage-banner">' + Icon('shield') + '<div><strong>Private cloud sync is on</strong><p>Only your signed-in account can access these words.</p></div></div>'
      : '<div class="guest-warning">' + Icon('warning') + '<p><strong>You are continuing as a guest.</strong><br>Your added words stay on this device and are not securely backed up. <button type="button" class="link-button" data-act="account">Sign in or create an account</button>.</p></div>';
    var html = accountNotice + scopeNotice +
      '<header class="manage-title"><span class="eyebrow">Manage Words</span><h1>Build your personal dictionary.</h1>' +
      '<p>Add only the words that matter to you, in any script and at your own pace.</p></header>' +
      '<section class="language-section"><div class="section-head"><div><h2>Language</h2>' +
        '<p>' + (active ? 'Adding words to ' + esc(active.name) + '.' : 'Choose where these words belong.') + '</p></div>' +
        (langs.length ? '<button type="button" class="btn btn--sm" data-act="add-lang">' + Icon('plus') + 'Add language</button>' : '') +
      '</div>' + languageRows(langs, active && active.id) + '</section>' +
      (active ? '<div class="editor-grid">' + addWordPanel(active, scopedCategory && scopedCategory.id) +
        bulkPanel(active, scopedCategory && scopedCategory.id) + '</div>' + wordLibrary(active) : '') +
      backupPanel(totals);
    root.innerHTML = html;
    bind(root);
  }

  function formData(form) {
    var fd = new FormData(form);
    return {
      languageId: Store.settings.activeLanguageId,
      term: String(fd.get('term') || '').trim(),
      nativeScript: String(fd.get('nativeScript') || '').trim(),
      meaning: String(fd.get('meaning') || '').trim(),
      categoryId: String(fd.get('categoryId') || ''),
      example: String(fd.get('example') || '').trim(),
      dir: String(fd.get('dir') || 'auto')
    };
  }

  function entryName(word) {
    return WordDisplay.primary(word);
  }

  function parseBulk(text) {
    return String(text || '').split(/\r?\n/).map(function (line, index) {
      var value = line.trim();
      if (!value) { return null; }
      var parts = value.split(/\s+(?:—|–|-)\s+|\t+/);
      if (parts.length < 2) { return { line: index + 1, raw: value, error: 'Add a separator between word and meaning.' }; }
      var term = parts.shift().trim();
      var meaning = parts.join(' - ').trim();
      if (!term || !meaning) { return { line: index + 1, raw: value, error: 'Both word and meaning are required.' }; }
      return { line: index + 1, term: term, meaning: meaning };
    }).filter(Boolean);
  }

  function showBulkPreview(root) {
    var text = UI.$('#bulk-text', root).value;
    var categoryId = UI.$('#bulk-category', root).value;
    var rows = parseBulk(text);
    var target = UI.$('#bulk-preview', root);
    if (!text.trim()) {
      target.innerHTML = '<p class="form-error">Paste at least one line to preview.</p>';
      return;
    }
    if (!categoryId) {
      target.innerHTML = '<p class="form-error">Choose a category for this batch.</p>';
      return;
    }
    viewState.bulkRows = rows;
    var valid = rows.filter(function (row) { return !row.error; });
    var invalid = rows.filter(function (row) { return row.error; });
    target.innerHTML = '<div class="bulk-preview"><div class="bulk-preview__head"><div><strong>' + valid.length + ' ready to add</strong>' +
      (invalid.length ? '<span> · ' + invalid.length + ' need attention</span>' : '<span> · Everything looks good</span>') + '</div>' +
      (valid.length ? '<button type="button" class="btn btn--edit btn--sm" data-act="confirm-bulk">' + Icon('check') +
        'Add ' + valid.length + ' ' + UI.plural(valid.length, 'word') + '</button>' : '') + '</div>' +
      '<div class="bulk-preview__cols" aria-hidden="true"><span>#</span><span>Word</span><span>Meaning</span></div>' +
      '<div class="bulk-preview__rows">' + rows.map(function (row) {
        return row.error
          ? '<div class="bulk-preview__row bulk-preview__row--error"><span>Line ' + row.line + '</span><strong dir="auto">' +
              esc(row.raw) + '</strong><small>' + esc(row.error) + '</small></div>'
          : '<div class="bulk-preview__row"><span>' + row.line + '</span><strong dir="auto">' + esc(row.term) +
              '</strong><span dir="auto">' + esc(row.meaning) + '</span></div>';
      }).join('') + '</div></div>';
  }

  function openEdit(word) {
    var active = Store.activeLanguage();
    UI.modal({
      title: 'Edit word',
      description: 'Update this entry. Learning history and date added will be kept.',
      body: '<form id="edit-word-form" class="stack" autocomplete="off">' +
        '<label class="field"><span class="field__label">Word (transliterated)</span><input class="field__input" name="term" dir="auto" ' +
          'maxlength="200" value="' + esc(word.term) + '" data-autofocus></label>' +
        '<label class="field"><span class="field__label">Native script <span class="optional">Optional</span></span>' +
          '<input class="field__input" name="nativeScript" dir="auto" maxlength="200" value="' + esc(word.nativeScript || '') + '"></label>' +
        '<label class="field"><span class="field__label">Meaning</span><input class="field__input" name="meaning" dir="auto" ' +
          'required maxlength="300" value="' + esc(word.meaning) + '"></label>' +
        '<label class="field"><span class="field__label">Category</span><select class="field__select" name="categoryId">' +
          categoryOptions(word.categoryId, '') + '</select></label>' +
        '<label class="field"><span class="field__label">Text direction</span><select class="field__select" name="dir">' +
          directionOptions(word.dir || (active && active.dir) || 'auto') + '</select></label>' +
        '<label class="field"><span class="field__label">Example sentence <span class="optional">Optional</span></span>' +
          '<textarea class="field__textarea field__textarea--short" name="example" dir="auto" maxlength="1000">' +
          esc(word.example || '') + '</textarea></label>' +
        '<div class="modal__actions"><button type="button" class="btn" data-act="cancel">Cancel</button>' +
          '<button type="submit" class="btn btn--edit">Save changes</button></div></form>',
      onMount: function (panel, close) {
        UI.$('[data-act="cancel"]', panel).addEventListener('click', close);
        UI.$('#edit-word-form', panel).addEventListener('submit', function (event) {
          event.preventDefault();
          try {
            Store.updateWord(word.id, formData(event.target));
            close();
            UI.toast('Word updated');
          } catch (err) { UI.toast(err.message, { icon: 'warning' }); }
        });
      }
    });
  }

  function bind(root) {
    var wordForm = UI.$('#word-form', root);
    if (wordForm) {
      wordForm.addEventListener('submit', function (event) {
        event.preventDefault();
        try {
          var word = Store.addWord(formData(wordForm));
          UI.toast(entryName(word) + ' added');
        } catch (err) { UI.toast(err.message, { icon: 'warning' }); }
      });
    }

    var search = UI.$('#word-search', root);
    if (search) {
      search.addEventListener('input', function () {
        viewState.query = search.value;
        updateResults(root);
      });
    }
    var filter = UI.$('#word-filter', root);
    if (filter) {
      filter.addEventListener('change', function () {
        viewState.categoryId = filter.value;
        updateResults(root);
      });
    }

    root.addEventListener('click', function (event) {
      var btn = event.target.closest('[data-act]');
      if (!btn) { return; }
      var act = btn.dataset.act;
      if (act === 'account') { CloudSync.openAccount(); }
      if (act === 'add-lang') { global.App.openLanguageSheet(); }
      if (act === 'use-lang') { Store.setActiveLanguage(btn.dataset.id); UI.toast('Active language switched'); }
      if (act === 'preview-bulk') { showBulkPreview(root); }
      if (act === 'confirm-bulk') {
        var categoryId = UI.$('#bulk-category', root).value;
        var dir = UI.$('#bulk-dir', root).value;
        var valid = viewState.bulkRows.filter(function (row) { return !row.error; });
        try {
          Store.addWords(valid.map(function (row) {
            return { languageId: Store.settings.activeLanguageId, categoryId: categoryId, term: row.term, meaning: row.meaning, dir: dir };
          }));
          viewState.bulkRows = [];
          UI.toast(valid.length + ' ' + UI.plural(valid.length, 'word') + ' added');
        } catch (err) { UI.toast(err.message, { icon: 'warning' }); }
      }
      if (act === 'edit-word') { var editWord = Store.getWord(btn.dataset.id); if (editWord) { openEdit(editWord); } }
      if (act === 'delete-word') {
        var word = Store.getWord(btn.dataset.id);
        if (!word) { return; }
        UI.confirm({
          title: 'Delete “' + entryName(word) + '”?',
          description: 'This removes the word and its future learning history. This cannot be undone.',
          confirmText: 'Delete word', danger: true
        }, function () { Store.deleteWord(word.id); UI.toast('Word deleted', { icon: 'trash' }); });
      }
      if (act === 'del-lang') { removeLanguage(btn.dataset.id); }
      if (act === 'clear-filters') {
        viewState.query = ''; viewState.categoryId = '';
        UI.$('#word-search', root).value = ''; UI.$('#word-filter', root).value = '';
        updateResults(root);
      }
      if (act === 'export') { exportBackup(); }
      if (act === 'import') { UI.$('#import-file', root).click(); }
      if (act === 'reset') { resetAll(); }
    });

    var file = UI.$('#import-file', root);
    file.addEventListener('change', function () {
      var selected = file.files && file.files[0];
      if (!selected) { return; }
      var reader = new FileReader();
      reader.onload = function () { chooseImportMode(String(reader.result)); };
      reader.onerror = function () { UI.toast('That file could not be read', { icon: 'warning' }); };
      reader.readAsText(selected);
      file.value = '';
    });
  }

  function updateResults(root) {
    var result = UI.$('#word-results', root);
    if (!result) { return; }
    var active = Store.activeLanguage();
    var shell = document.createElement('div');
    shell.innerHTML = wordLibrary(active);
    var fresh = UI.$('#word-results', shell);
    result.innerHTML = fresh ? fresh.innerHTML : '';
    var count = UI.$('#library-title', root);
    if (count) {
      var total = Store.words().length;
      count.textContent = total + ' ' + UI.plural(total, 'word');
    }
  }

  function removeLanguage(id) {
    var lang = Store.languages().filter(function (item) { return item.id === id; })[0];
    if (!lang) { return; }
    UI.confirm({
      title: 'Remove ' + lang.name + '?',
      description: 'Every word saved under this language is removed too. Export a backup first if you are unsure.',
      confirmText: 'Remove language', danger: true
    }, function () { Store.removeLanguage(lang.id); UI.toast('Language removed', { icon: 'trash' }); });
  }

  function resetAll() {
    UI.confirm({
      title: 'Erase all Lexio data?',
      description: cloudOn()
        ? 'Every language, word, and progress record in your account is permanently deleted.'
        : 'Every language, word, and progress record on this device is permanently deleted. There is no server copy.',
      confirmText: 'Erase everything', danger: true
    }, function () { Store.resetAll(); UI.toast('All data erased', { icon: 'trash' }); });
  }

  function exportBackup() {
    var blob = new Blob([Store.exportJSON()], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url; link.download = Store.exportFilename();
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    UI.toast('Backup downloaded', { icon: 'download' });
  }

  function chooseImportMode(text) {
    UI.modal({
      title: 'Import backup',
      description: 'Choose whether to keep your current data or restore only what is in this file.',
      body: '<div class="option-list"><button type="button" class="option" data-mode="merge"><span class="grow">' +
        '<span class="option__title">Merge</span><br><span class="option__sub">Keep current data and add anything new</span></span></button>' +
        '<button type="button" class="option" data-mode="replace"><span class="grow"><span class="option__title">Replace</span><br>' +
        '<span class="option__sub">Discard current data and restore this file</span></span></button></div>' +
        '<div class="modal__actions"><button type="button" class="btn" data-act="cancel">Cancel</button></div>',
      onMount: function (panel, close) {
        UI.$('[data-act="cancel"]', panel).addEventListener('click', close);
        UI.$$('[data-mode]', panel).forEach(function (button) {
          button.addEventListener('click', function () {
            try {
              var result = Store.importJSON(text, button.dataset.mode);
              close();
              UI.toast('Imported ' + result.words + ' ' + UI.plural(result.words, 'word'));
            } catch (err) { UI.toast('That file is not a valid Lexio backup', { icon: 'warning', duration: 4000 }); }
          });
        });
      }
    });
  }

  global.Views = global.Views || {};
  global.Views.manage = render;
})(window);
