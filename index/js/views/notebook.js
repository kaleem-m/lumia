/* ==========================================================================
   Notebook view — MS Word-style multilingual rich-text editor.

   Sections:
     0. helpers/state          4. documents sidebar
     1. shell rendering        5. autosave + status
     2. editor core            6. find bar
     3. toolbar commands       7. tables, migration, boot

   The editor uses the platform's contenteditable + execCommand engine —
   battle-tested Unicode/BiDi handling with zero dependencies. Every control
   below performs a real operation.
   ========================================================================== */
(function (global) {
  'use strict';

  /* =========================================================================
     0. Helpers & state
     ========================================================================= */
  var esc = UI.esc;
  var $ = UI.$;
  var $$ = UI.$$;

  var SIZE_LADDER = [12, 14, 16, 18, 21, 24, 28, 32, 36, 42, 48, 56, 64, 72];
  var TEXT_COLORS = ['#111111', '#4b5563', '#9ca3af', '#b91c1c', '#c2410c',
    '#a16207', '#15803d', '#0e7490', '#1d4ed8', '#7e22ce'];
  var HL_COLORS = ['#fff176', '#ffd54d', '#ffab91', '#f8bbd0', '#b39ddb',
    '#90caf9', '#80cbc4', '#a5d6a7', '#e6ee9c', '#ffcc80'];

  var els = {};              /* cached element refs */
  var docs = [];             /* loaded document list */
  var doc = null;            /* currently open document */
  var dirty = false;
  var saveTimer = null;
  var saveInFlight = Promise.resolve();
  var lastSavedSnapshot = null;
  var lastSavedHadRealContent = false;
  var savedRange = null;
  var findState = null;      /* { q, marks:[], idx } */
  var popClose = null;       /* active popover closer */
  var listState = { query: '', starredOnly: false, sort: 'updated' };
  var cleanupFns = [];
  var bootedOnce = false;

  function uid() { return NBStorage.uid ? NBStorage.uid('nb') : 'nb_' + Date.now().toString(36); }

  function relTime(iso) {
    var diff = Date.now() - new Date(iso).getTime();
    var m = Math.round(diff / 60000);
    if (m < 1) { return 'just now'; }
    if (m < 60) { return m + 'm ago'; }
    var h = Math.round(m / 60);
    if (h < 24) { return h + 'h ago'; }
    var d = Math.round(h / 24);
    if (d < 7) { return d + 'd ago'; }
    return new Date(iso).toLocaleDateString(undefined,
      { month: 'short', day: 'numeric' });
  }

  /** Block-level elements the caret/selection touches. */
  function allBlocks() {
    return $$('.nb-editor p, .nb-editor h1, .nb-editor h2, .nb-editor h3, ' +
      '.nb-editor h4, .nb-editor h5, .nb-editor h6, .nb-editor li, ' +
      '.nb-editor blockquote, .nb-editor pre, .nb-editor td, .nb-editor th', els.editor);
  }

  function currentBlocks() {
    var sel = global.getSelection();
    if (!sel.rangeCount) { return []; }
    var range = sel.getRangeAt(0);
    var hit = allBlocks().filter(function (b) {
      try { return range.intersectsNode(b); } catch (e) { return false; }
    });
    if (!hit.length) {
      var n = sel.anchorNode;
      while (n && n !== els.editor) {
        if (n.nodeType === 1 &&
            /^(P|H1|H2|H3|H4|H5|H6|LI|BLOCKQUOTE|PRE|TD|TH)$/.test(n.tagName)) {
          hit = [n];
          break;
        }
        n = n.parentNode;
      }
    }
    return hit;
  }

  function currentBlock() {
    var hit = currentBlocks();
    return hit.length ? hit[0] : null;
  }

  function saveSel() {
    var sel = global.getSelection();
    if (sel.rangeCount) {
      var r = sel.getRangeAt(0);
      if (els.editor.contains(r.commonAncestorContainer)) { savedRange = r.cloneRange(); }
    }
  }

  function restoreSel() {
    if (!savedRange) { els.editor.focus(); return; }
    var sel = global.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    els.editor.focus();
  }

  /* =========================================================================
     1. Shell rendering
     ========================================================================= */

  function toolButton(cmd, iconName, label, extraAttrs) {
    return '<button type="button" class="nb-tool" data-cmd="' + cmd + '" ' +
      'title="' + esc(label) + '" aria-label="' + esc(label) + '"' +
      (extraAttrs || '') + '>' + Icon(iconName) + '</button>';
  }

  function toolbarHtml() {
    /* Rendered before a document is open; openDocById() rebuilds the font
       list for the note's own script. */
    var scriptId = (doc && doc.script) || 'latin';
    var fontOpts = NBScripts.fontsOf(scriptId).map(function (fnt, i) {
      return '<option value="' + i + '">' + esc(fnt.name) + '</option>';
    }).join('');

    var sizeOpts = SIZE_LADDER.map(function (px) {
      return '<option value="' + px + '"' + (px === 17 ? '' : '') + '>' + px + '</option>';
    }).join('');

    var lhOpts = [['', 'Spacing'], ['1', 'Single'], ['1.15', '1.15'], ['1.5', '1.5'],
      ['1.75', '1.75'], ['2', 'Double'], ['2.5', 'Loose']]
      .map(function (o) {
        return '<option value="' + o[0] + '">' + o[1] + '</option>';
      }).join('');

    return '' +
      '<div class="nb-toolbar__row nb-toolbar__row--primary">' +
        '<div class="nb-tgroup" role="group" aria-label="History and clipboard">' +
          toolButton('undo', 'undo', 'Undo (Ctrl+Z)') +
          toolButton('redo', 'redo', 'Redo (Ctrl+Y)') +
          '<span class="nb-tsep"></span>' +
          toolButton('cut', 'cut', 'Cut (Ctrl+X)') +
          toolButton('copy', 'copy', 'Copy (Ctrl+C)') +
          toolButton('selectall', 'select_all', 'Select all (Ctrl+A)') +
        '</div>' +

        '<div class="nb-tgroup nb-tgroup--grow" role="group" aria-label="Script, font and size">' +
          '<select class="nb-select nb-select--script" id="nb-script-sel" aria-label="Writing script"></select>' +
          '<select class="nb-select nb-select--font" id="nb-font-sel" aria-label="Font family">' + fontOpts + '</select>' +
          '<select class="nb-select nb-select--size" id="nb-size-sel" aria-label="Font size">' + sizeOpts + '</select>' +
          toolButton('sizedown', 'size_down', 'Decrease font size') +
          toolButton('sizeup', 'size_up', 'Increase font size') +
        '</div>' +

        '<div class="nb-tgroup" role="group" aria-label="Character formatting">' +
          toolButton('bold', 'bold', 'Bold (Ctrl+B)') +
          toolButton('italic', 'italic', 'Italic (Ctrl+I)') +
          toolButton('underline', 'underline', 'Underline (Ctrl+U)') +
          toolButton('strikeThrough', 'strike', 'Strikethrough') +
          toolButton('superscript', 'sup', 'Superscript') +
          toolButton('subscript', 'sub', 'Subscript') +
        '</div>' +

      '</div>' +

      '<div class="nb-toolbar__row nb-toolbar__row--secondary">' +
        '<div class="nb-tgroup" role="group" aria-label="Colour and formatting cleanup">' +
          '<button type="button" class="nb-tool nb-colorbtn" data-pop="forecolor" ' +
            'title="Text colour" aria-label="Text colour" style="--swatch:#b91c1c">' +
            Icon('textcolor') + '<span class="swatch" aria-hidden="true"></span></button>' +
          '<button type="button" class="nb-tool nb-colorbtn" data-pop="hilitecolor" ' +
            'title="Highlight" aria-label="Highlight" style="--swatch:#ffd54d">' +
            Icon('highlight') + '<span class="swatch" aria-hidden="true"></span></button>' +
          toolButton('removeFormat', 'clearfmt', 'Clear formatting') +
        '</div>' +

        '<div class="nb-tgroup nb-tgroup--grow" role="group" aria-label="Paragraph and line spacing">' +
          '<select class="nb-select nb-select--block" id="nb-block-sel" aria-label="Paragraph style">' +
            '<option value="p">Normal</option><option value="h1">Heading 1</option>' +
            '<option value="h2">Heading 2</option><option value="h3">Heading 3</option>' +
            '<option value="blockquote">Quote</option>' +
          '</select>' +
          '<select class="nb-select nb-select--spacing" id="nb-lh-sel" aria-label="Line spacing">' + lhOpts + '</select>' +
        '</div>' +

        '<div class="nb-tgroup" role="group" aria-label="Lists and indentation">' +
          toolButton('insertUnorderedList', 'listul', 'Bulleted list') +
          toolButton('insertOrderedList', 'listol', 'Numbered list') +
          toolButton('outdent', 'outdent', 'Outdent') +
          toolButton('indent', 'indent', 'Indent') +
        '</div>' +

        '<div class="nb-tgroup" role="group" aria-label="Alignment">' +
          toolButton('justifyLeft', 'alignleft', 'Align left') +
          toolButton('justifyCenter', 'aligncenter', 'Align centre') +
          toolButton('justifyRight', 'alignright', 'Align right') +
          toolButton('justifyFull', 'justify', 'Justify') +
        '</div>' +

        '<div class="nb-tgroup" role="group" aria-label="Text direction">' +
          '<span class="nb-dirseg" role="group" aria-label="Text direction">' +
            '<button type="button" class="nb-tool" data-dir="ltr" title="Left-to-right" aria-label="Left-to-right">' + Icon('dir_ltr') + '</button>' +
            '<button type="button" class="nb-tool" data-dir="rtl" title="Right-to-left" aria-label="Right-to-left">' + Icon('dir_rtl') + '</button>' +
            '<button type="button" class="nb-tool" data-dir="auto" title="Automatic direction" aria-label="Automatic direction">' + Icon('dir_auto') + '</button>' +
          '</span>' +
        '</div>' +

        '<div class="nb-tgroup" role="group" aria-label="Insert">' +
          toolButton('inserttable', 'table', 'Insert table') +
          toolButton('inserthorizontalrule', 'minus', 'Divider line') +
        '</div>' +
      '</div>';
  }

  function shellHtml() {
    return '' +
      '<div class="nb-app" id="nb-app" data-drawer="closed">' +
        '<aside class="nb-side" id="nb-side" aria-label="Notes">' +
          '<div class="nb-side__head">' +
            '<div class="nb-side__title-row">' +
              '<h2 class="nb-side__title">My notes</h2>' +
              '<button type="button" class="btn btn--sm btn--primary" data-act="new-doc">' +
                Icon('plus') + 'New</button>' +
            '</div>' +
            '<div class="nb-search">' + Icon('search') +
              '<input type="search" id="nb-search" placeholder="Search notes…" ' +
                'aria-label="Search notes">' +
            '</div>' +
            '<div class="nb-filters">' +
              '<button type="button" class="nb-filter-chip" id="nb-starred-filter" ' +
                'aria-pressed="false">' + Icon('star') + 'Starred</button>' +
              '<select class="nb-sort" id="nb-sort" aria-label="Sort notes">' +
                '<option value="updated">Recent</option>' +
                '<option value="created">Created</option>' +
                '<option value="title">A–Z</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="nb-list" id="nb-list" role="listbox" aria-label="Documents"></div>' +
          '<div class="nb-side__foot"><span class="nb-cloudnote" id="nb-cloud-note"></span></div>' +
        '</aside>' +
        '<div class="nb-scrim" id="nb-scrim" aria-hidden="true"></div>' +
        '<section class="nb-main" id="nb-main">' +
          '<header class="nb-docbar">' +
            '<button type="button" class="icon-btn nb-drawer-btn" data-act="drawer" ' +
              'aria-label="Show notes list" aria-expanded="false">' + Icon('manage') + '</button>' +
            '<input class="nb-title-input" id="nb-title" maxlength="200" ' +
              'placeholder="Untitled Note" aria-label="Note title">' +
            '<span class="nb-status" id="nb-status" data-state="saved" role="status">' +
              '<span class="nb-status__dot" aria-hidden="true"></span>' +
              '<span class="nb-status__text" id="nb-status-text">Saved</span>' +
            '</span>' +
            '<button type="button" class="icon-btn" data-act="star" aria-label="Star this note" ' +
              'aria-pressed="false" id="nb-star-btn">' + Icon('star') + '</button>' +
            '<button type="button" class="icon-btn" data-act="export" aria-haspopup="menu" ' +
              'aria-label="Export" title="Export">' + Icon('download') + '</button>' +
            '<button type="button" class="icon-btn nb-desktop-only" data-act="duplicate" ' +
              'aria-label="Duplicate note" title="Duplicate">' + Icon('copy') + '</button>' +
            '<button type="button" class="icon-btn nb-desktop-only" data-act="delete" ' +
              'aria-label="Delete note" title="Delete">' + Icon('trash') + '</button>' +
            '<button type="button" class="icon-btn nb-mobile-only" data-act="more" aria-haspopup="menu" ' +
              'aria-label="More actions" title="More">' + Icon('more') + '</button>' +
          '</header>' +
          '<div class="nb-toolbarwrap"><div class="nb-toolbar" id="nb-toolbar" role="toolbar" ' +
            'aria-label="Formatting">' + toolbarHtml() + '</div></div>' +
          '<div class="nb-find" id="nb-find" hidden>' +
            Icon('search') +
            '<input type="text" id="nb-find-input" placeholder="Find in note…" ' +
              'aria-label="Find in note">' +
            '<span class="nb-find__count" id="nb-find-count" aria-live="polite"></span>' +
            '<button type="button" class="icon-btn" data-act="find-prev" aria-label="Previous match">' +
              '<span class="flip-rtl">' + Icon('chevron') + '</span></button>' +
            '<button type="button" class="icon-btn" data-act="find-next" aria-label="Next match">' +
              Icon('find_next') + '</button>' +
            '<button type="button" class="icon-btn" data-act="find-close" aria-label="Close search">' +
              Icon('close') + '</button>' +
          '</div>' +
          '<div class="nb-canvas" id="nb-canvas">' +
            '<article class="nb-paper">' +
              '<div class="nb-editor" id="nb-editor" contenteditable="true" ' +
                'role="textbox" aria-multiline="true" aria-label="Note content" ' +
                'spellcheck="false" translate="no"></div>' +
            '</article>' +
          '</div>' +
          '<footer class="nb-statusbar">' +
            '<span class="nb-counts">' +
              '<span id="nb-c-words">0 words</span>' +
              '<span id="nb-c-chars">0 characters</span>' +
              '<span id="nb-c-paras">0 paragraphs</span>' +
            '</span>' +
            '<button type="button" class="nb-script-chip" id="nb-script-chip" ' +
              'aria-haspopup="menu" aria-label="Change writing script"></button>' +
          '</footer>' +
        '</section>' +
      '</div>';

    /* NOTE: 'minus' icon falls back gracefully if absent. */
  }

  /* =========================================================================
     2. Editor core
     ========================================================================= */

  function exec(command, value) {
    restoreSel();
    try { document.execCommand(command, false, value || null); } catch (e) {
      console.warn('[Notebook] command failed:', command, e);
    }
    onEdit();
  }

  /** Replace browser "xxx-large"/<font size=7> output with a real px size. */
  function normalizeSizeSpans(px) {
    var spans = $$('#nb-editor span', els.editor);
    spans.forEach(function (span) {
      var style = span.getAttribute('style') || '';
      if (/font-size\s*:\s*(-webkit-xxx-large|xxx-large)/i.test(style)) {
        span.setAttribute('style',
          style.replace(/font-size\s*:\s*[^;]+/i, 'font-size:' + px + 'px'));
      }
    });
    $$('#nb-editor font[size="7"]', els.editor).forEach(function (fontEl) {
      var span = document.createElement('span');
      span.setAttribute('style', 'font-size:' + px + 'px;');
      while (fontEl.firstChild) { span.appendChild(fontEl.firstChild); }
      fontEl.parentNode.replaceChild(span, fontEl);
    });
  }

  function applyFontSize(px) {
    restoreSel();
    document.execCommand('fontSize', false, '7');
    normalizeSizeSpans(px);
    onEdit();
  }

  function nearestSize(px, up) {
    var i = 0;
    while (i < SIZE_LADDER.length && SIZE_LADDER[i] < px) { i++; }
    if (up) { return SIZE_LADDER[Math.min(SIZE_LADDER.length - 1, i)]; }
    return SIZE_LADDER[Math.max(0, i - 2)];
  }

  function currentPx() {
    var sel = global.getSelection();
    var node = sel.anchorNode;
    if (!node) { return parseFloat(getComputedStyle(els.editor).fontSize) || 17; }
    if (node.nodeType === 3) { node = node.parentNode; }
    return parseFloat(getComputedStyle(node).fontSize) || 17;
  }

  function applyBlockStyle(prop, value) {
    var blocks = currentBlocks();
    if (!blocks.length) { blocks = [currentBlock() || els.editor]; }
    blocks.forEach(function (b) {
      if (value) { b.style.setProperty(prop, value); }
      else { b.style.removeProperty(prop); }
    });
    onEdit();
  }

  function applyBlockDir(dir) {
    var blocks = currentBlocks();
    if (!blocks.length) { blocks = [currentBlock() || els.editor]; }
    blocks.forEach(function (b) { b.setAttribute('dir', dir); });
    els.editor.setAttribute('dir', dir);
    doc.dir = dir;
    onEdit();
    syncToolbarState();
  }

  function insertTable(rows, cols) {
    rows = Math.min(Math.max(1, rows | 0), 12);
    cols = Math.min(Math.max(1, cols | 0), 8);
    var cell = '<td dir="' + doc.dir + '"><br></td>';
    var row = '<tr>' + new Array(cols + 1).join(cell) + '</tr>';
    var html = '<table><tbody>' + new Array(rows + 1).join(row) + '</tbody></table><p><br></p>';
    restoreSel();
    document.execCommand('insertHTML', false, html);
    var firstCell = $('td, th', els.editor);
    if (firstCell) {
      var r = document.createRange();
      r.selectNodeContents(firstCell);
      r.collapse(true);
      var sel = global.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      savedRange = r;
    }
    onEdit();
  }

  function onEdit() {
    if (!doc) { return; }
    updateCounts();
    updateEmptyFlag();
    scheduleSave(captureDocumentState());
  }

  function updateCounts() {
    var plain = NBSanitize.toText(els.editor.innerHTML);
    var words = plain.match(/[\p{L}\p{N}]+/gu);
    var chars = Array.from(plain.replace(/\s/g, '')).length;
    var paras = $$('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre', els.editor)
      .filter(function (el) {
        return (el.textContent || '').trim().length > 0 ||
               el.tagName.indexOf('H') === 0;
      }).length;
    if (!paras && words && words.length) { paras = 1; }
    $('#nb-c-words', els.main).textContent = (words ? words.length : 0) + ' words';
    $('#nb-c-chars', els.main).textContent =
      chars + (chars === 1 ? ' character' : ' characters');
    $('#nb-c-paras', els.main).textContent =
      paras + (paras === 1 ? ' paragraph' : ' paragraphs');
    doc.wordCount = words ? words.length : 0;
    doc.charCount = chars;
    doc._paraCount = paras;
  }

  function updateEmptyFlag() {
    var empty = !els.editor.textContent.trim() &&
      !$('img, table, hr', els.editor);
    els.editor.setAttribute('data-empty', empty ? 'true' : 'false');
  }

  /* =========================================================================
     3. Toolbar behaviour
     ========================================================================= */

  var CMD_MAP = {
    undo: 'undo', redo: 'redo', cut: 'cut', copy: 'copy',
    selectall: 'selectAll', bold: 'bold', italic: 'italic', underline: 'underline',
    strikeThrough: 'strikeThrough', superscript: 'superscript', subscript: 'subscript',
    removeFormat: 'removeFormat',
    insertUnorderedList: 'insertUnorderedList', insertOrderedList: 'insertOrderedList',
    indent: 'indent', outdent: 'outdent',
    justifyLeft: 'justifyLeft', justifyCenter: 'justifyCenter',
    justifyRight: 'justifyRight', justifyFull: 'justifyFull'
  };

  function onToolbarClick(e) {
    var btn = e.target.closest('button, select');
    if (!btn) { return; }

    if (btn.dataset.pop === 'forecolor' || btn.dataset.pop === 'hilitecolor') {
      openColorPop(btn, btn.dataset.pop);
      return;
    }
    if (btn.dataset.dir) { applyBlockDir(btn.dataset.dir); return; }
    if (btn.id === 'nb-script-sel' || btn.tagName === 'SELECT') { return; }

    var cmd = btn.dataset.cmd;
    if (!cmd) { return; }
    e.preventDefault();

    switch (cmd) {
      case 'sizeup': applyFontSize(nearestSize(currentPx(), true)); return;
      case 'sizedown': applyFontSize(Math.max(10, nearestSize(currentPx(), false))); return;
      case 'inserttable': openTablePop(btn); return;
      case 'undo':
      case 'redo':
        restoreSel();
        document.execCommand(CMD_MAP[cmd]);
        onEdit(); syncToolbarState();
        return;
      default:
        exec(CMD_MAP[cmd] || cmd);
        syncToolbarState();
    }
  }

  function setPressed(sel, active) {
    $$(sel, els.main).forEach(function (el) {
      el.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  /** Reflect caret formatting onto toolbar controls (rAF-throttled). */
  function syncToolbarState() {
    if (!doc || !els.editor) { return; }
    var q = function (c) {
      try { return document.queryCommandState(c); } catch (e) { return false; }
    };
    $('[data-cmd="bold"]', els.toolbar).setAttribute('aria-pressed', q('bold'));
    $('[data-cmd="italic"]', els.toolbar).setAttribute('aria-pressed', q('italic'));
    $('[data-cmd="underline"]', els.toolbar).setAttribute('aria-pressed', q('underline'));
    $('[data-cmd="strikeThrough"]', els.toolbar).setAttribute('aria-pressed', q('strikeThrough'));
    $('[data-cmd="insertUnorderedList"]', els.toolbar)
      .setAttribute('aria-pressed', q('insertUnorderedList'));
    $('[data-cmd="insertOrderedList"]', els.toolbar)
      .setAttribute('aria-pressed', q('insertOrderedList'));

    var block = currentBlock();
    var tag = block ? block.tagName.toLowerCase() : 'p';
    if (tag === 'div') { tag = 'p'; }
    $('#nb-block-sel', els.main).value = /^(h1|h2|h3|blockquote)$/.test(tag) ? tag : 'p';

    var align = block ? getComputedStyle(block).textAlign : 'start';
    setPressed('[data-cmd="justifyLeft"]', align === 'left' || align === 'start');
    setPressed('[data-cmd="justifyCenter"]', align === 'center');
    setPressed('[data-cmd="justifyRight"]', align === 'right' || align === 'end');
    setPressed('[data-cmd="justifyFull"]', align === 'justify');

    var dirEl = block || els.editor;
    var dir = dirEl.getAttribute('dir') ||
      (dirEl.closest && dirEl.closest('[dir]') && dirEl.closest('[dir]').getAttribute('dir')) ||
      els.editor.getAttribute('dir') || 'ltr';
    if (dir !== 'rtl' && dir !== 'auto') { dir = 'ltr'; }
    $$('[data-dir]', els.main).forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.dir === dir ? 'true' : 'false');
    });

    var sel = global.getSelection();
    var node = sel.anchorNode;
    if (node) {
      if (node.nodeType === 3) { node = node.parentNode; }
      var px = Math.round(parseFloat(getComputedStyle(node).fontSize));
      var sizeSel = $('#nb-size-sel', els.main);
      sizeSel.value = String(px);
      var lh = parseFloat(getComputedStyle(node).lineHeight) /
               parseFloat(getComputedStyle(node).fontSize);
      var lhSel = $('#nb-lh-sel', els.main);
      lhSel.value = '';
      [1, 1.15, 1.5, 1.75, 2, 2.5].some(function (v) {
        if (Math.abs(lh - v) < 0.06) { lhSel.value = String(v); return true; }
        return false;
      });
    }
  }

  /* ---- Popovers ------------------------------------------------------------ */

  function closePop() {
    if (popClose) { popClose(); }
  }

  function openPop(anchor, html, onMount) {
    closePop();
    var pop = document.createElement('div');
    pop.className = 'nb-pop';
    pop.innerHTML = html;
    els.main.appendChild(pop);

    pop.style.visibility = 'hidden';
    requestAnimationFrame(function () {
      // Recalculate anchor position in case layout shifted
      var rect = anchor.getBoundingClientRect();
      var mainRect = els.main.getBoundingClientRect();
      var pw = pop.offsetWidth, ph = pop.offsetHeight;
      var left = rect.left - mainRect.left + mainRect.scrollLeft;
      left = Math.min(Math.max(8, left), Math.max(8, mainRect.width - pw - 8));
      var top = rect.bottom - mainRect.top + 6;
      if (top + ph > mainRect.height - 8 &&
          rect.top - mainRect.top - ph > 8) {
        top = rect.top - mainRect.top - ph - 6;
      }
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
      pop.style.visibility = '';
    });

    function closer() {
      pop.remove();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', onKey, true);
      popClose = null;
    }
    function outside(e) {
      if (!pop.contains(e.target) && e.target !== anchor &&
          !anchor.contains(e.target)) { closer(); }
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); closer(); } }

    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onKey, true);
    popClose = closer;

    if (onMount) { onMount(pop, closer); }
    return pop;
  }

  function colorPopHtml(kind) {
    var colors = kind === 'forecolor' ? TEXT_COLORS : HL_COLORS;
    var swatches = colors.map(function (c) {
      return '<button type="button" class="nb-sw" data-color="' + c + '" ' +
        'style="background:' + c + '" aria-label="' +
        esc(kind === 'forecolor' ? 'Text colour ' : 'Highlight ') + c + '"></button>';
    }).join('');
    var noneBtn = kind === 'hilitecolor'
      ? '<button type="button" class="nb-sw" data-color="transparent" data-none="true" aria-label="Remove highlight"></button>'
      : '<button type="button" class="nb-sw" data-removecolor="true" aria-label="Clear text colour"></button>';
    return '<div class="nb-pop__label">' +
        (kind === 'forecolor' ? 'Text colour' : 'Highlight') +
      '</div>' +
      '<div class="nb-palette">' + noneBtn + swatches + '</div>' +
      '<label class="stack" style="padding:0 var(--s-3) var(--s-2);gap:6px">' +
        '<span style="font-size:var(--t-xs);color:var(--ink-3)">Custom colour</span>' +
        '<input type="color" id="nb-custom-' + kind + '" value="#b91c1c">' +
      '</label>';
  }

  function openColorPop(anchor, kind) {
    openPop(anchor, colorPopHtml(kind), function (pop, closer) {
      $$('.nb-sw[data-color]', pop).forEach(function (sw) {
        sw.addEventListener('click', function () {
          applyColor(sw.dataset.color);
          closer();
        });
      });
      var remove = $('.nb-sw[data-removecolor]', pop);
      if (remove) {
        remove.addEventListener('click', function () {
          restoreSel();
          document.execCommand('removeFormat');
          onEdit();
          closer();
        });
      }
      var custom = $('#nb-custom-' + kind, pop);
      custom.addEventListener('input', function () {
        anchor.style.setProperty('--swatch', custom.value);
      });
      custom.addEventListener('change', function () {
        applyColor(custom.value);
        closer();
      });
    });

    function applyColor(value) {
      restoreSel();
      document.execCommand(kind === 'forecolor' ? 'foreColor' : 'hiliteColor',
        false, value);
      onEdit();
    }
  }

  /* ---- Script picker -------------------------------------------------------- */

  function scriptPopHtml() {
    return NBScripts.groups().map(function (group) {
      return '<div class="nb-scp-group nb-pop__label">' + esc(group.label) + '</div>' +
        '<div class="nb-scp-grid">' +
        group.scripts.map(function (id) {
          var s = NBScripts.get(id);
          if (!s) { return ''; }
          return '<button type="button" class="nb-scp" data-script="' + id + '"' +
            (id === doc.script ? ' data-active="true"' : '') +
            ' title="' + esc(s.name) + '">' +
            '<span class="nb-scp__sample">' + esc(s.native) + '</span>' +
            '<span class="nb-scp__name">' + esc(s.name) + '</span></button>';
        }).join('') + '</div>';
    }).join('');
  }

  function openScriptPop(anchor) {
    openPop(anchor, scriptPopHtml(), function (pop, closer) {
      $$('.nb-scp', pop).forEach(function (btn) {
        btn.addEventListener('click', function () {
          chooseScript(btn.dataset.script);
          closer();
        });
      });
    });
  }

  function fontIndexFor(cssStack) {
    var fonts = NBScripts.fontsOf(doc.script);
    for (var i = 0; i < fonts.length; i++) {
      if (fonts[i].css === cssStack) { return i; }
    }
    return -1;
  }

  function chooseScript(id) {
    if (!NBScripts.exists(id)) { return; }
    doc.script = id;
    NBScripts.loadFonts(id);
    var dflt = NBScripts.defaultFont(id);

    var lineHeight = NBScripts.lineHeight(id);
    doc.lineHeight = lineHeight;
    applyEditorVars();

    /* Rebuild the font list for the new script, falling back to its default
       family when the current one doesn't belong to it. */
    if (fontIndexFor(doc.fontFamily) < 0) {
      doc.fontFamily = dflt.css;
    }
    var fi = fontIndexFor(doc.fontFamily);
    $('#nb-font-sel', els.main).innerHTML =
      NBScripts.fontsOf(id).map(function (fnt, i) {
        return '<option value="' + i + '"' + (i === fi ? ' selected' : '') + '>' +
          esc(fnt.name) + '</option>';
      }).join('');

    /* Format the paragraph under the caret so typing continues in-script. */
    var blocks = currentBlocks();
    if (!blocks.length) { blocks = [currentBlock()]; }
    blocks.forEach(function (b) {
      if (!b) { return; }
      b.style.fontFamily = doc.fontFamily;
      if (!b.style.lineHeight) { b.style.lineHeight = String(lineHeight); }
    });

    /* Follow the script's natural direction; the direction buttons in the
       toolbar override it per paragraph afterwards. */
    applyBlockDir(NBScripts.dirOf(id));

    updateScriptChip();
    rebuildScriptSelect();
    onEdit();
  }

  function rebuildScriptSelect() {
    var sel = $('#nb-script-sel', els.main);
    sel.innerHTML = NBScripts.groups().map(function (g) {
      return '<optgroup label="' + esc(g.label) + '">' +
        g.scripts.filter(function (id) { return NBScripts.exists(id); })
          .map(function (id) {
            var s = NBScripts.get(id);
            return '<option value="' + id + '"' + (id === doc.script ? ' selected' : '') + '>' +
              esc(s.name) + '</option>';
          }).join('') + '</optgroup>';
    }).join('');
  }

  function updateScriptChip() {
    var s = NBScripts.get(doc.script) || NBScripts.get('latin');
    $('#nb-script-chip', els.main).innerHTML =
      Icon('globe') + '<span>' + esc(s.name) + '</span>' +
      '<span class="native">' + esc(s.native) + '</span>';
  }

  /* ---- Table popover & operations ------------------------------------------- */

  function openTablePop(anchor) {
    var rows = [], cols = [];
    for (var i = 1; i <= 8; i++) { rows.push(i); if (i <= 6) { cols.push(i); } }
    openPop(anchor,
      '<div class="nb-pop__label">Insert table</div>' +
      '<div class="stack" style="flex-direction:row;display:flex;gap:8px;padding:4px var(--s-3) var(--s-2)">' +
        '<label style="display:grid;gap:2px;font-size:var(--t-xs);color:var(--ink-3)">Rows' +
          '<select class="field__select" id="nb-trows" style="min-block-size:34px;width:70px">' +
            rows.map(function (n) { return '<option>' + n + '</option>'; }).join('') +
          '</select></label>' +
        '<label style="display:grid;gap:2px;font-size:var(--t-xs);color:var(--ink-3)">Columns' +
          '<select class="field__select" id="nb-tcols" style="min-block-size:34px;width:70px">' +
            cols.map(function (n) { return '<option>' + n + '</option>'; }).join('') +
          '</select></label>' +
      '</div>',
      function (pop, closer) {
        var go = document.createElement('button');
        go.type = 'button';
        go.className = 'btn btn--sm btn--primary';
        go.style.margin = '0 var(--s-3) var(--s-2)';
        go.textContent = 'Insert';
        pop.appendChild(go);
        go.addEventListener('click', function () {
          insertTable(+$('#nb-trows', pop).value, +$('#nb-tcols', pop).value);
          closer();
        });
      });
  }

  function tableCell() {
    var sel = global.getSelection();
    var node = sel.anchorNode;
    while (node && node !== els.editor) {
      if (node.nodeType === 1 && /^(TD|TH)$/.test(node.tagName)) { return node; }
      node = node.parentNode;
    }
    return null;
  }

  function showTableBar(cell) {
    if (!els.tablebar) {
      els.tablebar = document.createElement('div');
      els.tablebar.className = 'nb-tablebar';
      els.tablebar.hidden = true;
      els.tablebar.innerHTML =
        '<button type="button" class="nb-tool" data-top="row-above" title="Insert row above" aria-label="Insert row above">' + Icon('plus') + '</button>' +
        '<button type="button" class="nb-tool" data-top="row-below" title="Insert row below" aria-label="Insert row below">' + Icon('plus') + '</button>' +
        '<span class="nb-tsep"></span>' +
        '<button type="button" class="nb-tool" data-top="col-left" title="Insert column before" aria-label="Insert column before">' + Icon('plus') + '</button>' +
        '<button type="button" class="nb-tool" data-top="col-right" title="Insert column after" aria-label="Insert column after">' + Icon('plus') + '</button>' +
        '<span class="nb-tsep"></span>' +
        '<button type="button" class="nb-tool" data-top="del-row" title="Delete row" aria-label="Delete row">' + Icon('close') + '</button>' +
        '<button type="button" class="nb-tool" data-top="del-col" title="Delete column" aria-label="Delete column">' + Icon('close') + '</button>' +
        '<button type="button" class="nb-tool" data-top="del-table" title="Delete table" aria-label="Delete table">' + Icon('trash') + '</button>';
      els.tablebar.addEventListener('mousedown', function (e) { e.preventDefault(); });
      els.tablebar.addEventListener('click', onTableBarClick);
      els.main.appendChild(els.tablebar);
    }
    var mainRect = els.main.getBoundingClientRect();
    var cellRect = cell.getBoundingClientRect();
    els.tablebar.hidden = false;
    var tbW = els.tablebar.offsetWidth;
    var left = cellRect.left - mainRect.left + (cellRect.width - tbW) / 2;
    left = Math.min(Math.max(8, left), mainRect.width - tbW - 8);
    els.tablebar.style.left = left + 'px';
    els.tablebar.style.top = Math.max(8, cellRect.top - mainRect.top - 40) + 'px';
  }

  function hideTableBar() {
    if (els.tablebar) { els.tablebar.hidden = true; }
  }

  function onTableBarClick(e) {
    var btn = e.target.closest('[data-top]');
    if (!btn) { return; }
    var cell = tableCell();
    if (!cell) { hideTableBar(); return; }
    var row = cell.parentElement;
    var table = cell.closest('table');
    var act = btn.dataset.top;

    if (act === 'row-above' || act === 'row-below') {
      var newRow = row.cloneNode(true);
      $$('td,th', newRow).forEach(function (td) { td.innerHTML = '<br>'; });
      row.parentNode.insertBefore(newRow, act === 'row-above' ? row : row.nextSibling);
    } else if (act === 'col-left' || act === 'col-right') {
      var idx = Array.prototype.indexOf.call(row.cells, cell);
      Array.prototype.slice.call(table.rows).forEach(function (tr) {
        var td = tr.insertCell(idx + (act === 'col-right' ? 1 : 0));
        td.innerHTML = '<br>';
      });
    } else if (act === 'del-row') {
      if (table.rows.length <= 1) { table.remove(); }
      else { row.remove(); }
    } else if (act === 'del-col') {
      var ci = Array.prototype.indexOf.call(row.cells, cell);
      var last = table.rows[0].cells.length <= 1;
      Array.prototype.slice.call(table.rows).forEach(function (tr) {
        if (tr.cells[ci]) { tr.deleteCell(ci); }
      });
      if (last) { table.remove(); }
    } else if (act === 'del-table') {
      table.remove();
    }
    saveSel();
    onEdit();
  }

  /* =========================================================================
     4. Documents sidebar
     ========================================================================= */

  function filteredDocs() {
    var q = listState.query.trim().toLocaleLowerCase();
    var out = docs.filter(function (d) {
      if (listState.starredOnly && !d.starred) { return false; }
      if (!q) { return true; }
      return (d.title + ' ' + (d.searchText || '')).toLocaleLowerCase().indexOf(q) >= 0;
    });
    out.sort(function (a, b) {
      if (listState.sort === 'title') {
        return a.title.localeCompare(b.title);
      }
      var ka = listState.sort === 'created' ? a.createdAt : a.updatedAt;
      var kb = listState.sort === 'created' ? b.createdAt : b.updatedAt;
      return new Date(kb) - new Date(ka);
    });
    return out;
  }

  function renderList() {
    var list = filteredDocs();
    if (!list.length) {
      els.list.innerHTML =
        '<div class="nb-side__empty">' + Icon(listState.starredOnly ? 'star' : 'notebook') +
        '<p>' + esc(listState.starredOnly
          ? 'No starred notes yet.'
          : listState.query ? 'No notes match your search.' :
          'No notes yet — create your first one.') + '</p></div>';
      return;
    }
    els.list.innerHTML = list.map(function (d) {
      var snippet = (d.searchText || '').slice(0, 90) || 'Empty note';
      return '<button type="button" class="nb-item" role="option" data-id="' + esc(d.id) + '"' +
        (doc && d.id === doc.id ? ' aria-current="true"' : '') + '>' +
          '<span class="nb-item__title">' + esc(d.title || 'Untitled Note') + '</span>' +
          '<span class="nb-item__meta">' + relTime(d.updatedAt) +
            (d.starred ? '<span class="nb-item__star">' + Icon('star_fill') + '</span>' : '') +
          '</span>' +
          '<span class="nb-item__snippet">' + esc(snippet) + '</span>' +
        '</button>';
    }).join('');
  }

  async function flushPendingSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (dirty && doc) { await doSave(); }
    await saveInFlight;
  }

  /* ---- Empty state (no documents yet) --------------------------------------- */

  /** Show the "create your first note" screen instead of auto-creating. */
  function renderEmptyMain(opts) {
    opts = opts || {};
    clearTimeout(saveTimer);
    saveTimer = null;
    doc = null;
    dirty = false;
    lastSavedSnapshot = null;
    lastSavedHadRealContent = false;
    savedRange = null;
    if (!opts.preserveUrl) { history.replaceState(null, '', '#/notebook'); }
    els.app.dataset.empty = 'true';
    els.title.value = '';
    els.editor.innerHTML = '';
    els.title.disabled = true;
    ['[data-act="star"]', '[data-act="export"]', '[data-act="more"]']
      .forEach(function (sel) {
        var b = $(sel, els.main);
        if (b) { b.disabled = true; }
      });
    hideTableBar();
    closeFind(true);
    var existingHolder = $('#nb-empty-holder', els.main);
    if (existingHolder) { existingHolder.remove(); }

    var holder = document.createElement('div');
    holder.id = 'nb-empty-holder';
    holder.className = 'nb-emptystate';
    holder.innerHTML = UI.emptyState({
      icon: 'notebook',
      title: 'A blank page awaits',
      body: 'Practise writing in any script — Urdu, Arabic, Hindi, Chinese and ' +
        'dozens more. Notes save automatically on this device, or sync privately ' +
        'when you are signed in.',
      actions: '<button type="button" class="btn btn--primary" data-act="empty-new">' +
        Icon('plus') + 'Create a note</button>'
    });
    els.canvas.appendChild(holder);
    $('[data-act="empty-new"]', holder).addEventListener('click', createDoc);

    $('#nb-c-words', els.main).textContent = '0 words';
    $('#nb-c-chars', els.main).textContent = '0 characters';
    $('#nb-c-paras', els.main).textContent = '0 paragraphs';
    setStatus('saved');
  }

  /** Restore the editor chrome once a document exists again. */
  function clearEmptyMain() {
    if (!els.app || els.app.dataset.empty !== 'true') { return; }
    delete els.app.dataset.empty;
    els.title.disabled = false;
    ['[data-act="star"]', '[data-act="export"]', '[data-act="more"]']
      .forEach(function (sel) {
        var b = $(sel, els.main);
        if (b) { b.disabled = false; }
      });
    var holder = $('#nb-empty-holder', els.main);
    if (holder) { holder.remove(); }
  }

  async function openDocById(id, opts) {
    opts = opts || {};
    await flushPendingSave();
    var next = docs.filter(function (d) { return d.id === id; })[0];
    if (!next) { next = await NBStorage.get(id); }
    if (!next) { return false; }
    clearEmptyMain();
    doc = next;
    doc._persisted = true;
    dirty = false;

    history.replaceState(null, '', '#/notebook/' + doc.id);

    els.title.value = doc.title;
    NBScripts.loadFonts(doc.script);

    /* Ensure the doc's script owns the font dropdown. */
    if (fontIndexFor(doc.fontFamily) < 0) {
      doc.fontFamily = NBScripts.defaultFont(doc.script).css;
    }
    var fi = fontIndexFor(doc.fontFamily);
    $('#nb-font-sel', els.main).innerHTML =
      NBScripts.fontsOf(doc.script).map(function (fnt, i) {
        return '<option value="' + i + '"' + (i === fi ? ' selected' : '') + '>' +
          esc(fnt.name) + '</option>';
      }).join('');

    rebuildScriptSelect();
    updateScriptChip();
    applyEditorVars();
    els.editor.setAttribute('dir', doc.dir === 'rtl' || doc.dir === 'ltr' ? doc.dir : 'ltr');

    els.editor.innerHTML = NBSanitize.clean(doc.contentHtml) || '<p><br></p>';
    savedRange = null;
    updateCounts();
    updateEmptyFlag();
    lastSavedSnapshot = documentSnapshot();
    lastSavedHadRealContent = hasRealContent();
    setStatus('saved');
    renderList();
    syncStarButton();
    if (!opts.keepFind) { closeFind(true); }
    return true;
  }

  function applyEditorVars() {
    els.editor.style.setProperty('--nb-font', doc.fontFamily || 'inherit');
    els.editor.style.setProperty('--nb-size', (doc.fontSize || 17) + 'px');
    var lh = doc.lineHeight || NBScripts.lineHeight(doc.script) || 1.7;
    els.editor.style.setProperty('--nb-leading', String(lh));
    els.editor.setAttribute('dir',
      doc.dir === 'rtl' ? 'rtl' : doc.dir === 'ltr' ? 'ltr' : 'ltr');
  }

  async function createDoc() {
    await flushPendingSave();
    var previous = doc;
    renderEmptyMain();
    var baseTitle = 'Untitled Note';
    var taken = {};
    docs.forEach(function (d) { taken[d.title] = true; });
    var title = baseTitle;
    var n = 2;
    while (taken[title]) { title = baseTitle + ' ' + n++; }
    doc = NBStorage.normalize({
      id: uid(),
      title: title,
      contentHtml: '',
      script: previous ? previous.script : 'latin',
      fontFamily: previous ? previous.fontFamily : '',
      fontSize: previous ? previous.fontSize : 17,
      dir: previous ? (previous.dir === 'rtl' ? 'rtl' : 'ltr') : 'ltr',
      lineHeight: previous ? previous.lineHeight : 1.7,
      wordCount: 0, charCount: 0
    });
    doc._persisted = false;
    clearEmptyMain();
    els.title.value = doc.title;
    NBScripts.loadFonts(doc.script);
    var fi = fontIndexFor(doc.fontFamily);
    $('#nb-font-sel', els.main).innerHTML =
      NBScripts.fontsOf(doc.script).map(function (font, i) {
        return '<option value="' + i + '"' + (i === fi ? ' selected' : '') + '>' +
          esc(font.name) + '</option>';
      }).join('');
    rebuildScriptSelect();
    updateScriptChip();
    applyEditorVars();
    els.editor.innerHTML = '<p><br></p>';
    updateCounts();
    updateEmptyFlag();
    lastSavedSnapshot = documentSnapshot();
    lastSavedHadRealContent = false;
    syncStarButton();
    setStatus('saved');
    renderList();
    els.editor.focus();
  }

  async function deleteCurrent() {
    UI.confirm({
      title: 'Delete this note?',
      description: '“' + (doc.title || 'Untitled Note') + '” will be removed' +
        (NBStorage.isCloud() ? ' from your account.' : ' from this device.') +
        ' This cannot be undone.',
      confirmText: 'Delete',
      danger: true
    }, async function () {
      var deleting = doc;
      clearTimeout(saveTimer);
      saveTimer = null;
      dirty = false;
      await saveInFlight;
      if (deleting._persisted) { await NBStorage.remove(deleting.id); }
      docs = docs.filter(function (d) { return d.id !== deleting.id; });
      UI.toast('Note deleted');
      renderList();
      renderEmptyMain();
    });
  }

  async function duplicateCurrent() {
    await flushPendingSave();
    if (!hasRealContent()) {
      await createDoc();
      return;
    }
    var copy = await NBStorage.put(Object.assign({}, doc, {
      id: null,
      title: (doc.title || 'Untitled Note') + ' (copy)',
      starred: false,
      createdAt: undefined,
      updatedAt: undefined
    }));
    docs.unshift(copy);
    await openDocById(copy.id);
    UI.toast('Duplicated');
  }

  function toggleStar() {
    doc.starred = !doc.starred;
    dirty = documentSnapshot() !== lastSavedSnapshot;
    syncStarButton();
    renderList();
    scheduleSave();
  }

  function syncStarButton() {
    var btn = $('#nb-star-btn', els.main);
    btn.innerHTML = Icon(doc.starred ? 'star_fill' : 'star');
    btn.setAttribute('aria-pressed', String(!!doc.starred));
    btn.setAttribute('aria-label',
      doc.starred ? 'Remove star' : 'Star this note');
  }

  /* =========================================================================
     5. Autosave & status
     ========================================================================= */

  function setStatus(state) {
    els.status.dataset.state = state;
    var label = {
      saving: 'Saving…', saving_local: 'Saving…',
      syncing: 'Syncing…', saved: 'Saved',
      setup: 'Saved locally',
      offline: 'Offline', error: 'Retry pending'
    }[state] || 'Saved';
    els.statusText.textContent = label;
  }

  function hasRealContent(html) {
    if (!doc) { return false; }
    html = typeof html === 'string' ? html : cleanEditorHtml();
    var text = NBSanitize.toText(html).replace(/\s+/g, ' ').trim();
    var title = String(doc.title || '').trim();
    return !!text || /<(img|table|hr)\b/i.test(html) ||
      (!!title && !/^Untitled Note(?: \d+)?$/.test(title));
  }

  function documentSnapshot(html) {
    if (!doc) { return null; }
    html = typeof html === 'string' ? html : cleanEditorHtml();
    return JSON.stringify({
      title: String(doc.title || '').trim() || 'Untitled Note',
      contentHtml: html,
      script: doc.script,
      fontFamily: doc.fontFamily || '',
      fontSize: Number(doc.fontSize) || 17,
      dir: doc.dir,
      lineHeight: Number(doc.lineHeight) || 1.7,
      starred: !!doc.starred,
      wordCount: Number(doc.wordCount) || 0,
      charCount: Number(doc.charCount) || 0
    });
  }

  /** Clone and sanitize the editor once, then share the result through save. */
  function captureDocumentState() {
    if (!doc) { return { html: '', snapshot: null, hasRealContent: false }; }
    var html = cleanEditorHtml();
    return {
      html: html,
      snapshot: documentSnapshot(html),
      hasRealContent: hasRealContent(html)
    };
  }

  function scheduleSave(state) {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!doc) { return; }
    state = state || captureDocumentState();
    dirty = state.snapshot !== lastSavedSnapshot;
    if (!dirty || (!state.hasRealContent && !lastSavedHadRealContent)) {
      setStatus('saved');
      return;
    }
    setStatus('saving');
    saveTimer = setTimeout(function () { doSave(state); }, 700);
  }

  function doSave(state) {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!doc) { return saveInFlight; }

    state = state || captureDocumentState();
    var savingDoc = doc;
    var html = state.html;
    var searchText = NBSanitize.toText(html)
      .replace(/\s+/g, ' ').trim().slice(0, 20000).toLowerCase();
    var snapshot = state.snapshot;
    var snapshotHasRealContent = state.hasRealContent;
    if (snapshot === lastSavedSnapshot ||
        (!snapshotHasRealContent && !lastSavedHadRealContent)) {
      dirty = false;
      setStatus('saved');
      return saveInFlight;
    }

    var payload = Object.assign({}, savingDoc, {
      contentHtml: html,
      searchText: searchText
    });
    saveInFlight = saveInFlight.then(async function () {
      try {
        var wasPersisted = savingDoc._persisted;
        var stored = await NBStorage.put(payload);
        savingDoc.contentHtml = stored.contentHtml;
        savingDoc.searchText = stored.searchText;
        savingDoc.createdAt = stored.createdAt;
        savingDoc.updatedAt = stored.updatedAt;
        savingDoc._persisted = true;
        if (!docs.some(function (d) { return d.id === savingDoc.id; })) {
          docs.unshift(savingDoc);
          renderList();
        } else {
          refreshRow(savingDoc);
        }
        if (doc === savingDoc) {
          if (!wasPersisted) {
            history.replaceState(null, '', '#/notebook/' + savingDoc.id);
          }
          lastSavedSnapshot = snapshot;
          lastSavedHadRealContent = snapshotHasRealContent;
          var currentState = captureDocumentState();
          dirty = currentState.snapshot !== snapshot;
          if (NBStorage.isCloud() && NBStorage.remoteHealthy()) {
            setStatus('syncing');
          } else {
            setStatus('saved');
          }
          if (dirty) { scheduleSave(currentState); }
        }
      } catch (e) {
        console.warn('[Notebook] Save failed.', e);
        if (doc === savingDoc) {
          dirty = true;
          setStatus(navigator.onLine ? 'error' : 'offline');
        }
      }
    });
    return saveInFlight;
  }

  /** Editor HTML with transient find highlights removed, sanitized. */
  function cleanEditorHtml() {
    var clone = els.editor.cloneNode(true);
    $$('mark.nb-hit', clone).forEach(function (mark) {
      var parent = mark.parentNode;
      while (mark.firstChild) { parent.insertBefore(mark.firstChild, mark); }
      parent.removeChild(mark);
      parent.normalize();
    });
    return NBSanitize.clean(clone.innerHTML);
  }

  /** Cheap in-place sidebar row update after an autosave. */
  function refreshRow(updated) {
    var row = els.list.querySelector('.nb-item[data-id="' + updated.id + '"]');
    if (row) {
      $('.nb-item__title', row).textContent = updated.title || 'Untitled Note';
      $('.nb-item__snippet', row).textContent =
        (updated.searchText || '').slice(0, 90) || 'Empty note';
      $('.nb-item__meta', row).childNodes[0].textContent = relTime(updated.updatedAt);
    }
  }

  /* =========================================================================
     6. Find bar
     ========================================================================= */

  function openFind() {
    els.find.hidden = false;
    var input = $('#nb-find-input', els.main);
    input.focus();
    input.select();
  }

  function closeFind(silent) {
    clearHits();
    els.find.hidden = true;
    findState = null;
    if (!silent) { restoreSel(); }
  }

  function clearHits() {
    if (!findState || !findState.marks.length) { return; }
    findState.marks.forEach(function (mark) {
      var parent = mark.parentNode;
      if (!parent) { return; }
      while (mark.firstChild) { parent.insertBefore(mark.firstChild, mark); }
      parent.removeChild(mark);
      parent.normalize();
    });
    findState = { q: '', marks: [], idx: -1 };
  }

  function runFind() {
    clearHits();
    var q = $('#nb-find-input', els.main).value;
    if (!q) {
      $('#nb-find-count', els.main).textContent = '';
      findState = { q: q, marks: [], idx: -1 };
      return;
    }
    var marks = [];
    var needle = q.toLowerCase();

    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var lower = child.nodeValue.toLowerCase();
          var pos = 0;
          var idx;
          while ((idx = lower.indexOf(needle, pos)) >= 0) {
            var end = idx + q.length;
            var after = child.splitText(end);
            var hitPart = child.splitText(idx);
            var mark = document.createElement('mark');
            mark.className = 'nb-hit';
            mark.appendChild(hitPart.cloneNode(true));
            hitPart.parentNode.replaceChild(mark, hitPart);
            marks.push(mark);
            child = after;
            lower = after.nodeValue ? after.nodeValue.toLowerCase() : '';
            pos = 0;
            if (!lower) { break; }
          }
        } else if (child.nodeType === 1 && child.tagName !== 'MARK') {
          walk(child);
        }
      });
    })(els.editor);

    findState = { q: q, marks: marks, idx: -1 };
    $('#nb-find-count', els.main).textContent =
      marks.length ? '0 / ' + marks.length : 'No matches';
    if (marks.length) { stepFind(1); }
  }

  function stepFind(delta) {
    if (!findState || !findState.marks.length) { return; }
    var prev = findState.marks[findState.idx];
    if (prev) { prev.classList.remove('current'); }
    findState.idx =
      (findState.idx + delta + findState.marks.length) % findState.marks.length;
    var current = findState.marks[findState.idx];
    current.classList.add('current');
    current.scrollIntoView({ block: 'center' });
    $('#nb-find-count', els.main).textContent =
      (findState.idx + 1) + ' / ' + findState.marks.length;
  }

  /* =========================================================================
     7. Menus & migration
     ========================================================================= */

  function openExportMenu(anchor) {
    var items = [
      ['docx', 'Word document (.docx)'],
      ['pdf', 'PDF (print-ready)'],
      ['htmlDoc', 'Web page (.html)'],
      ['md', 'Markdown (.md)'],
      ['txt', 'Plain text (.txt)'],
      ['csv', 'All-notes index (.csv)']
    ];
    var html = '<div class="nb-pop__label">Export</div>' +
      items.map(function (it) {
        return '<button type="button" class="nb-pop-item" data-exp="' + it[0] + '">' +
          Icon('download') + '<span>' + esc(it[1]) + '</span></button>';
      }).join('');
    openPop(anchor, html, function (pop, closer) {
      $$('.nb-pop-item', pop).forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var kind = btn.dataset.exp;
          closer();
          await flushPendingSave();
          if (kind === 'csv') {
            NBExport.csv(docs);
          } else {
            NBExport[kind](Object.assign({}, doc, { contentHtml: cleanEditorHtml() }));
          }
          UI.toast('Exported');
        });
      });
    });
  }

  function openMoreMenu(anchor) {
    var html =
      '<button type="button" class="nb-pop-item" data-mact="duplicate">' +
        Icon('copy') + '<span>Duplicate</span></button>' +
      '<button type="button" class="nb-pop-item nb-pop-item--danger" data-mact="delete">' +
        Icon('trash') + '<span>Delete note</span></button>';
    openPop(anchor, html, function (pop, closer) {
      $$('.nb-pop-item', pop).forEach(function (btn) {
        btn.addEventListener('click', function () {
          closer();
          var act = btn.dataset.mact;
          if (act === 'duplicate') { duplicateCurrent(); }
          if (act === 'delete') { deleteCurrent(); }
        });
      });
    });
  }

  function openRename() {
    UI.modal({
      title: 'Rename note',
      body:
        '<form id="nb-rename-form" class="stack">' +
          '<label class="field"><span class="field__label">Title</span>' +
            '<input class="field__input" name="title" maxlength="200" required value="' +
              esc(doc.title) + '" data-autofocus></label>' +
          '<div class="modal__actions">' +
            '<button type="button" class="btn" data-act="cancel">Cancel</button>' +
            '<button type="submit" class="btn btn--primary">Save</button>' +
          '</div></form>',
      onMount: function (panel, close) {
        $('[data-act="cancel"]', panel).addEventListener('click', close);
        panel.querySelector('#nb-rename-form').addEventListener('submit', function (e) {
          e.preventDefault();
          var name = new FormData(e.target).get('title');
          doc.title = String(name || '').trim() || 'Untitled Note';
          els.title.value = doc.title;
          dirty = documentSnapshot() !== lastSavedSnapshot;
          close();
          scheduleSave();
          renderList();
        });
      }
    });
  }

  function setDrawer(open) {
    els.app.dataset.drawer = open ? 'open' : 'closed';
    $('[data-act="drawer"]', els.main).setAttribute('aria-expanded', String(open));
  }

  /* ---- Guest → account migration ------------------------------------------- */

  /**
   * Move guest notes without interrupting the user. A failed upload deliberately
   * leaves every local note untouched and visible; a later mount/sign-in retries.
   */
  async function migrateGuestNotes() {
    if (!NBStorage.isCloud()) { return 0; }
    try {
      return await NBStorage.migrateLocalToCloud();
    } catch (error) {
      console.warn('[Notebook] Automatic note migration deferred.', error);
      return 0;
    }
  }

  /* =========================================================================
     8. Wiring, sizing, boot
     ========================================================================= */

  var mountToken = 0;

  function cacheEls(view) {
    els.view = view;
    els.app = $('#nb-app', view);
    els.side = $('#nb-side', view);
    els.list = $('#nb-list', view);
    els.scrim = $('#nb-scrim', view);
    els.main = $('#nb-main', view);
    els.title = $('#nb-title', view);
    els.status = $('#nb-status', view);
    els.statusText = $('#nb-status-text', view);
    els.toolbar = $('#nb-toolbar', view);
    els.find = $('#nb-find', view);
    els.editor = $('#nb-editor', view);
    els.canvas = $('#nb-canvas', view);
    els.paper = $('.nb-paper', view);
    els.tablebar = null;
  }

  /** Fill the remaining viewport below the app topbar with the workspace. */
  function sizeWorkspace() {
    var topbar = document.getElementById('topbar');
    var topH = topbar ? topbar.offsetHeight : 56;
    var h = Math.max(320, global.innerHeight - topH);
    els.app.style.blockSize = '';
    els.app.style.height = h + 'px';
  }

  function onEditorKeyDown(e) {
    var mod = e.ctrlKey || e.metaKey;

    if (mod && !e.altKey) {
      var k = e.key.toLowerCase();
      if (k === 'f') { e.preventDefault(); openFind(); return; }
      if (k === 's') { e.preventDefault(); scheduleSave(); return; }
      /* Guarantee the classic shortcuts even where native handling varies. */
      if (!e.shiftKey && k === 'b') { e.preventDefault(); exec('bold'); syncToolbarState(); return; }
      if (!e.shiftKey && k === 'i') { e.preventDefault(); exec('italic'); syncToolbarState(); return; }
      if (!e.shiftKey && k === 'u') { e.preventDefault(); exec('underline'); syncToolbarState(); return; }
      if (!e.shiftKey && k === 'z') {
        if (e.ctrlKey && e.metaKey) { return; }   /* let platform decide */
        restoreSel(); document.execCommand('undo'); onEdit(); syncToolbarState();
        e.preventDefault(); return;
      }
      if ((k === 'y') || (e.shiftKey && k === 'z')) {
        restoreSel(); document.execCommand('redo'); onEdit(); syncToolbarState();
        e.preventDefault(); return;
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (currentBlock() && currentBlock().closest('li, table')) {
        document.execCommand(e.shiftKey ? 'outdent' : 'indent');
      } else {
        document.execCommand('insertText', false, '\u00a0\u00a0');
      }
      onEdit();
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      /* Keep empty headings from trapping the caret: convert to paragraph. */
      setTimeout(function () {
        var b = currentBlock();
        if (b && /^H[1-6]$/.test(b.tagName) && !b.textContent.trim()) {
          document.execCommand('formatBlock', false, '<p>');
        }
      }, 0);
    }
  }

  function wireEvents() {
    var editor = els.editor;

    editor.addEventListener('input', onEdit);
    editor.addEventListener('keydown', onEditorKeyDown);
    editor.addEventListener('keyup', saveSel);
    editor.addEventListener('mouseup', saveSel);
    editor.addEventListener('focus', saveSel);
    editor.addEventListener('paste', function () { setTimeout(onEdit, 0); });

    /* The editor owns the paper padding in CSS, so every visible white area is
       part of the contenteditable surface and accepts a caret directly. */

    /* Keep the caret's selection alive when toolbar buttons take focus. */
    els.toolbar.addEventListener('mousedown', function (e) {
      if (e.target.closest('select')) { return; }
      e.preventDefault();
    });
    els.toolbar.addEventListener('click', onToolbarClick);
    els.toolbar.addEventListener('change', onToolbarChange);

    $('#nb-script-chip', els.main).addEventListener('click', function () {
      openScriptPop(this);
    });

    els.title.addEventListener('input', function () {
      doc.title = els.title.value;
      dirty = documentSnapshot() !== lastSavedSnapshot;
      scheduleSave();
      clearTimeout(els._rowTimer);
      els._rowTimer = setTimeout(function () { refreshRow(doc); }, 400);
    });

    $('[data-act="drawer"]', els.main).addEventListener('click',
      function () { setDrawer(els.app.dataset.drawer !== 'open'); });
    els.scrim.addEventListener('click', function () { setDrawer(false); });

    $('[data-act="star"]', els.main).addEventListener('click', toggleStar);
    $('[data-act="export"]', els.main).addEventListener('click', function () {
      openExportMenu(this);
    });
    $('[data-act="duplicate"]', els.main).addEventListener('click', duplicateCurrent);
    $('[data-act="delete"]', els.main).addEventListener('click', deleteCurrent);
    $('[data-act="more"]', els.main).addEventListener('click', function () {
      openMoreMenu(this);
    });

    $('#nb-search', els.side).addEventListener('input', function () {
      listState.query = this.value;
      renderList();
    });
    $('#nb-starred-filter', els.side).addEventListener('click', function () {
      listState.starredOnly = !listState.starredOnly;
      this.setAttribute('aria-pressed', String(listState.starredOnly));
      renderList();
    });
    $('#nb-sort', els.side).addEventListener('change', function () {
      listState.sort = this.value;
      renderList();
    });
    $('[data-act="new-doc"]', els.side).addEventListener('click', createDoc);

    els.list.addEventListener('click', async function (e) {
      var item = e.target.closest('.nb-item');
      if (!item) { return; }
      setDrawer(false);
      if (doc && item.dataset.id === doc.id) { return; }
      await openDocById(item.dataset.id);
    });

    /* Find bar */
    var findInput = $('#nb-find-input', els.main);
    var findDebounce = null;
    findInput.addEventListener('input', function () {
      clearTimeout(findDebounce);
      findDebounce = setTimeout(runFind, 220);
    });
    findInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        stepFind(e.shiftKey ? -1 : 1);
      }
      if (e.key === 'Escape') { closeFind(); }
    });
    $('[data-act="find-next"]', els.main).addEventListener('click', function () { stepFind(1); });
    $('[data-act="find-prev"]', els.main).addEventListener('click', function () { stepFind(-1); });
    $('[data-act="find-close"]', els.main).addEventListener('click', function () { closeFind(); });

    /* Caret tracking: toolbar state + floating table controls. */
    var tick = false;
    this._onSelChange = function () {
      if (tick) { return; }
      tick = true;
      requestAnimationFrame(function () {
        tick = false;
        if (!doc) { return; }
        saveSel();
        syncToolbarState();
        var cell = tableCell();
        if (cell && els.main.contains(cell)) { showTableBar(cell); }
        else { hideTableBar(); }
      });
    };
    document.addEventListener('selectionchange', this._onSelChange);

    /* Global keys scoped to the notebook screen. */
    this._onDocKey = function (e) {
      if (!els.main.contains(e.target) && !els.side.contains(e.target)) { return; }
      if (e.key === 'Escape') {
        if (popClose) { return; }            /* popover closes itself */
        if (!els.find.hidden) { closeFind(); return; }
        if (els.app.dataset.drawer === 'open') { setDrawer(false); }
      }
      var mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && e.key.toLowerCase() === 'f' &&
          els.editor.contains(e.target)) { return; }   /* handled in editor */
    };
    document.addEventListener('keydown', this._onDocKey);

    this._onResize = function () { sizeWorkspace(); };
    global.addEventListener('resize', this._onResize);

    this._onOnline = function () { setStatus('saved'); };
    this._onOffline = function () { setStatus('offline'); };
    global.addEventListener('online', this._onOnline);
    global.addEventListener('offline', this._onOffline);

    this._onHide = function () {
      if (dirty) { doSave(); }
    };
    this._onVis = function () {
      if (document.visibilityState === 'hidden' && dirty) { doSave(); }
    };
    document.addEventListener('visibilitychange', this._onVis);
    global.addEventListener('pagehide', this._onHide);

    this._onSignedIn = async function () {
      try {
        await flushPendingSave();
        await NBStorage.settle();
        await migrateGuestNotes();
        var fresh = await NBStorage.list();
        updateCloudNote();
        docs = fresh;
        if (doc) {
          var stillThere = fresh.some(function (d) { return d.id === doc.id; });
          if (stillThere) { renderList(); }
          else { renderList(); renderEmptyMain(); }
        } else { renderList(); }
      } catch (error) {
        console.warn('[Notebook] Post-sign-in refresh failed.', error);
        UI.toast('Your note was saved on this device, but account notes could not be refreshed.',
          { icon: 'warning', duration: 6000 });
      }
    };
    global.addEventListener('lexio:signed-in', this._onSignedIn);

    var setupWarned = false;
    NBStorage.onSync(function (state) {
      if (state === 'setup') {
        setStatus('setup');
        if (!setupWarned) {
          setupWarned = true;
          UI.toast(
            'Notes are saving on this device. Run the Notebook database ' +
            'migration in Supabase to enable account sync.',
            { icon: 'info', duration: 8000 });
        }
        return;
      }
      setStatus(state);
    });
  }

  /** Selects inside the toolbar (font, size, block type, spacing, script). */
  function onToolbarChange(e) {
    var sel = e.target;
    if (sel.id === 'nb-script-sel') {
      chooseScript(sel.value);
      return;
    }
    if (sel.id === 'nb-font-sel') {
      var font = NBScripts.fontsOf(doc.script)[+sel.value];
      if (!font) { return; }
      doc.fontFamily = font.css;
      restoreSel();
      var blocks = currentBlocks();
      if (global.getSelection().isCollapsed && blocks.length) {
        blocks.forEach(function (b) { b.style.fontFamily = font.css; });
        onEdit();
      } else {
        document.execCommand('fontName', false, font.css);
        onEdit();
      }
      applyEditorVars();
      return;
    }
    if (sel.id === 'nb-size-sel') {
      var px = parseInt(sel.value, 10);
      doc.fontSize = px;
      if (global.getSelection().isCollapsed) {
        applyEditorVars();
        onEdit();
      } else {
        applyFontSize(px);
      }
      return;
    }
    if (sel.id === 'nb-block-sel') {
      restoreSel();
      document.execCommand('formatBlock', false, '<' + sel.value + '>');
      onEdit();
      syncToolbarState();
      return;
    }
    if (sel.id === 'nb-lh-sel') {
      applyBlockStyle('lineHeight', sel.value || null);
    }
  }

  function updateCloudNote() {
    var note = $('#nb-cloud-note', els.app);
    if (NBStorage.isCloud()) {
      note.innerHTML = Icon('cloud') +
        '<span>Your notes are privately synced.</span>';
    } else {
      note.innerHTML = Icon('cloud_off') +
        '<span>Guest mode — notes stay on this device. ' +
        '<button type="button" class="link-button" data-act="signin">Sign in</button>' +
        '</span>';
      $('[data-act="signin"]', note).addEventListener('click', function () {
        CloudSync.openSignIn();
      });
    }
  }

  /* ---- Boot ------------------------------------------------------------------ */

  async function boot(view, params) {
    var token = ++mountToken;
    view.innerHTML = shellHtml();
    cacheEls(view);

    wireEvents.call(wireEvents);
    sizeWorkspace();

    try {
      if (!bootedOnce) {
        bootedOnce = true;
        await NBStorage.init();
      }
      await migrateGuestNotes();
      docs = await NBStorage.listLocal();
    } catch (e) {
      console.error('[Notebook] Storage unavailable.', e);
      view.innerHTML = UI.emptyState({
        icon: 'notebook',
        title: 'Storage unavailable',
        body: 'This browser is blocking local storage, so notes cannot be saved here.'
      });
      return null;
    }
    if (token !== mountToken) { return null; }

    updateCloudNote();
    renderList();

    if (params && params.id) {
      var opened = await openDocById(params.id);
      if (token !== mountToken) { return null; }
      if (!opened) { renderEmptyMain({ preserveUrl: true }); }
    } else if (docs.length) {
      await openDocById(docs[0].id);
      if (token !== mountToken) { return null; }
    } else {
      renderEmptyMain({ preserveUrl: !!(params && params.id) });
    }

    if (NBStorage.isCloud()) {
      NBStorage.list().then(function (fresh) {
        if (token !== mountToken) { return; }
        docs = fresh;
        renderList();
        if (!doc && docs.length) {
          openDocById(docs[0].id);
        }
      }).catch(function () {});
    }

    return { teardown: teardown };
  }

  function teardown() {
    mountToken++;
    clearTimeout(saveTimer);
    clearTimeout(els._rowTimer);
    closePop();
    hideTableBar();
    if (dirty && doc) { doSave(); }
    NBStorage.settle();

    var w = wireEvents;
    document.removeEventListener('selectionchange', w._onSelChange || function () {});
    document.removeEventListener('keydown', w._onDocKey || function () {});
    document.removeEventListener('visibilitychange', w._onVis || function () {});
    global.removeEventListener('resize', w._onResize || function () {});
    global.removeEventListener('online', w._onOnline || function () {});
    global.removeEventListener('offline', w._onOffline || function () {});
    global.removeEventListener('pagehide', w._onHide || function () {});
    global.removeEventListener('lexio:signed-in', w._onSignedIn || function () {});
    NBStorage.onSync(null);
    docs = [];
    doc = null;
    dirty = false;
  }

  /* ---- Registration ------------------------------------------------------------ */

  global.Views = global.Views || {};
  Views.notebook = boot;
})(window);
