/* ==========================================================================
   Notebook — exporters.

   • .txt  plain text projection
   • .html standalone styled document (UTF-8, correct direction + fonts)
   • .md   GitHub-flavoured markdown approximation
   • .docx real Office Open XML package (built in-browser: no dependencies).
           Preserves bold/italic/underline/strike/sub/sup, colours,
           highlights, font family+size, headings, alignment, line spacing,
           RTL paragraphs, lists and simple tables.
   • PDF   uses the browser's own print pipeline through a hidden iframe —
           the ONLY approach that shapes Urdu/Arabic/Indic/CJK correctly,
           because the platform text stack does the rendering.
   • .csv  structured index of the whole collection (not rich formatting).

   Input HTML must already be sanitized (NBSanitize.clean).
   ========================================================================== */
(function (global) {
  'use strict';

  /* ---- helpers ------------------------------------------------------------- */

  function escXml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function parse(html) {
    return new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html').body;
  }

  function slug(title) {
    var s = String(title || 'note').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return s || 'note';
  }

  function dateStamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
  }

  function download(name, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      a.remove();
      URL.revokeObjectURL(url);
    }, 400);
  }

  function baseName(doc) {
    return slug(doc.title) + '-' + dateStamp();
  }

  /** Google Fonts stylesheet covering one script's families (or null). */
  function fontsLink(scriptId) {
    if (!global.NBScripts || !NBScripts.exists(scriptId)) { return ''; }
    var fragments = [];
    NBScripts.fontsOf(scriptId).forEach(function (fnt) {
      if (fnt.gf) { fragments.push(fnt.gf); }
    });
    if (!fragments.length) { return ''; }
    return '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=' +
      fragments.join('&family=') + '&display=swap">';
  }

  /* ---- shared DOM walking ---------------------------------------------------- */

  var BLOCKS = { P: 1, DIV: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1,
    UL: 1, OL: 1, LI: 1, BLOCKQUOTE: 1, PRE: 1, TABLE: 1, HR: 1 };

  function isBlock(el) { return el.nodeType === 1 && BLOCKS[el.tagName]; }

  /* ============================ .txt ======================================= */

  function htmlToText(root) {
    var out = [];

    function inlineText(node) {
      if (node.nodeType === 3) { return node.nodeValue.replace(/\u00a0/g, ' '); }
      if (node.nodeType !== 1) { return ''; }
      if (node.tagName === 'BR') { return '\n'; }
      var s = '';
      node.childNodes.forEach(function (c) { s += inlineText(c); });
      return s;
    }

    function blocks(container, depth, prefixFn, counters) {
      var pending = [];
      var flushLine = function () {
        if (pending.join('').trim()) { out.push(pending.join('')); }
        pending = [];
      };
      Array.prototype.slice.call(container.childNodes).forEach(function (child) {
        if (isBlock(child)) {
          flushLine();
          renderBlock(child, depth);
        } else if (child.nodeType === 1 && child.tagName === 'HR') {
          flushLine();
          out.push('──────────');
        } else {
          pending.push(inlineText(child));
        }
      });
      flushLine();

      function renderBlock(el, depth) {
        switch (el.tagName) {
          case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6':
            out.push(inlineText(el).trim() + '\n');
            break;
          case 'BLOCKQUOTE':
            blocks(el, depth + 1);
            break;
          case 'PRE':
            out.push(inlineText(el) + '\n');
            break;
          case 'UL': case 'OL': {
            var n = 0;
            Array.prototype.slice.call(el.children).forEach(function (li) {
              if (li.tagName !== 'LI') { return; }
              n++;
              var marker = el.tagName === 'OL' ? n + '. ' : '• ';
              renderLiInto(out, li, depth, marker);
            });
            out.push('\n');
            break;
          }
          case 'LI':
            out.push(inlineText(el).trim() + '\n');
            break;
          case 'TABLE':
            Array.prototype.slice.call(el.rows).forEach(function (tr) {
              var cells = Array.prototype.slice.call(tr.cells).map(function (td) {
                return inlineText(td).trim().replace(/\s+/g, ' ');
              });
              out.push(cells.join('\t') + '\n');
            });
            out.push('\n');
            break;
          default:
            out.push(inlineText(el).trim() + '\n\n');
        }
      }

      function renderLiInto(sink, li, depth, marker) {
        var pad = new Array(depth + 1).join('  ');
        var parts = [pad + marker];
        Array.prototype.slice.call(li.childNodes).forEach(function (child) {
          if (child.tagName === 'UL' || child.tagName === 'OL') {
            sink.push(parts.join('') + '\n');
            parts = [];
            var n = 0;
            Array.prototype.slice.call(child.children).forEach(function (subLi) {
              if (subLi.tagName !== 'LI') { return; }
              n++;
              renderLiInto(sink, subLi, depth + 1,
                child.tagName === 'OL' ? n + '. ' : '• ');
            });
          } else if (child.nodeType === 1 && child.tagName === 'HR') {
            sink.push(parts.join('') + '\n');
            parts = [];
            sink.push(pad + '  ──────────\n');
          } else {
            parts.push(inlineText(child));
          }
        });
        if (parts.join('').trim()) { sink.push(parts.join('') + '\n'); }
      }
    }

    blocks(root, 0);
    return out.join('').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  /* ============================ .html ====================================== */

  function buildHtml(doc, forPrint) {
    var scriptDir = global.NBScripts ? NBScripts.dirOf(doc.script) : 'ltr';
    var htmlDir = doc.dir === 'rtl' || doc.dir === 'ltr' ? doc.dir : scriptDir;
    var fontFamily = doc.fontFamily ||
      (global.NBScripts ? NBScripts.defaultFont(doc.script).css : 'inherit');
    return [
      '<!DOCTYPE html>',
      '<html lang="" dir="' + htmlDir + '">',
      '<head>',
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>' + escHtml(doc.title) + '</title>',
      fontsLink(doc.script),
      '<style>',
      'body{margin:0;background:#fff;color:#111;font-family:' + fontFamily + ';}',
      '@media print{body{margin:0}}',
      '@page{size:A4;margin:18mm 16mm;}',
      '.page{max-width:' + (forPrint ? 'none' : '780px') + ';margin:0 auto;padding:' +
        (forPrint ? '0' : '48px 24px') + ';}',
      '.page[dir]{unicode-bidi:isolate;}',
      '[dir]{unicode-bidi:isolate;}',
      'h1{font-size:2em}h2{font-size:1.55em}h3{font-size:1.25em}',
      'h1,h2,h3,h4,h5,h6,p,li{line-height:' + (doc.lineHeight || 1.7) + ';}',
      'blockquote{margin:1em;padding-inline-start:1em;border-inline-start:3px solid #ccc;}',
      'table{border-collapse:collapse;width:100%}',
      'td,th{border:1px solid #999;padding:6px 10px;}',
      'hr{border:none;border-top:1px solid #999;margin:1.4em 0;}',
      '</style>',
      '</head>',
      '<body><div class="page" dir="' + htmlDir + '">' + doc.contentHtml + '</div></body>',
      '</html>'
    ].join('');
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ============================ .md ======================================== */

  function inlineMd(node) {
    if (node.nodeType === 3) {
      return node.nodeValue.replace(/\u00a0/g, ' ')
        .replace(/([*_`\[\]])/g, '\\$1');
    }
    if (node.nodeType !== 1) { return ''; }
    var inner = '';
    node.childNodes.forEach(function (c) { inner += inlineMd(c); });
    switch (node.tagName) {
      case 'BR': return '  \n';
      case 'B': case 'STRONG': return inner.trim() ? '**' + inner.trim() + '**' : '';
      case 'I': case 'EM': return inner.trim() ? '*' + inner.trim() + '*' : '';
      case 'U': return inner.trim() ? '<u>' + inner.trim() + '</u>' : '';
      case 'S': case 'STRIKE': case 'DEL': return inner.trim() ? '~~' + inner.trim() + '~~' : '';
      case 'CODE': return '`' + inner + '`';
      case 'MARK': return inner.trim() ? '==' + inner.trim() + '==' : '';
      case 'SUB': return '<sub>' + inner + '</sub>';
      case 'SUP': return '<sup>' + inner + '</sup>';
      case 'A': return '[' + inner.trim() + '](' + (node.getAttribute('href') || '') + ')';
      default: return inner;
    }
  }

  function blocksMd(container, depth) {
    var out = [];
    var pad = new Array(depth + 1).join('  ');

    function inlineOf(el) {
      var s = '';
      el.childNodes.forEach(function (c) { s += inlineMd(c); });
      return s.trim();
    }

    function walk(container, depth) {
      Array.prototype.slice.call(container.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          if (child.nodeValue.trim()) { out.push(pad + child.nodeValue.trim() + '\n\n'); }
          return;
        }
        if (child.nodeType !== 1) { return; }
        var tag = child.tagName;
        if (/^H[1-6]$/.test(tag)) {
          out.push('#'.repeat(+tag.charAt(1)) + ' ' + inlineOf(child) + '\n\n');
        } else if (tag === 'BLOCKQUOTE') {
          var inner = [];
          var savedOut = out.splice(0, out.length);
          walk(child, 0);
          var qLines = out.splice(0).join('').split('\n');
          out.push.apply(out, savedOut);
          qLines.forEach(function (l) {
            inner.push(l ? '> ' + l : '>');
          });
          out.push(inner.join('\n') + '\n\n');
        } else if (tag === 'UL' || tag === 'OL') {
          var n = 0;
          Array.prototype.slice.call(child.children).forEach(function (li) {
            if (li.tagName !== 'LI') { return; }
            n++;
            var marker = (tag === 'OL' ? n + '.' : '-') + ' ';
            var head = [];
            var subs = [];
            Array.prototype.slice.call(li.childNodes).forEach(function (c) {
              if (c.nodeType === 1 && /^H[1-6]$/.test(c.tagName)) { return; }
              if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) {
                var savedOut = out.splice(0);
                walk(c, depth + 1);
                subs = out.splice(0);
                out.push.apply(out, savedOut);
              } else {
                head.push(inlineMd(c));
              }
            });
            out.push(pad + marker + head.join('').trim() + '\n');
            out.push.apply(out, subs);
            if (subs.length) { out.push('\n'); }
          });
          out.push('\n');
        } else if (tag === 'TABLE') {
          var rows = Array.prototype.slice.call(child.rows);
          rows.forEach(function (tr, ri) {
            var cells = Array.prototype.slice.call(tr.cells).map(function (td) {
              return inlineOf(td).replace(/\|/g, '\\|') || ' ';
            });
            out.push('| ' + cells.join(' | ') + ' |\n');
            if (ri === 0) {
              out.push('|' + cells.map(function () { return ' --- '; }).join('|') + '|\n');
            }
          });
          out.push('\n');
        } else if (tag === 'HR') {
          out.push('---\n\n');
        } else if (tag === 'PRE') {
          out.push('```\n' + (child.textContent || '') + '\n```\n\n');
        } else if (tag === 'LI') {
          out.push(pad + '- ' + inlineOf(child) + '\n');
        } else {
          /* P / DIV / SECTION / ARTICLE: recurse when they wrap blocks. */
          var hasBlock = Array.prototype.some.call(child.children, isBlock);
          if (hasBlock) { walk(child, depth); }
          else if (inlineOf(child)) { out.push(pad + inlineOf(child) + '\n\n'); }
        }
      });
    }

    walk(container, depth);
    return out.join('').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  /* ============================ .docx ======================================= */

  /* --- minimal ZIP writer (STORE method, UTF-8 safe) --- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) { c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; }
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) { c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zipStore(files) {
    var chunks = [];
    var central = [];
    var offset = 0;

    function u16(v) { return [v & 255, (v >> 8) & 255]; }
    function u32(v) { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]; }

    var now = new Date();
    var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    files.forEach(function (file) {
      var nameBytes = new TextEncoder().encode(file.name);
      var crc = crc32(file.data);

      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0x0800), u16(0),
        u16(dosTime), u16(dosDate), u32(crc),
        u32(file.data.length), u32(file.data.length),
        u16(nameBytes.length), u16(0));
      chunks.push(new Uint8Array(local), nameBytes, file.data);

      central.push({
        name: nameBytes, crc: crc, size: file.data.length,
        offset: offset, time: dosTime, date: dosDate
      });
      offset += local.length + nameBytes.length + file.data.length;
    });

    var centralStart = offset;
    central.forEach(function (e) {
      var rec = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0),
        u16(e.time), u16(e.date), u32(e.crc),
        u32(e.size), u32(e.size),
        u16(e.name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(e.offset));
      chunks.push(new Uint8Array(rec), e.name);
      offset += rec.length + e.name.length;
    });

    chunks.push(new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0),
      u16(central.length), u16(central.length),
      u32(offset - centralStart), u32(centralStart), u16(0))));

    var total = chunks.reduce(function (n, c) { return n + c.length; }, 0);
    var outBytes = new Uint8Array(total);
    var pos = 0;
    chunks.forEach(function (c) { outBytes.set(c, pos); pos += c.length; });
    return new Blob([outBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  /* --- OOXML generation --- */

  function firstFamily(fontFamily) {
    var m = String(fontFamily || '').match(/["']?([^"',]+)["']?/);
    return (m && m[1].trim()) || 'Calibri';
  }

  function pxToHp(px) { return Math.round((Number(px) || 17) * 1.5); }

  var HEAD_HP = { H1: 40, H2: 32, H3: 28, H4: 25, H5: 23, H6: 22 };

  function styleOf(el, prop) {
    return (el.style && el.style[prop]) || '';
  }

  function alignOf(el) {
    var a = (el.getAttribute('align') || styleOf(el, 'textAlign') || '').toLowerCase();
    return ['left', 'right', 'center', 'justify'].indexOf(a) >= 0 ? a : '';
  }

  function dirOf(el, inheritedRtl) {
    var d = el.getAttribute && el.getAttribute('dir');
    if (d === 'rtl') { return true; }
    if (d === 'ltr') { return false; }
    return inheritedRtl;
  }

  function pPrFor(el, opts) {
    var parts = '';
    if (opts.rtl) { parts += '<w:bidi/>'; }
    var align = alignOf(el);
    if (align === 'right') { parts += '<w:jc w:val="right"/>'; }
    else if (align === 'center') { parts += '<w:jc w:val="center"/>'; }
    else if (align === 'justify') { parts += '<w:jc w:val="both"/>'; }
    else if (opts.rtl) { parts += '<w:jc w:val="right"/>'; }   /* bidi default */
    if (opts.indentTwips) {
      parts += '<w:ind w:start="' + opts.indentTwips + '" w:end="' + (opts.endTwips || 0) + '"/>';
    }
    var lh = parseFloat(styleOf(el, 'lineHeight')) || opts.lineHeight;
    if (lh && lh > 0) {
      parts += '<w:spacing w:line="' + Math.round(lh * 240) + '" w:lineRule="auto"/>';
    }
    return parts ? '<w:pPr>' + parts + '</w:pPr>' : '';
  }

  /**
   * Flatten an inline subtree into OOXML runs, accumulating properties.
   * @returns {string} run xml
   */
  function runsFor(node, props, inheritedRtl) {
    if (node.nodeType === 3) {
      return runXml(node.nodeValue, props, dirOf(node.parentNode, inheritedRtl));
    }
    if (node.nodeType !== 1) { return ''; }

    if (node.tagName === 'BR') {
      return '<w:r>' + (props._rPr(inheritedRtl) || '') + '<w:br/></w:r>';
    }

    var p = Object.assign({}, props);
    var tag = node.tagName;

    if (tag === 'B' || tag === 'STRONG') { p.bold = true; }
    if (tag === 'I' || tag === 'EM') { p.italic = true; }
    if (tag === 'U') { p.underline = true; }
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') { p.strike = true; }
    if (tag === 'SUB') { p.vert = 'subscript'; }
    if (tag === 'SUP') { p.vert = 'superscript'; }
    if (tag === 'CODE') { p.mono = true; }
    if (tag === 'MARK') {
      p.highlight = styleOf(node, 'backgroundColor') || '#ffff00';
    }

    var color = styleOf(node, 'color');
    if (color) { p.color = color; }
    var bg = styleOf(node, 'backgroundColor');
    if (bg && !p.highlight) { p.highlight = bg; }
    var ff = styleOf(node, 'fontFamily');
    if (ff) { p.family = ff; }
    var fs = styleOf(node, 'fontSize');
    if (fs && /px|pt|rem|em$/.test(fs)) {
      var px = parseFloat(fs) * (fs.indexOf('pt') > 0 ? 96 / 72 :
        fs.indexOf('rem') > 0 || fs.indexOf('em') > 0 ? 17 : 1);
      p.sizePx = px;
    }
    var deco = styleOf(node, 'textDecorationLine') || styleOf(node, 'textDecoration');
    if (/underline/.test(deco)) { p.underline = true; }
    if (/line-through/.test(deco)) { p.strike = true; }

    var out = '';
    node.childNodes.forEach(function (child) {
      out += runsFor(child, p, inheritedRtl);
    });
    return out;
  }

  /* attach rPr builder bound to this props object */
  function baseProps(extra) {
    var props = Object.assign({}, extra || {});
    props._rPr = function (rtl) { return rPr(props, rtl); };
    return props;
  }

  function colorHex(cssColor) {
    if (!cssColor) { return ''; }
    var m = String(cssColor).match(/^#([0-9a-f]{6})$/i);
    if (m) { return m[1].toUpperCase(); }
    var rgb = cssColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgb) {
      return rgb.slice(1).map(function (v) {
        var h = Number(v).toString(16);
        return h.length === 1 ? '0' + h : h;
      }).join('').toUpperCase();
    }
    /* Named colours: let Word resolve the 16 basics, drop anything else. */
    var named = { red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00',
      orange: 'FFA500', purple: '800080', pink: 'FFC0CB', black: '000000',
      white: 'FFFFFF', gray: '808080', grey: '808080', brown: 'A52A2A' };
    return named[String(cssColor).toLowerCase()] || '';
  }

  function rPr(p, rtl) {
    var parts = '';
    if (p.bold) { parts += '<w:b/><w:bCs/>'; }
    if (p.italic) { parts += '<w:i/><w:iCs/>'; }
    if (p.strike) { parts += '<w:strike/>'; }
    if (p.underline) { parts += '<w:u w:val="single"/>'; }
    if (p.vert) { parts += '<w:vertAlign w:val="' + p.vert + '"/>'; }
    if (rtl) { parts += '<w:rtl/>'; }
    var fam = p.mono ? 'Consolas' : firstFamily(p.family || '');
    if (fam) {
      parts += '<w:rFonts w:ascii="' + escXml(fam) + '" w:hAnsi="' + escXml(fam) +
        '" w:cs="' + escXml(fam) + '"/>';
    }
    var hp = pxToHp(p.sizePx);
    if (p.sizePx) { parts += '<w:sz w:val="' + hp + '"/><w:szCs w:val="' + hp + '"/>'; }
    var col = colorHex(p.color);
    if (col) { parts += '<w:color w:val="' + col + '"/>'; }
    if (p.highlight) {
      var hl = colorHex(p.highlight);
      if (hl === 'FFFF00') { parts += '<w:highlight w:val="yellow"/>'; }
      else if (hl) { parts += '<w:shd w:val="clear" w:fill="' + hl + '"/>'; }
    }
    return parts ? '<w:rPr>' + parts + '</w:rPr>' : '';
  }

  function runXml(text, p, rtl) {
    var clean = String(text).replace(/\u00a0/g, ' ').replace(/[\r\n\t]+/g, ' ');
    if (!clean) { return ''; }
    return '<w:r>' + rPr(p, rtl) +
      '<w:t xml:space="preserve">' + escXml(clean) + '</w:t></w:r>';
  }

  function paragraphXml(runsXml, pPr) {
    return '<w:p>' + (pPr || '') + runsXml + '</w:p>';
  }

  function tableXml(table, ctx) {
    var rows = Array.prototype.slice.call(table.rows);
    if (!rows.length) { return ''; }
    var cols = rows[0].cells.length || 1;
    var borders =
      '<w:tblBorders>' +
      ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (side) {
        return '<w:' + side + ' w:val="single" w:sz="4" w:space="0" w:color="999999"/>';
      }).join('') +
      '</w:tblBorders>';
    var grid = '<w:tblGrid>' +
      new Array(cols + 1).join('<w:gridCol w:w="' + Math.floor(9638 / cols) + '"/>') +
      '</w:tblGrid>';

    var xml = '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>' + borders +
      '<w:tblLayout w:type="fixed"/></w:tblPr>' + grid;

    rows.forEach(function (tr) {
      xml += '<w:tr>';
      Array.prototype.slice.call(tr.cells).forEach(function (cell) {
        var span = parseInt(cell.getAttribute('colspan'), 10);
        var tcPr = '<w:tcPr><w:tcW w:w="' +
          Math.floor(5000 / cols * (span || 1)) + '" w:type="pct"/>' +
          (span > 1 ? '<w:gridSpan w:val="' + span + '"/>' : '') +
          '</w:tcPr>';
        xml += '<w:tc>' + tcPr + containerXml(cell, ctx) + '</w:tc>';
      });
      xml += '</w:tr>';
    });
    return xml + '</w:tbl>' + EMPTY_P;
  }

  var EMPTY_P = '<w:p/>';

  /** Render a block container (body, cell, blockquote…) into w:p sequences. */
  function containerXml(container, ctx) {
    var out = [];
    var buf = '';

    function flush() {
      if (buf) { out.push(paragraphXml(buf)); buf = ''; }
    }

    Array.prototype.slice.call(container.childNodes).forEach(function (child) {
      if (child.nodeType === 3) {
        if (child.nodeValue.trim()) { buf += runXml(child.nodeValue, baseProps({ family: ctx.defaultFamily }), ctx.rtl); }
        return;
      }
      if (child.nodeType !== 1) { return; }
      var tag = child.tagName;

      if (tag === 'HR') {
        flush();
        out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" ' +
          'w:color="999999"/></w:pBdr></w:pPr></w:p>');
      } else if (tag === 'TABLE') {
        flush();
        out.push(tableXml(child, ctx));
      } else if (tag === 'UL' || tag === 'OL') {
        flush();
        out.push(listXml(child, ctx));
      } else if (tag === 'BLOCKQUOTE') {
        flush();
        var qCtx = Object.assign({}, ctx, { indentTwips: (ctx.indentTwips || 0) + 576 });
        out.push(containerXml(child, qCtx));
      } else if (isBlock(child)) {
        flush();
        var rtl = dirOf(child, ctx.rtl);
        var pPr = pPrFor(child, {
          rtl: rtl, lineHeight: ctx.lineHeight, indentTwips: ctx.indentTwips
        });
        var hp = HEAD_HP[child.tagName];
        var runs = '';
        child.childNodes.forEach(function (n) {
          var props = baseProps({ family: ctx.defaultFamily });
          if (hp) { props.bold = true; props.sizePx = hp / 1.5; }
          runs += runsFor(n, props, rtl);
        });
        if (!runs) { runs = ''; }
        out.push(paragraphXml(runs, pPr));
      } else {
        buf += runsFor(child, baseProps({ family: ctx.defaultFamily }), ctx.rtl);
      }
    });
    flush();
    return out.join('') || EMPTY_P;
  }

  function listXml(list, ctx) {
    var ordered = list.tagName === 'OL';
    var start = ordered ? parseInt(list.getAttribute('start'), 10) || 1 : 1;
    var xml = '';
    var n = start - 1;
    Array.prototype.slice.call(list.children).forEach(function (li) {
      if (li.tagName !== 'LI') { return; }
      n++;
      var marker = ordered ? n + '.' : '•';
      var markerRun = runXml(marker + '\u00A0', baseProps({ family: ctx.defaultFamily }), ctx.rtl);
      var innerCtx = Object.assign({}, ctx, {
        indentTwips: (ctx.indentTwips || 0) + 360
      });
      /* First paragraph of the li carries the marker. */
      var firstDone = false;
      var bodyXml = '';

      Array.prototype.slice.call(li.childNodes).forEach(function (child) {
        var isList = child.nodeType === 1 && (child.tagName === 'UL' || child.tagName === 'OL');
        if (!firstDone && !isList && !(child.nodeType === 3 && !child.nodeValue.trim())) {
          var rtl = dirOf(li, ctx.rtl) || ctx.rtl;
          var pPr = pPrFor(li, { rtl: rtl, lineHeight: ctx.lineHeight,
            indentTwips: (ctx.indentTwips || 0) + 360 });
          var runs = markerRun + runsFor(child, baseProps({ family: ctx.defaultFamily }), rtl);
          bodyXml += paragraphXml(runs, pPr);
          firstDone = true;
          return;
        }
        if (!firstDone) { firstDone = true; bodyXml += paragraphXml(markerRun); }
        if (child.nodeType === 1) {
          if (isList) { bodyXml += listXml(child, innerCtx); }
          else if (child.tagName === 'TABLE') { bodyXml += tableXml(child, innerCtx); }
          else if (isBlock(child)) {
            var rtl2 = dirOf(child, innerCtx.rtl);
            bodyXml += paragraphXml(
              runsForContents(child, rtl2),
              pPrFor(child, { rtl: rtl2, lineHeight: ctx.lineHeight,
                indentTwips: innerCtx.indentTwips }));
          } else {
            bodyXml += paragraphXml(runsFor(child, baseProps({ family: ctx.defaultFamily }), ctx.rtl));
          }
        } else if (child.nodeType === 3 && child.nodeValue.trim()) {
          bodyXml += paragraphXml(runXml(child.nodeValue, baseProps({ family: ctx.defaultFamily }), ctx.rtl));
        }
      });
      if (!firstDone) { bodyXml = paragraphXml(markerRun); }
      xml += bodyXml;
    });
    return xml;
  }

  function runsForContents(el, rtl) {
    var out = '';
    el.childNodes.forEach(function (n) { out += runsFor(n, baseProps({ family: ctx.defaultFamily }), rtl); });
    return out;
  }

  function buildDocxBlob(doc) {
    var body = parse(doc.contentHtml);
    var ctx = {
      rtl: doc.dir === 'rtl',
      lineHeight: doc.lineHeight || 1.7,
      indentTwips: 0,
      defaultFamily: firstFamily(doc.fontFamily) || 'Calibri'
    };
    var content = containerXml(body, ctx);

    var sectPr =
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" ' +
      'w:header="708" w:footer="708" w:gutter="0"/>' +
      (ctx.rtl ? '<w:bidi/><w:rtlGutter/>' : '') +
      '</w:sectPr>';

    var documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + content + sectPr + '</w:body></w:document>';

    var contentTypes =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>';

    var rels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>';

    var enc = new TextEncoder();
    return zipStore([
      { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
      { name: '_rels/.rels', data: enc.encode(rels) },
      { name: 'word/document.xml', data: enc.encode(documentXml) }
    ]);
  }

  /* ============================ .csv ======================================= */

  function csvCell(value) {
    var s = String(value == null ? '' : value);
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function collectionCsv(docs) {
    var head = ['Title', 'Script', 'Direction', 'Starred', 'Words', 'Characters',
      'Created', 'Updated', 'Content'];
    var lines = [head.map(csvCell).join(',')];
    docs.forEach(function (d) {
      lines.push([
        d.title, d.script, d.dir, d.starred ? 'yes' : 'no',
        d.wordCount || 0, d.charCount || 0, d.createdAt, d.updatedAt,
        htmlToText(parse(d.contentHtml)).trim()
      ].map(csvCell).join(','));
    });
    return '\ufeff' + lines.join('\r\n') + '\r\n';
  }

  /* ============================ PDF (print) ================================ */

  function printDoc(doc) {
    var html = buildHtml(doc, true);
    var frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;inset-inline-start:-10000px;inline-size:0;block-size:0;border:0;';
    document.body.appendChild(frame);

    var settled = false;
    function cleanup() {
      setTimeout(function () { frame.remove(); }, 60000);
    }

    frame.addEventListener('load', function () {
      if (settled) { return; }
      settled = true;
      try {
        frame.contentWindow.document.title = doc.title || 'Notebook';
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } catch (e) {
        console.warn('[Notebook] Print failed.', e);
      }
      cleanup();
    }, { once: true });

    frame.srcdoc = html;
  }

  /* ============================ public API ================================= */

  global.NBExport = {
    txt: function (doc) {
      var text = htmlToText(parse(doc.contentHtml));
      download(baseName(doc) + '.txt',
        new Blob([text], { type: 'text/plain;charset=UTF-8' }));
    },
    htmlDoc: function (doc) {
      download(baseName(doc) + '.html',
        new Blob([buildHtml(doc, false)], { type: 'text/html;charset=UTF-8' }));
    },
    md: function (doc) {
      var md = '# ' + doc.title + '\n\n' + blocksMd(parse(doc.contentHtml), 0);
      download(baseName(doc) + '.md',
        new Blob([md], { type: 'text/markdown;charset=UTF-8' }));
    },
    docx: function (doc) {
      download(baseName(doc) + '.docx', buildDocxBlob(doc));
    },
    pdf: function (doc) { printDoc(doc); },
    csv: function (docs) {
      download('notebook-' + dateStamp() + '.csv',
        new Blob([collectionCsv(docs)], { type: 'text/csv;charset=UTF-8' }));
    },
    _internal: { htmlToText: htmlToText, blocksMd: blocksMd, buildDocxBlob: buildDocxBlob,
      collectionCsv: collectionCsv, zipStore: zipStore, buildHtml: buildHtml }
  };
})(window);
