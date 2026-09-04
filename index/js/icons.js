/* ==========================================================================
   Lexio icon set — hand-written inline SVGs, one consistent family:
   24x24 grid, 1.6 stroke, round caps/joins, currentColor.
   Kept inline (no icon-font, no network request) so icons paint instantly.
   ========================================================================== */
(function (global) {
  'use strict';

  var OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true" focusable="false">';

  var P = {
    /* ---- Category icons ------------------------------------------------ */
    pronouns:  '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/>' +
               '<path d="M17 6.5h4M17 10h4M17 13.5h2.5"/>',
    greetings: '<path d="M12 21c-4.5 0-8-3.1-8-7.3C4 9.4 7.6 6 12 6s8 3.4 8 7.7c0 1.6-.5 3-1.4 4.2"/>' +
               '<path d="M18.6 17.9 20 21l-3.4-.9"/><path d="M9 13h.01M12 13h.01M15 13h.01"/>' +
               '<path d="M12 6V3"/><circle cx="12" cy="2.5" r="1"/>',
    numbers:   '<path d="M9 4 7 20M17 4l-2 16"/><path d="M4 9h16M3 15h16"/>',
    colors:    '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-1 .8-1.8 1.8-1.8H16a5 5 0 0 0 5-5c0-3.9-4-7-9-7Z"/>' +
               '<circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none"/>' +
               '<circle cx="11" cy="7.5" r="1.1" fill="currentColor" stroke="none"/>' +
               '<circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none"/>',
    time:      '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>' +
               '<circle cx="12" cy="15.5" r="2.6"/><path d="M12 14.2v1.4l1 .7"/>',

    family:    '<circle cx="7.5" cy="7" r="2.6"/><circle cx="16.5" cy="7" r="2.6"/>' +
               '<path d="M3 18.5a4.5 4.5 0 0 1 9 0"/><path d="M12 18.5a4.5 4.5 0 0 1 9 0"/>' +
               '<circle cx="12" cy="14.5" r="1.9"/><path d="M8.6 21a3.5 3.5 0 0 1 6.8 0"/>',
    people:    '<circle cx="12" cy="7" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>' +
               '<path d="M18.5 9.5a2.6 2.6 0 0 0 2.2-3.9M3.3 5.6A2.6 2.6 0 0 0 5.5 9.5"/>',
    body:      '<circle cx="12" cy="4.2" r="2.2"/><path d="M12 6.4v7"/><path d="M6 9.2 12 8l6 1.2"/>' +
               '<path d="m12 13.4-2.6 7M12 13.4l2.6 7"/>',
    home:      '<path d="M3.6 10.4 12 3.5l8.4 6.9"/><path d="M5.5 12v7.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V12"/>' +
               '<path d="M9.8 21v-5.2h4.4V21"/>',
    travel:    '<path d="M12 21s7-5.8 7-11a7 7 0 1 0-14 0c0 5.2 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',

    food:      '<path d="M5 3v6.5a2.5 2.5 0 0 0 5 0V3"/><path d="M7.5 3v18"/>' +
               '<path d="M17.5 21v-7"/><path d="M17.5 14c2 0 3-1.6 3-5.2 0-3.1-1.2-5.3-3-5.3s-3 2.2-3 5.3c0 3.6 1 5.2 3 5.2Z"/>',
    animals:   '<path d="M4.5 5.5 6 10"/><path d="M19.5 5.5 18 10"/>' +
               '<path d="M12 20c-3.6 0-6.2-2.5-6.2-6C5.8 10.6 8.5 8 12 8s6.2 2.6 6.2 6c0 3.5-2.6 6-6.2 6Z"/>' +
               '<path d="M10 14h.01M14 14h.01"/><path d="M12 16.4v1.2"/>' +
               '<path d="M4.5 5.5c-.9 1.6-.6 3.4.6 4.3M19.5 5.5c.9 1.6.6 3.4-.6 4.3"/>',
    nature:    '<path d="M12 3c2.6 2.4 4 4.9 4 7.4 0 3-1.8 5.1-4 5.1s-4-2.1-4-5.1C8 7.9 9.4 5.4 12 3Z"/>' +
               '<path d="M12 21v-5.5"/><path d="M6.5 12.5c-1.3.7-2 1.8-2 3.2 0 2 1.5 3.3 3.6 3.3"/>' +
               '<path d="M17.5 12.5c1.3.7 2 1.8 2 3.2 0 2-1.5 3.3-3.6 3.3"/>',
    clothing:  '<path d="M9 3.5 12 6l3-2.5 4.5 2.4-1.8 4.3-2.2-.7V20a1 1 0 0 1-1 1H9.5a1 1 0 0 1-1-1V9.5l-2.2.7L4.5 5.9 9 3.5Z"/>',
    work:      '<path d="M3.5 8.5h17a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18v-8a1.5 1.5 0 0 1 1.5-1.5Z"/>' +
               '<path d="M9 8.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2.5"/><path d="M2 13h20"/>',

    verbs:     '<path d="M4 12h11"/><path d="m11.5 7.5 4.5 4.5-4.5 4.5"/>' +
               '<path d="M19.5 5v14"/>',
    adjectives:'<path d="m12 3 2.5 5.6 6.1.7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.3l6.1-.7L12 3Z"/>',
    questions: '<path d="M9.2 9a2.9 2.9 0 1 1 3.8 2.8c-.7.3-1 .9-1 1.6v.6"/>' +
               '<path d="M12 17.6h.01"/><circle cx="12" cy="12" r="9"/>',
    connectors:'<path d="M9.5 14.5a4.2 4.2 0 0 1 0-5.9l2.6-2.6a4.2 4.2 0 0 1 5.9 5.9l-1.1 1.1"/>' +
               '<path d="M14.5 9.5a4.2 4.2 0 0 1 0 5.9l-2.6 2.6a4.2 4.2 0 0 1-5.9-5.9l1.1-1.1"/>',
    phrases:   '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.6 3.6a.6.6 0 0 1-1-.5V16h-.4"/>' +
               '<path d="M8 8.5h8M8 12h5"/>',

    /* ---- Navigation & UI ----------------------------------------------- */
    home_nav:  '<path d="M3.6 10.4 12 3.5l8.4 6.9"/><path d="M5.5 12v7.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V12"/>',
    learn:     '<path d="M12 7.2 4 4.8v12l8 2.4 8-2.4v-12L12 7.2Z"/><path d="M12 7.2v12"/>',
    review:    '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    manage:    '<path d="M4 7h10M18.5 7H20M4 17h2.5M10.5 17H20M4 12h6M14 12h6"/>' +
               '<circle cx="16" cy="7" r="2.2"/><circle cx="8.5" cy="17" r="2.2"/><circle cx="12" cy="12" r="2.2"/>',

    sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/>',
    moon:      '<path d="M20 14.4A8.5 8.5 0 0 1 9.6 4 8.5 8.5 0 1 0 20 14.4Z"/>',
    globe:     '<circle cx="12" cy="12" r="9"/><path d="M3.2 9.5h17.6M3.2 14.5h17.6"/>' +
               '<path d="M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z"/>',
    plus:      '<path d="M12 5v14M5 12h14"/>',
    minus:     '<path d="M5 12h14"/>',
    sparkle:   '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/><path d="M18.5 15.5 19.3 18l2.2.8-2.2.8-.8 2.4-.8-2.4-2.2-.8 2.2-.8.8-2.5Z"/>',
    seed:      '<path d="M12 21v-6.5"/><path d="M12 14.5c0-4 2.6-7.5 7-8.5.6 4.6-2.2 8.5-7 8.5Z"/>' +
               '<path d="M12 16.5C7.6 16.5 5 13.2 5.4 9c3.6.7 6 3.2 6.6 6"/>',
    check:     '<path d="m4.5 12.5 5 5 10-11"/>',
    chevron:   '<path d="m9 5 7 7-7 7"/>',
    back:      '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
    download:  '<path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/>',
    upload:    '<path d="M12 15.5v-11"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4.5 19.5h15"/>',
    shield:    '<path d="M12 21c4.5-1.8 7-5.2 7-9.6V5.8L12 3 5 5.8v5.6c0 4.4 2.5 7.8 7 9.6Z"/><path d="m9 11.8 2.2 2.2L15 10"/>',
    info:      '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
    warning:   '<path d="M12 4.5 21 19.5H3L12 4.5Z"/><path d="M12 10v4M12 17h.01"/>',
    lock:      '<rect x="4.5" y="10" width="15" height="10.5" rx="2.5"/><path d="M8 10V7.5a4 4 0 1 1 8 0V10"/>',
    cards:     '<rect x="3" y="6.5" width="13" height="13" rx="2.5"/><path d="M7 3.5h11a2.5 2.5 0 0 1 2.5 2.5v10"/>',
    quiz:      '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 9h5M8 13h8M8 17h4"/>',
    game:      '<path d="M7.5 8h9a5 5 0 0 1 5 5.2c-.1 2.6-1.6 4.3-3.6 4.3-1.3 0-2.1-.7-3.2-1.6-.7-.6-1.3-.9-2.7-.9s-2 .3-2.7.9c-1.1.9-1.9 1.6-3.2 1.6-2 0-3.5-1.7-3.6-4.3A5 5 0 0 1 7.5 8Z"/>' +
               '<path d="M8.5 11v2.5M7.25 12.25h2.5M15.5 11.5h.01M17.5 13.5h.01"/>',
    memory:    '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/>' +
               '<rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>' +
               '<path d="m6 7 1 1 2-2M16 7h2M6 17h2M16 17l1 1 2-2"/>',
    flame:     '<path d="M12 21c3.3 0 6-2.4 6-5.6 0-4-3-5.4-3-9.4-2 1-3 2.6-3 4.6-1.2-.6-1.8-1.6-1.8-3C8.4 8.6 6 11 6 15.4 6 18.6 8.7 21 12 21Z"/>',
    trash:     '<path d="M4.5 6.5h15"/><path d="M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7"/>' +
               '<path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5"/>',
    edit:      '<path d="m4 20 4.2-1 10.6-10.6a2.4 2.4 0 0 0-3.4-3.4L4.8 15.6 4 20Z"/>' +
               '<path d="m14 6.4 3.4 3.4M8.2 19l-3.4-3.4"/>',
    search:    '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.3 15.3 4.7 4.7"/>',
    close:     '<path d="M6 6 18 18M18 6 6 18"/>',
    inbox:     '<path d="M3.5 13.5h4l1.5 3h6l1.5-3h4"/>' +
               '<path d="M5.6 5.2 3.5 13.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5v-4.5l-2.1-8.3A1.5 1.5 0 0 0 16.9 4H7.1a1.5 1.5 0 0 0-1.5 1.2Z"/>',

    /* ---- Learn sessions -------------------------------------------------- */
    flip:      '<path d="M4.4 9a8 8 0 0 1 13.9-2.6L20 8.5"/><path d="M20 3.5v5h-5"/>' +
               '<path d="M19.6 15a8 8 0 0 1-13.9 2.6L4 15.5"/><path d="M4 20.5v-5h5"/>',
    timer:     '<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10"/><path d="M10 3h4"/><path d="M12 3v2"/>' +
               '<path d="M18.5 6.5 17 8"/>',
    trophy:    '<path d="M8 4h8v5.5a4 4 0 0 1-8 0Z"/><path d="M8 5.5H5A3 3 0 0 0 8 9.5"/>' +
               '<path d="M16 5.5h3a3 3 0 0 1-3 4"/><path d="M12 13.5v3"/><path d="M8.5 20.5h7"/><path d="M12 16.5c-1.8 0-2.6 1.4-2.8 4h5.6c-.2-2.6-1-4-2.8-4Z"/>',
    replay:    '<path d="M4 5v5.5h5.5"/><path d="M4.9 13.5a7.5 7.5 0 1 0 1.6-7.2L4 8.6"/>',

    /* ---- Notebook -------------------------------------------------------- */
    notebook:  '<path d="M6.5 3.5h11A1.5 1.5 0 0 1 19 5v14a1.5 1.5 0 0 1-1.5 1.5h-11"/>' +
               '<path d="M6.5 3.5A1.5 1.5 0 0 0 5 5v14a1.5 1.5 0 0 0 1.5 1.5"/>' +
               '<path d="M6.5 3.5v17"/><path d="M9 8h6M9 12h6M9 16h3.5"/>',
    doc:       '<path d="M6 3.5h8L19 8.5V20.5H6z" transform="translate(-0.5 0)"/>' +
               '<path d="M13.5 3.5v5h5"/><path d="M9 12h6M9 15.5h6M9 19h3.5"/>',
    bold:      '<path d="M7 4h6.2a3.8 3.8 0 0 1 0 7.6H7z"/><path d="M7 11.6h7.2a4.2 4.2 0 0 1 0 8.4H7z"/>',
    italic:    '<path d="M10 4h8M6 20h8M14.5 4 9.5 20"/>',
    underline: '<path d="M7 4v6a5 5 0 0 0 10 0V4"/><path d="M5 20.5h14"/>',
    strike:    '<path d="M7.5 5C8 3.9 9.7 3.2 12 3.2c2.6 0 4.3 1 4.3 2.6 0 1-.5 1.7-1.5 2.2"/>' +
               '<path d="M16.5 17.5c-.7 2-2.4 3.3-4.7 3.3-2.8 0-4.6-1.4-4.6-3.3 0-1 .4-1.9 1.2-2.5"/>' +
               '<path d="M4 11.5h16"/>',
    sup:       '<path d="m4 20 5-13 5 13"/><path d="m5.9 15.5h6.2"/><path d="M18 4v6M15.5 6.5h5"/>',
    sub:       '<path d="m4 16 5-12 5 12"/><path d="m5.9 11.5h6.2"/><path d="M18 14v6M15.5 17.5h5"/>',
    textcolor: '<path d="m6 16 4.5-11h3L18 16"/><path d="m8 11.5h8"/>' +
               '<path d="M8.5 19.5c1 .9 2.2 1.3 3.5 1.3s2.5-.4 3.5-1.3"/>',
    highlight: '<path d="m9.5 15.5-4-4 8-8a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3z"/>' +
               '<path d="m5.5 11.5 4 4"/>' +
               '<path d="M4.5 15.5h6l-1.5 5h-6z"/>',
    clearfmt:  '<path d="m5.5 13.5 6-6 6 6"/><path d="m8.5 10.5-4 4a1.4 1.4 0 0 0 1 2.4h9"/>' +
               '<path d="m14 14.5 5 5M19 14.5l-5 5"/>',
    alignleft: '<path d="M4 5.5h16M4 10h10M4 14.5h16M4 19h10"/>',
    aligncenter:'<path d="M4 5.5h16M7 10h10M4 14.5h16M7 19h10"/>',
    alignright:'<path d="M4 5.5h16M10 10h10M4 14.5h16M10 19h10"/>',
    justify:   '<path d="M4 5.5h16M4 10h16M4 14.5h16M4 19h16"/>',
    listul:    '<path d="M9 6h11M9 12h11M9 18h11"/>' +
               '<circle cx="5" cy="6" r="1.1" fill="currentColor" stroke="none"/>' +
               '<circle cx="5" cy="12" r="1.1" fill="currentColor" stroke="none"/>' +
               '<circle cx="5" cy="18" r="1.1" fill="currentColor" stroke="none"/>',
    listol:    '<path d="M10 6h10M10 12h10M10 18h10"/>' +
               '<path d="M4 4.5 5.5 4v4M4 10.8h2.4l-2.4 3h2.4"/>' +
               '<path d="M4 16.5h2.2a1.1 1.1 0 0 1 0 2.2H5.4a1.1 1.1 0 0 1 0 2.2H4"/>',
    indent:    '<path d="M10 6h10M10 12h10M10 18h10"/>' +
               '<path d="M3 9.5 6.5 12 3 14.5z" fill="currentColor" stroke="none"/>' +
               '<path d="M3 5.5h5M3 18.5h5"/>',
    outdent:   '<path d="M10 6h10M10 12h10M10 18h10"/>' +
               '<path d="m6.5 9.5-3.5 2.5 3.5 2.5z" fill="currentColor" stroke="none"/>' +
               '<path d="M3 5.5h5M3 18.5h5"/>',
    undo:      '<path d="M4.5 8.5h9.5a5 5 0 0 1 0 10H8"/><path d="m8 4.5-3.5 4L8 12.5"/>',
    redo:      '<path d="M19.5 8.5H10a5 5 0 0 0 0 10h6"/><path d="m16 4.5 3.5 4L16 12.5"/>',
    heading:   '<path d="M5 4.5v15M19 4.5v15M5 12h14"/>',
    textsize:  '<path d="m4 18 5-12 5 12"/><path d="m5.8 14h6.4"/><path d="M15 8.5h6M18 8.5V20"/>',
    linedist:  '<path d="M6 5.5h12M6 18.5h12"/>' +
               '<path d="m9 9 3-2.5L15 9M9 15l3 2.5L15 15"/>',
    table:     '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.2 4.5v15M14.8 4.5v15"/>',
    more:      '<circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none"/>' +
               '<circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>' +
               '<circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
    chevron_down: '<path d="m6 9.5 6 6 6-6"/>',
    star:      '<path d="m12 3.5 2.5 5.4 5.9.7-4.4 4 1.2 5.9L12 16.6l-5.2 2.9 1.2-5.9-4.4-4 5.9-.7z"/>',
    star_fill: '<path d="m12 3.5 2.5 5.4 5.9.7-4.4 4 1.2 5.9L12 16.6l-5.2 2.9 1.2-5.9-4.4-4 5.9-.7z" fill="currentColor"/>',
    copy:      '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5v-3a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
    cut:       '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/>' +
               '<path d="m8.2 8.2 11.3 7.3M8.2 15.8 19.5 8.5"/>',
    select_all:'<path d="M8 4H4v4M16 4h4v4M20 16v4h-4M8 20H4v-4"/>' +
               '<rect x="8" y="8" width="8" height="8" rx="1"/>',
    size_up:   '<path d="m4 18 5-12 5 12M5.8 14h6.4M17 7h5M19.5 4.5v5"/>',
    size_down: '<path d="m4 18 5-12 5 12M5.8 14h6.4M17 7h5"/>',
    printer:   '<path d="M7 8V3.5h10V8"/><rect x="3.5" y="8" width="17" height="8.5" rx="2"/><path d="M7 13.5h10v7H7z"/>',
    cloud:     '<path d="M7 18.5a4.5 4.5 0 0 1-.4-9A5.5 5.5 0 0 1 17 8.3a4 4 0 0 1 .3 8Z"/>' +
               '<path d="m9.8 13.2 2.2 2.2 3.7-4.4"/>',
    cloud_off: '<path d="M7 18.5a4.5 4.5 0 0 1-.4-9A5.5 5.5 0 0 1 17 8.3a4 4 0 0 1 .3 8Z"/>' +
               '<path d="M4 4l16 16"/>',
    dir_ltr:   '<path d="M4 6h13M4 6l3-3M4 6l3 3" transform="translate(0 6)"/>' +
               '<path d="M17 5.5h3M17 12h3M17 18.5h3"/>',
    dir_rtl:   '<path d="M20 6H7M20 6l-3-3M20 6l-3 3" transform="translate(0 6)"/>' +
               '<path d="M4 5.5h3M4 12h3M4 18.5h3"/>',
    dir_auto:  '<path d="M4.5 18a7.5 7.5 0 1 1 2.2 3.2"/><path d="M4.5 21.5v-3.7h3.7"/>' +
               '<path d="m10 15.5 2-6.5 2 6.5M10.7 13.5h2.6"/>',
    find_next: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.3 15.3 4.7 4.7"/><path d="M8 10.5h5M10.5 8v5"/>'
  };

  /**
   * Return an SVG string for the given icon name.
   * @param {string} name  key in the icon table
   * @param {object} [opt] {size, cls}
   */
  function icon(name, opt) {
    var body = P[name];
    if (!body) { body = P.info; }
    opt = opt || {};
    var attrs = '';
    if (opt.size) { attrs += ' width="' + opt.size + '" height="' + opt.size + '"'; }
    if (opt.cls) { attrs += ' class="' + opt.cls + '"'; }
    return OPEN.replace('<svg', '<svg' + attrs) + body + '</svg>';
  }

  icon.has = function (name) { return Object.prototype.hasOwnProperty.call(P, name); };
  icon.names = function () { return Object.keys(P); };

  global.Icon = icon;
})(window);
