(function () {
  var pre = document.createElement('pre');
  pre.id = 'smoke-out';
  document.body.appendChild(pre);
  function out(s) { pre.textContent += s + '\n'; }
  function m(el, label) {
    if (!el) { out(label + ': MISSING'); return; }
    var r = el.getBoundingClientRect();
    out(label + ' x=' + r.x.toFixed(0) + ' w=' + r.width.toFixed(0) +
        ' right=' + r.right.toFixed(0) + ' scrollW=' + el.scrollWidth);
  }
  setTimeout(function () {
    location.hash = '#/account';
    setTimeout(function () {
      out('viewport=' + innerWidth);
      m(document.querySelector('.acct-grid'), 'grid');
      m(document.querySelectorAll('.acct-col')[0], 'col1');
      m(document.querySelectorAll('.acct-col')[1], 'col2');
      m(document.querySelector('.acct-col .card'), 'profileCard');
      m(document.querySelector('.acct-profile'), 'profileRow');
      m(document.querySelector('.acct-rows'), 'rows');
      var rows = document.querySelectorAll('.acct-row');
      rows.forEach(function (r, i) { m(r, 'row' + i); });
      var cols = getComputedStyle(document.querySelector('.acct-grid')).gridTemplateColumns;
      out('gridCols=' + cols);
      document.title = 'DBG-DONE';
    }, 150);
  }, 120);
})();