/* ==========================================================================
   Category detail — a calm, read-only vocabulary browser. Editing stays in
   the deliberately separate Manage Words workspace. Cards render through
   the shared WordDisplay pair layout.
   ========================================================================== */
(function (global) {
  'use strict';

  var esc = UI.esc;
  var queries = {};

  function wordCard(word, language, index) {
    /* Stagger capped ~240ms total per the motion spec. */
    var delay = 40 + Math.min(index, 8) * 24;
    return '<article class="browse-word" role="listitem" style="--word-delay:' + delay + 'ms">' +
      WordDisplay.pairHTML(word, language) +
    '</article>';
  }
  function resultsHTML(cat, language, query) {
    var words = Store.words({ categoryId: cat.id, query: query });
    words.sort(function (a, b) {
      return a.term.localeCompare(b.term, (language && language.code) || undefined, { sensitivity: 'base' });
    });

    if (!words.length && query) {
      return '<div class="browse-no-results">' + Icon('search') +
        '<strong>No words match “' + esc(query) + '”</strong>' +
        '<p>Try a shorter search, or look for the meaning instead.</p>' +
        '<button type="button" class="btn btn--sm" data-act="clear-category-search">Clear search</button>' +
      '</div>';
    }

    return '<div class="browse-grid" role="list" aria-label="' + esc(cat.name) + ' words">' +
      words.map(function (word, index) { return wordCard(word, language, index); }).join('') +
    '</div>';
  }

  function render(root, params) {
    var cat = Categories.get(params.id);
    if (!cat) { Router.go('/home', true); return; }

    var dark = document.documentElement.dataset.theme === 'dark';
    var stat = Store.categoryStats(cat.id);
    var lang = Store.activeLanguage();
    var query = queries[cat.id] || '';
    var countLabel = stat.total + ' ' + UI.plural(stat.total, 'word');

    var head = '<header class="page-head cat-head" style="' + Categories.styleVars(cat, dark) + '">' +
      '<a class="btn btn--ghost btn--sm cat-head__back" href="#/home">' +
        '<span class="flip-rtl">' + Icon('back') + '</span> All categories</a>' +
      '<div class="cat-head__row">' +
        '<span class="cat-head__icon" aria-hidden="true">' + Icon(cat.icon) + '</span>' +
        '<div class="cat-head__copy">' +
          '<span class="eyebrow">' + esc(countLabel) + '</span>' +
          '<h1>' + esc(cat.name) + '</h1>' +
          '<p>' + esc(cat.blurb) + (lang ? ' · ' + esc(lang.name) : '') + '</p>' +
        '</div>' +
      '</div>' +
    '</header>';

    var body;
    if (stat.total === 0) {
      body = UI.emptyState({
        icon: cat.icon,
        title: 'Nothing in ' + cat.name + ' yet',
        body: 'This category is waiting for your words. Add them in Manage Words — you can type them one by one or paste a whole list at once.',
        actions:
          '<a class="btn btn--primary" href="#/manage/category/' + cat.id + '">' + Icon('plus') + 'Add words here</a>' +
          '<a class="btn" href="#/home">Browse other categories</a>'
      });
    } else {
      body =         '<section class="browse" aria-labelledby="browse-title"' +
          ' style="' + Categories.styleVars(cat, dark) + '">' +
          '<div class="browse-tools">' +
            '<div class="browse-tools__copy"><h2 id="browse-title">Your ' + esc(cat.name.toLowerCase()) + '</h2>' +
              '<p id="category-result-count">' + esc(countLabel) + ' in this collection</p></div>' +
            '<label class="search-box browse-search">' +
              '<span aria-hidden="true">' + Icon('search') + '</span>' +
              '<span class="sr-only">Search within ' + esc(cat.name) + '</span>' +
              '<input id="category-search" type="search" value="' + esc(query) + '" ' +
                'placeholder="Search words or meanings…" autocomplete="off">' +
            '</label>' +
          '</div>' +
          '<div class="browse-actions">' +
            '<a class="btn btn--sm" href="#/learn/play/flashcards/category/' + cat.id + '">' +
              Icon('sparkle') + 'Practise these words</a>' +
          '</div>' +
          '<div id="category-results" aria-live="polite">' + resultsHTML(cat, lang, query) + '</div>' +
        '</section>' +
      '<aside class="manage-callout" aria-label="Manage this category">' +
        '<span class="manage-callout__icon" aria-hidden="true">' + Icon('manage') + '</span>' +
        '<div><strong>Want to change this collection?</strong>' +
          '<p>Adding, editing, and deleting stay safely inside Manage Words.</p></div>' +
        '<a class="btn btn--sm" href="#/manage/category/' + cat.id + '">Manage ' + esc(cat.name) +
          '<span class="flip-rtl">' + Icon('chevron') + '</span></a>' +
      '</aside>';
    }

    root.innerHTML = '<div class="category-page">' + head + body + '</div>';

    var search = UI.$('#category-search', root);
    if (search) {
      search.addEventListener('input', function () {
        queries[cat.id] = search.value.trim();
        updateResults(root, cat, lang, queries[cat.id]);
      });
    }
    root.addEventListener('click', function (event) {
      var clear = event.target.closest('[data-act="clear-category-search"]');
      if (!clear) { return; }
      queries[cat.id] = '';
      search.value = '';
      search.focus();
      updateResults(root, cat, lang, '');
    });
  }

  function updateResults(root, cat, language, query) {
    var result = UI.$('#category-results', root);
    var count = UI.$('#category-result-count', root);
    if (!result) { return; }
    var matches = Store.words({ categoryId: cat.id, query: query }).length;
    result.innerHTML = resultsHTML(cat, language, query);
    if (count) {
      count.textContent = query
        ? matches + ' ' + UI.plural(matches, 'match') + ' for “' + query + '”'
        : matches + ' ' + UI.plural(matches, 'word') + ' in this collection';
    }
  }

  global.Views = global.Views || {};
  global.Views.category = render;
})(window);
