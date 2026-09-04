/* ==========================================================================
   Notebook — HTML sanitizer.

   Stored document content is user-generated and must never be trusted.
   NBSanitize.clean(html) rebuilds the markup through a whitelist:
     - only known tags survive (formatting, structure, tables, links)
     - style attributes are filtered to a fixed set of safe CSS properties
       whose values contain no url()/expression()/javascript
     - href/src schemes are restricted (http, https, mailto)
     - scripts, iframes, event handlers, classes and ids are stripped
   Runs on load AND before save so stored data stays clean even if a future
   editor bug produces something unexpected.
   ========================================================================== */
(function (global) {
  'use strict';

  var ALLOWED_TAGS = {
    p: 1, div: 1, br: 1, hr: 1,
    h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1,
    strong: 1, b: 1, em: 1, i: 1, u: 1, s: 1, strike: 1, del: 1,
    sub: 1, sup: 1, span: 1, font: 1, code: 1, mark: 1,
    ul: 1, ol: 1, li: 1, blockquote: 1, pre: 1,
    a: 1, table: 1, thead: 1, tbody: 1, tfoot: 1, tr: 1, td: 1, th: 1,
    section: 1, article: 1, header: 1, footer: 1
  };

  /* Elements that carry text direction for mixed-script documents. */
  var BLOCK_WITH_DIR = {
    p: 1, div: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1,
    li: 1, blockquote: 1, td: 1, th: 1, section: 1, article: 1
  };

  var ALLOWED_ATTRS = { dir: 1, colspan: 1, rowspan: 1, start: 1, type: 1 };
  var ALIGN_VALUES = /^(left|right|center|justify)$/i;

  var ALLOWED_STYLES = {
    color: 1, 'background-color': 1,
    'font-family': 1, 'font-size': 1, 'font-weight': 1, 'font-style': 1,
    'text-decoration': 1, 'text-decoration-line': 1,
    'line-height': 1, 'text-align': 1, direction: 1,
    'margin-inline-start': 1, 'margin-inline-end': 1,
    'margin-left': 1, 'margin-right': 1,
    'unicode-bidi': 1
  };
  /* bidi control values are safe; everything else about unicode-bidi is too. */
  var SAFE_BIDI = /^(isolate|plaintext|embed)$/;

  function safeStyleValue(prop, value) {
    value = String(value || '').trim();
    if (!value || value.length > 300) { return ''; }
    if (/url\s*\(|expression|javascript:|@import|position\s*:/i.test(value)) { return ''; }
    if (prop === 'unicode-bidi' && !SAFE_BIDI.test(value)) { return ''; }
    return value;
  }

  function cleanStyle(el) {
    var raw = el.getAttribute('style');
    el.removeAttribute('style');
    if (!raw) { return; }
    var kept = [];
    raw.split(';').forEach(function (decl) {
      var idx = decl.indexOf(':');
      if (idx < 1) { return; }
      var prop = decl.slice(0, idx).trim().toLowerCase();
      var value = decl.slice(idx + 1);
      if (!ALLOWED_STYLES[prop]) { return; }
      value = safeStyleValue(prop, value);
      if (value) { kept.push(prop + ': ' + value); }
    });
    if (kept.length) { el.setAttribute('style', kept.join('; ')); }
  }

  function safeHref(value) {
    value = String(value || '').trim();
    if (!value) { return ''; }
    if (/^(https?:|mailto:)/i.test(value)) { return value; }
    if (/^[/#?]/.test(value)) { return value; }        /* site-relative */
    return '';
  }

  function cleanAttributes(el) {
    var styleRaw = el.getAttribute('style');
    var attrs = Array.prototype.slice.call(el.attributes);
    attrs.forEach(function (attr) { el.removeAttribute(attr.name); });
    attrs.forEach(function (attr) {
      var name = attr.name.toLowerCase();
      if (name === 'style') { return; }                /* handled separately */
      if (el.tagName === 'A' && name === 'href') {
        var href = safeHref(attr.value);
        if (href) {
          el.setAttribute('href', href);
          el.setAttribute('rel', 'noopener noreferrer');
          el.setAttribute('target', '_blank');
        }
        return;
      }
      if (ALLOWED_ATTRS[name] &&
          !/^on/i.test(name) && String(attr.value).length <= 100) {
        el.setAttribute(name, attr.value);
        return;
      }
      if (name === 'align' && ALIGN_VALUES.test(attr.value)) {
        el.setAttribute('align', attr.value.toLowerCase());
      }
    });
    if (BLOCK_WITH_DIR[el.tagName.toLowerCase()]) {
      var dir = el.getAttribute('dir');
      if (dir !== 'rtl' && dir !== 'ltr' && dir !== 'auto') {
        if (dir !== null) { el.setAttribute('dir', 'auto'); }
      }
    } else {
      el.removeAttribute('dir');
    }
    /* Re-attach for cleanStyle() to filter against the whitelist. */
    if (styleRaw) { el.setAttribute('style', styleRaw); }
  }

  /* <font color=… size=… face=…> → <span style="…"> (legacy paste output). */
  function convertFont(el) {
    var span = el.ownerDocument.createElement('span');
    var color = el.getAttribute('color');
    var face = el.getAttribute('face');
    var size = parseInt(el.getAttribute('size'), 10);
    while (el.firstChild) { span.appendChild(el.firstChild); }
    if (color && /^#?[0-9a-zA-Z]+$/.test(color.trim())) {
      span.style.color = color.trim().charAt(0) === '#' ? color.trim() : '#' + color.trim();
    }
    if (face) { span.style.fontFamily = face.replace(/["';]/g, ''); }
    if (size >= 1 && size <= 7) {
      span.style.fontSize = ['8', '10', '13', '16', '20', '26', '34'][size - 1] + 'px';
    }
    cleanStyle(span);
    el.parentNode.replaceChild(span, el);
    return span;
  }

  function walk(node) {
    var children = Array.prototype.slice.call(node.childNodes);
    children.forEach(function (child) {
      if (child.nodeType === 3) { return; }            /* text: keep */
      if (child.nodeType !== 1) { child.remove(); return; }
      var tag = child.tagName.toLowerCase();

      /* Comments, PIs, scripts, styles, embeds — gone unconditionally. */
      if (!ALLOWED_TAGS[tag]) { child.remove(); return; }

      if (tag === 'font') {
        walk(convertFont(child));
        return;
      }

      /* Images have no upload pipeline; blob/data URLs die on reload anyway. */
      if (tag === 'img' || tag === 'picture') { child.remove(); return; }

      cleanAttributes(child);
      if (child.hasAttribute('style')) { cleanStyle(child); }
      walk(child);
    });
  }

  /**
   * Sanitize a rich-text HTML string.
   * @param {string} html
   * @returns {string} cleaned HTML
   */
  function clean(html) {
    if (!html || typeof html !== 'string') { return ''; }
    if (html.length > 2000000) { html = html.slice(0, 2000000); }
    var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    walk(doc.body);
    var out = doc.body.innerHTML;
    /* Defence in depth: no handler or script may survive any code path. */
    out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    out = out.replace(/<\s*(script|iframe|object|embed|link|meta|base)[^>]*>/gi, '');
    return out;
  }

  /** Plain-text projection used for search snippets and counts. */
  function toText(html) {
    if (!html) { return ''; }
    var doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
    return (doc.body.textContent || '').replace(/\u00a0/g, ' ');
  }

  global.NBSanitize = { clean: clean, toText: toText };
})(window);
