/* ==========================================================================
   Fixed category taxonomy — 20 categories, ordered roughly basic -> complex
   and grouped into four learning tiers. IDs are stable: never rename an id,
   because stored words reference it. Labels may change freely.
   ========================================================================== */
(function (global) {
  'use strict';

  var TIERS = [
    { id: 'first-words', label: 'First words',        hint: 'Say something on day one.' },
    { id: 'people',      label: 'People & places',    hint: 'The world close to you.' },
    { id: 'world',       label: 'The wider world',    hint: 'Nouns you meet every day.' },
    { id: 'sentences',   label: 'Building sentences', hint: 'Glue words into real speech.' }
  ];

  /* hue drives each card's icon tint so the grid reads as one family
     while every category stays instantly recognisable. */
  var CATEGORIES = [
    { id: 'pronouns',   name: 'Pronouns',    icon: 'pronouns',   tier: 'first-words', hue: 168,
      blurb: 'I, you, we, they' },
    { id: 'greetings',  name: 'Greetings',   icon: 'greetings',  tier: 'first-words', hue: 42,
      blurb: 'Hello, thank you, goodbye' },
    { id: 'numbers',    name: 'Numbers',     icon: 'numbers',    tier: 'first-words', hue: 214,
      blurb: 'Counting and quantities' },
    { id: 'colors',     name: 'Colors',      icon: 'colors',     tier: 'first-words', hue: 292,
      blurb: 'Shades and tones' },
    { id: 'time',       name: 'Time & Days', icon: 'time',       tier: 'first-words', hue: 258,
      blurb: 'Days, months, hours' },

    { id: 'family',     name: 'Family',      icon: 'family',     tier: 'people', hue: 344,
      blurb: 'Parents, siblings, relatives' },
    { id: 'people',     name: 'People',      icon: 'people',     tier: 'people', hue: 20,
      blurb: 'Friends, neighbours, strangers' },
    { id: 'body',       name: 'Body',        icon: 'body',       tier: 'people', hue: 8,
      blurb: 'Head to toe' },
    { id: 'home',       name: 'Home',        icon: 'home',       tier: 'people', hue: 32,
      blurb: 'Rooms, furniture, objects' },
    { id: 'places',     name: 'Places',      icon: 'travel',     tier: 'people', hue: 190,
      blurb: 'City, travel, directions' },

    { id: 'food',       name: 'Food & Drink', icon: 'food',      tier: 'world', hue: 96,
      blurb: 'Meals, produce, cooking' },
    { id: 'animals',    name: 'Animals',      icon: 'animals',   tier: 'world', hue: 140,
      blurb: 'Pets, wildlife, birds' },
    { id: 'nature',     name: 'Nature',       icon: 'nature',    tier: 'world', hue: 118,
      blurb: 'Weather, plants, landscape' },
    { id: 'clothing',   name: 'Clothing',     icon: 'clothing',  tier: 'world', hue: 232,
      blurb: 'Garments and accessories' },
    { id: 'work',       name: 'Work & School', icon: 'work',     tier: 'world', hue: 202,
      blurb: 'Jobs, study, tools' },

    { id: 'verbs',      name: 'Verbs',        icon: 'verbs',       tier: 'sentences', hue: 174,
      blurb: 'Actions and states' },
    { id: 'adjectives', name: 'Adjectives',   icon: 'adjectives',  tier: 'sentences', hue: 48,
      blurb: 'Describing words' },
    { id: 'questions',  name: 'Questions',    icon: 'questions',   tier: 'sentences', hue: 268,
      blurb: 'Who, what, where, why' },
    { id: 'connectors', name: 'Connectors',   icon: 'connectors',  tier: 'sentences', hue: 224,
      blurb: 'And, but, because' },
    { id: 'phrases',    name: 'Phrases',      icon: 'phrases',     tier: 'sentences', hue: 320,
      blurb: 'Everyday expressions' }
  ];

  var byId = {};
  CATEGORIES.forEach(function (c, i) { c.order = i; byId[c.id] = c; });

  global.Categories = {
    all: CATEGORIES,
    tiers: TIERS,
    get: function (id) { return byId[id] || null; },
    exists: function (id) { return !!byId[id]; },
    byTier: function (tierId) {
      return CATEGORIES.filter(function (c) { return c.tier === tierId; });
    },
    /** Inline style hook: tints a card's icon well from the category hue.
        Quiet Authority tuning: heavy desaturation, deep foregrounds — the
        hues read as index tabs in a fine stationery set, not candy. */
    styleVars: function (cat, dark) {
      var h = cat.hue;
      return dark
        ? '--cat-fg:hsl(' + h + ' 45% 68%);--cat-bg:hsl(' + h + ' 20% 17%);' +
          '--cat-line:hsl(' + h + ' 18% 32%);--cat-glow:hsl(' + h + ' 40% 55% / .14)'
        : '--cat-fg:hsl(' + h + ' 52% 30%);--cat-bg:hsl(' + h + ' 38% 96%);' +
          '--cat-line:hsl(' + h + ' 30% 78%);--cat-glow:hsl(' + h + ' 45% 60% / .3)';
    }
  };
})(window);
