/* ==========================================================================
   UI utilities — DOM helpers, escaping, toasts, modal sheets.
   ========================================================================== */
(function (global) {
  'use strict';

  /** Escape untrusted text before it goes into an HTML string. */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function plural(n, one, many) { return n === 1 ? one : (many || one + 's'); }

  function fmtBytes(n) {
    if (n < 1024) { return n + ' B'; }
    if (n < 1024 * 1024) { return (n / 1024).toFixed(1) + ' KB'; }
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 5) { return 'Still up'; }
    if (h < 12) { return 'Good morning'; }
    if (h < 18) { return 'Good afternoon'; }
    return 'Good evening';
  }

  /* ---- Toast -------------------------------------------------------------- */
  function toast(message, opts) {
    opts = opts || {};
    var root = document.getElementById('toast-root');
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = Icon(opts.icon || 'check') + '<span>' + esc(message) + '</span>';
    root.appendChild(el);
    setTimeout(function () {
      el.classList.add('toast--out');
      setTimeout(function () { el.remove(); }, 220);
    }, opts.duration || 2600);
  }

  /* ---- Modal sheet --------------------------------------------------------
     Bottom sheet on mobile, centred dialog on desktop (CSS handles the shift).
     Focus is trapped while open and restored on close.
     ------------------------------------------------------------------------- */
  var openModal = null;

  function modal(config) {
    closeModal();
    var root = document.getElementById('modal-root');
    var prevFocus = document.activeElement;

    var overlay = document.createElement('div');
    overlay.className = 'modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', config.title || 'Dialog');

    var panel = document.createElement('div');
    panel.className = 'modal__panel';
    panel.innerHTML =
      '<div class="modal__grab" aria-hidden="true"></div>' +
      (config.title ? '<h2 class="modal__title">' + esc(config.title) + '</h2>' : '') +
      (config.description ? '<p class="modal__desc">' + esc(config.description) + '</p>' : '') +
      (config.body || '');

    overlay.appendChild(panel);
    root.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    function close() {
      overlay.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey, true);
      openModal = null;
      if (prevFocus && prevFocus.focus) { prevFocus.focus(); }
      if (config.onClose) { config.onClose(); }
    }

    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key !== 'Tab') { return; }
      var f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', panel)
        .filter(function (el) { return el.offsetParent !== null && !el.disabled; });
      if (!f.length) { return; }
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    overlay.addEventListener('click', function (e) { if (e.target === overlay) { close(); } });
    document.addEventListener('keydown', onKey, true);

    openModal = { overlay: overlay, panel: panel, close: close };
    if (config.onMount) { config.onMount(panel, close); }

    var auto = $('[data-autofocus]', panel) ||
      $('button, input, select, textarea', panel);
    if (auto) { setTimeout(function () { auto.focus(); }, 40); }

    return openModal;
  }

  function closeModal() { if (openModal) { openModal.close(); } }

  /* ---- Confirm sheet ------------------------------------------------------ */
  function confirmSheet(config, onConfirm) {
    modal({
      title: config.title,
      description: config.description,
      body:
        '<div class="modal__actions">' +
          '<button type="button" class="btn" data-act="cancel">' + esc(config.cancelText || 'Cancel') + '</button>' +
          '<button type="button" class="btn ' + (config.danger ? 'btn--danger' : 'btn--primary') + '" data-act="ok">' +
            esc(config.confirmText || 'Confirm') +
          '</button>' +
        '</div>',
      onMount: function (panel, close) {
        $('[data-act="cancel"]', panel).addEventListener('click', close);
        $('[data-act="ok"]', panel).addEventListener('click', function () {
          close();
          onConfirm();
        });
      }
    });
  }

  /* ---- Empty state builder ------------------------------------------------ */
  function emptyState(o) {
    return '' +
      '<div class="empty' + (o.small ? ' empty--sm' : '') + (o.variant === 'edit' ? ' empty--edit' : '') + '">' +
        '<div class="empty__art">' + Icon(o.icon || 'seed') + '</div>' +
        '<h3>' + esc(o.title) + '</h3>' +
        '<p>' + esc(o.body) + '</p>' +
        (o.actions ? '<div class="empty__actions">' + o.actions + '</div>' : '') +
      '</div>';
  }

  global.UI = {
    esc: esc, $: $, $$: $$, plural: plural, fmtBytes: fmtBytes, greeting: greeting,
    toast: toast, modal: modal, closeModal: closeModal,
    confirm: confirmSheet, emptyState: emptyState
  };
})(window);
