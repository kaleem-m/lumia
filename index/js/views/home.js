/* ==========================================================================
   Home — the category grid. Every card shows a large icon, the category
   name and a live "X learned" count that reads straight from the store.
   ========================================================================== */
(function (global) {
  'use strict';

  var esc = UI.esc;

  function cardHTML(cat, stat) {
    var empty = stat.total === 0;
    var pct = stat.total ? Math.round((stat.learned / stat.total) * 100) : 0;

    var meta = empty
      ? '<span>No words yet</span>'
      : '<span class="cat-card__count">' + stat.learned + ' learned</span>' +
        '<span class="cat-card__dot" aria-hidden="true"></span>' +
        '<span>' + stat.total + ' ' + UI.plural(stat.total, 'word') + '</span>';

    var label = empty
      ? cat.name + ', no words yet. Open to add some.'
      : cat.name + ', ' + stat.learned + ' of ' + stat.total + ' words learned.';

    return '' +
      '<a class="cat-card' + (empty ? ' cat-card--empty' : '') + '" ' +
         'href="#/category/' + cat.id + '" ' +
         'aria-label="' + esc(label) + '">' +
        '<span class="cat-card__icon" aria-hidden="true">' + Icon(cat.icon) + '</span>' +
        '<span class="cat-card__text">' +
          '<span class="cat-card__name">' + esc(cat.name) + '</span>' +
          '<span class="cat-card__meta">' + meta + '</span>' +
        '</span>' +
        (empty ? '' :
          '<span class="bar cat-card__bar" role="presentation">' +
            '<span class="bar__fill" style="inline-size:' + pct + '%"></span>' +
          '</span>') +
      '</a>';
  }

  function heroHTML(totals, lang) {
    var hasWords = totals.words > 0;

    if (!hasWords) {
      return '' +
        '<section class="hero" id="hero">' +
          '<div class="hero__greet">' +
            '<span class="eyebrow">' + esc(UI.greeting()) + '</span>' +
            '<h1>' + (lang
              ? 'Your ' + esc(lang.name) + ' notebook is ready.'
              : 'A notebook that starts completely empty.') + '</h1>' +
            '<p>Lexio ships with no vocabulary on purpose — you add the words that matter to ' +
            'you, one category at a time. Pick a category below, or set up your language first.</p>' +
          '</div>' +
          '<div class="hero__cta">' +
            '<a class="btn btn--primary" href="#/manage">' + Icon('plus') + 'Add your first words</a>' +
            (lang ? '' : '<button type="button" class="btn" id="hero-lang">' + Icon('globe') + 'Choose a language</button>') +
          '</div>' +
        '</section>';
    }

    return '' +
      '<section class="hero" id="hero">' +
        '<div class="hero__greet">' +
          '<span class="eyebrow">' + esc(UI.greeting()) + '</span>' +
          '<h1>' + totals.learned + ' of ' + totals.words + ' words are sticking.</h1>' +
          '<p>Ten focused minutes is plenty. Pick up where you left off, or browse a category.</p>' +
        '</div>' +
        '<div class="hero__stats">' +
          '<span class="stat-pill">' + Icon('cards') + '<b>' + totals.words + '</b><span>' + UI.plural(totals.words, 'word') + '</span></span>' +
          '<span class="stat-pill">' + Icon('check') + '<b>' + totals.learned + '</b><span>learned</span></span>' +
          '<span class="stat-pill">' + Icon('flame') + '<b>' + totals.streak + '</b><span>day streak</span></span>' +
        '</div>' +
        '<div class="hero__cta">' +
          '<a class="btn btn--primary" href="#/learn">' + Icon('sparkle') + 'Start a session</a>' +
        '</div>' +
      '</section>';
  }

  function render(root) {
    var stats = Store.allCategoryStats();
    var totals = Store.totals();
    var lang = Store.activeLanguage();

    var html = heroHTML(totals, lang);

    Categories.tiers.forEach(function (tier) {
      var cats = Categories.byTier(tier.id);
      html += '' +
        '<div class="tier">' +
          '<span class="tier__label">' + esc(tier.label) + '</span>' +
          '<span class="tier__rule" aria-hidden="true"></span>' +
        '</div>' +
        '<section class="cat-grid" aria-label="' + esc(tier.label) + ' categories">' +
          cats.map(function (c) { return cardHTML(c, stats[c.id]); }).join('') +
        '</section>';
    });

    root.innerHTML = html;

    var langBtn = document.getElementById('hero-lang');
    if (langBtn) {
      langBtn.addEventListener('click', function () { global.App.openLanguageSheet(); });
    }
  }

  global.Views = global.Views || {};
  global.Views.home = render;
})(window);
