# Lexio

A calm, private place to build your own vocabulary — in any language, including
right-to-left ones.

Lexio lets you add every word yourself and sort it into 20 fixed categories, ordered
roughly basic → complex. Signed-in users get a private Supabase-backed vocabulary that
syncs across devices. Guest mode remains available with local browser storage and JSON
export/import for backup and portability.

- **Stack:** vanilla HTML / CSS / JS with the Supabase JavaScript client loaded from a CDN.
- **Hosting:** any static host (GitHub Pages, Cloudflare Pages). Routing is hash-based,
  so it works from a subdirectory with no server rewrite rules.
- **Storage:** private Supabase tables for authenticated users; `localStorage` under a
  single versioned key (`lexio.v1`) for guest data and a responsive signed-in cache.
- **Authentication:** Google OAuth and email/password through Supabase Auth.

---

## Status: Phase 5 complete

Phase 5 surfaces everything Phase 4 records: a Review dashboard with overview tiles,
mastery per category, the six-box distribution chart, a fourteen-day practice strip,
a transparent "needs another look" list, and full session history. Phases 1–4 (design
system, data layer, Manage Words, category browsing, Learn mode) remain intact.

### Completed

**1. Project structure**
```
index.html                 app shell
css/tokens.css             design tokens (color, type, space, motion, elevation)
css/base.css               reset + logical-property base + RTL rules
css/components.css         buttons, chips, cards, fields, modals, toasts, empty states
css/app.css                app shell + views (mobile-first, desktop at >=900px)
js/icons.js                inline SVG icon set (one consistent 24px family)
js/categories.js           the 20-category taxonomy + tiers
js/store.js                local cache, CRUD, counts, export/import, remote adapter
js/scheduler.js            Leitner boxes, selection weights, deck builder (Phase 4)
js/word-display.js         shared entry renderer: translit + native pair layout
js/activities/registry.js  activity plugin registry + shared session utils
js/activities/flashcards.js  flip-card activity
js/activities/quiz.js        multiple-choice activity
js/activities/match.js       match-up game
js/cloud.js               Supabase Auth, hydration, and queued private-data sync
js/supabase-config.js     public project URL + publishable browser key
js/ui.js                  DOM helpers, escaping, toasts, modal sheets
js/router.js              hash router (+ per-view teardown hooks)
js/app.js                 bootstrap: nav, theme, language sheet
js/views/*.js             home, category, learn (hub/session/summary), review, manage,
                          notebook
js/notebook/scripts.js    writing-system registry + lazy Noto font loading
js/notebook/sanitize.js   whitelist HTML sanitizer (XSS defence for note content)
js/notebook/storage.js    IndexedDB/localStorage guest store + Supabase adapter
js/notebook/exporters.js  txt / html / md / docx / pdf(print) / csv exporters
assets/favicon.svg
```

**2. Design system** — warm paper + deep evergreen, not clinical edtech.
- Full token layer: two accent ramps (evergreen for browsing, **clay for Manage mode**),
  4pt spacing scale, radii, five elevation levels, motion curves.
- Light **and** dark theme, applied before first paint so there is no flash. Follows the
  system preference until the user overrides it.
- Typography: Fraunces (display) + Inter (UI), with a script-tolerant fallback stack for
  word content.
- Snappy by construction: transitions are 120–320ms on transform/opacity, icons are
  inline SVG (zero network requests), and the whole app is ~40KB of unminified JS.
- Full `prefers-reduced-motion` support.

**3. Navigation** — native to each form factor.
- **Mobile:** fixed bottom tab bar, safe-area aware, with an active indicator.
- **Desktop (≥900px):** sticky left sidebar with brand, labelled links, a live word
  counter and an account/guest privacy note.
- Manage Words is visually separated in both (a divider before it, and it turns the
  clay accent when active) so it never blends into browsing.

**4. Home** — responsive category grid.
- 20 cards grouped into four tiers: First words → People & places → The wider world →
  Building sentences.
- Each card has a large icon in a hue-tinted well unique to that category, the name, and
  a **live count** wired to the store: `X learned · Y words`, plus a progress bar once
  the category has content. Reads `0`/"No words yet" while empty.
- A hero that adapts: an invitation to start while empty, live stats once populated.

**5. RTL readiness** — built in, not retrofitted.
- Every layout rule uses **CSS logical properties** (`inline-size`, `margin-inline`,
  `inset-inline-start`, `border-start-start-radius`…). No physical `left`/`right` in
  layout code, so `dir="rtl"` mirrors the entire UI.
- Word content carries `dir="auto"` with `unicode-bidi: isolate`, so an Arabic or Hebrew
  entry renders correctly inside an otherwise LTR interface, per word.
- Languages store their own direction (`ltr` / `rtl` / `auto`).
- Directional icons carry `.flip-rtl`; the progress-bar gradient flips too.
- Verified by rendering the real app under `dir="rtl"` with seeded Arabic content.

**6. Empty states** — treated as primary screens, since every category starts empty.
Home, each category, Learn, Review and Manage each have a purpose-written empty state
with its own illustration well, explanatory copy and a next-step action.

**Also working already:** Google and email/password authentication, optional guest mode,
private cloud vocabulary sync, language setup (name + direction), JSON export, JSON import
(merge or replace), erase-all with confirmation, multi-tab sync, and a warning if the
browser blocks local storage.

### Routes

| URI | Description |
|---|---|
| `#/home` | Category grid (default; `#/` redirects here) |
| `#/category/:id` | One category. `:id` is a fixed category id, e.g. `#/category/colors` |
| `#/learn` | Learn hub — activity cards, scope chips, gate until 4+ words |
| `#/learn/play/:mode` | Run an activity over the whole active language, e.g. `#/learn/play/quiz` |
| `#/learn/play/:mode/category/:categoryId` | Run an activity scoped to one category |
| `#/review` | Review — overview, mastery by category, box chart, 14-day strip, needs-work, history |
| `#/notebook` | Notebook — multilingual rich-text writing workspace (opens most recent note) |
| `#/notebook/:id` | Notebook with a specific document open |
| `#/account` | My Account — profile, learning overview, preferences, BYOK-AI, security, data |
| `#/manage` | Manage Words — languages, backup, restore, erase |
| `#/manage/category/:id` | Manage Words pre-scoped to one category |

Activity ids (registry): `flashcards`, `quiz`, `type-it`, `match`, `memory`.

### The Notebook

A Word-style writing environment for practising any script — a new main
section next to Home / Learn / Review / Manage.

- **Editor.** contenteditable + the platform's execCommand engine: bold,
  italic, underline, strikethrough, super/subscript, text colour, highlight,
  clear formatting, H1–H3/quote blocks, alignment (incl. justify), ordered and
  bulleted lists, indent/outdent, line spacing, font size ladder with
  increase/decrease, undo/redo, select all, cut/copy buttons, find bar
  (Ctrl+F) with match navigation, and simple tables with a floating
  row/column toolbar. Every control performs its real operation.
- **Script selector.** 26 writing systems in six groups (Latin, Cyrillic,
  Greek, Arabic, Persian, Urdu, Hebrew, Devanagari, Bengali, Gurmukhi,
  Gujarati, Tamil, Telugu, Kannada, Malayalam, Sinhala, Ethiopic, Armenian,
  Georgian, Thai, Lao, Khmer, Myanmar, Chinese, Japanese, Korean). Fonts
  follow the script via Noto families lazy-loaded from Google Fonts; every
  stack ends in device fallbacks so nothing renders as missing-glyph boxes.
  Extensible by adding one object to `SCRIPTS` in `js/notebook/scripts.js`.
- **Direction.** LTR / RTL / Auto per paragraph plus a document default;
  RTL scripts flip the editor automatically. Mixed-direction documents rely
  on native Unicode BiDi (`dir="auto"` isolation, never manual reversing).
- **Documents.** sidebar with create/rename/duplicate/delete/starred,
  search across titles and full note text, sort by recent/created/A–Z.
  Drawer layout on mobile.
- **Saving.** debounced autosave (0.7 s) with Saving…/Saved/Syncing…/Offline
  status. Guests persist to IndexedDB (localStorage fallback); signed-in
  users sync to `notebook_documents` under RLS with an offline mirror. If
  the `notebook_documents` migration hasn't been run yet, notes keep saving
  on the device and the status shows **Saved locally** (with a one-time
  toast explaining what enables sync) instead of failing on every keystroke.
- **First open.** with no notes yet, the workspace shows an empty state; a
  note is created only when the user clicks *Create a note* / *New*.
- **Guest → account migration.** signing in keeps local notes visible while
  copying them into the account automatically. Each guest copy is removed from
  browser storage only after Supabase confirms the upload; no prompt is needed.
- **Export.** `.docx` (real OOXML built in-browser: headings, bold/italic/
  underline/strike, sub/superscript, colours, highlights, fonts+sizes,
  alignment, line spacing, RTL paragraphs/bidi, lists, tables), PDF via the
  browser print pipeline (correct shaping for Urdu/Arabic/Indic/CJK),
  standalone `.html`, `.md`, `.txt`, and a `.csv` index of all notes.

Backend: run `supabase/migrations/202608270001_notebook_documents.sql`
(see *Supabase setup* below). No other configuration is needed.

Category ids: `pronouns`, `greetings`, `numbers`, `colors`, `time`, `family`, `people`,
`body`, `home`, `places`, `food`, `animals`, `nature`, `clothing`, `work`, `verbs`,
`adjectives`, `questions`, `connectors`, `phrases`.

### Data model

One versioned document in `localStorage['lexio.v1']`:

```js
{
  schemaVersion: 3,
  settings: {
    theme, uiDir, activeLanguageId, dailyGoal, learnScopeId,
    showNativeScript,               // Preferences → native spellings on/off
    profile: { displayName }        // guest-mode identity (signed-in users
  },                                // use Supabase user metadata)
  languages: [ { id, name, code, dir: 'ltr'|'rtl'|'auto', createdAt } ],
  words: [
    {
      id, languageId, categoryId,
      term,           // what you type first — transliteration by default;
                      // legacy entries hold the native script here instead
      nativeScript,   // optional spelling in the native script
      meaning, example,
      dir: 'ltr'|'rtl'|'auto',
      dateAdded, updatedAt,
      stats: {
        seen, correct, incorrect, streak, box,
        lastReviewedAt, nextReviewAt
      }
    }
  ],
  progress:  { [wordId]: { box, seen, correct, lastSeen } },
  sessions:  [ { at, mode, categoryId, total, correct, durationMs } ]
}
```

`meaning`, `categoryId`, and `languageId` are required; **at least one of
`term` / `nativeScript` is required** (enforced client-side and, for signed-in
sync, by a database CHECK). `dir` is a per-word override applied to the native
script and example; `auto` lets the browser resolve mixed scripts.

**Learning state (Phase 4):** a word's synced `stats` object is the durable source of truth
— it rides along with the ordinary `vocabulary_entries` row, so signed-in users keep their
Leitner boxes across devices. The top-level `progress` map is a derived local cache:
maintained by `Store.recordAnswer()`, backfilled from `stats` on load/import/cloud
hydration, and still readable by anything that used it before (`isLearned()` checks both).
A word counts as **learned** at 3 correct answers (`Store.LEARNED_AT`). Session answers are
persisted quietly — no pub/sub emit — so an active Learn session is never re-rendered;
other tabs still hear the storage event and stay in step.

All reads and writes go through `js/store.js`. In guest mode they remain local. Once a
user signs in, `js/cloud.js` hydrates the store from Supabase and installs a queued remote
adapter; at the end of a session every practised word is queued for upsert so its new box
syncs. `migrate()` back-fills fields newer builds expect.

Supabase Row Level Security is the authorization boundary: authenticated clients can only
select, insert, update, and delete rows where `user_id = auth.uid()`. The optional
`base_dictionary` table is publicly readable but has no client-side write policy.

### Phase 2 vocabulary tools

- Add one word with meaning, category, optional example, and per-word direction.
- Bulk paste `term - meaning` pairs (tabs, en dashes, and em dashes also work), preview
  validation, then confirm the valid rows as one batch.
- Search and filter the active language's library, edit entries, and delete only after a
  confirmation dialog.
- Export/download the complete versioned document and import it in merge or replace mode.
- All Home and navigation counts update from the same persisted store.

### Phase 3 category browsing

- First-run sample Arabic notebook with a few ordinary local entries, including both RTL
  script and an LTR transliteration to demonstrate per-word direction. Reset still clears it.
- Responsive, read-only word-card grid with term, meaning, and optional example.
- Search over terms, meanings, and examples, with a friendly no-results state.
- Smooth page reveal and staggered card entrances, with reduced-motion support inherited
  from the design system.
- A visually distinct Manage callout that opens editing mode pre-filtered to the category,
  plus a "Practise these words" deep link into a category-scoped flashcard session.

### Phase 4 Learn mode

**Gating rule (decision).** Learn unlocks **globally, per active language**, once it holds
at least `Activities.GATE_MIN_WORDS` (4) words. One rule, easy to explain; below the line
the hub shows an encouraging prompt with the exact number of words still needed and points
to Manage Words. Once unlocked, the hub's scope chips can narrow practice to one category,
and each activity's own `minWords` is enforced again at launch — a small scoped collection
shows *which* game needs more words rather than dead-ending. (Rationale: quiz distractors
want ≥4 words and match-up wants ≥3 pairs; 4 is the smallest threshold where every mode
works.)

**Activities.**
- *Flashcards* — 3D flip card (term ↔ meaning + example), tap/Space to flip, "Got it" /
  "Still learning" buttons, ←/→ keys, or swipe left/right with live drag feedback. A dot
  meter tracks the deck.
- *Quiz* — up to 10 questions mixing "What does this mean?" (term → meaning) and
  "How do you say it?" (meaning → term). Distractors are drawn from your own words,
  preferring the same category so wrong answers stay plausible. Numbered options answerable
  by keyboard, instant colour-coded feedback.
- *Type It* — the meaning is shown and the learner produces the target spelling from
  memory. Unicode-normalized transliterated or native spellings are accepted, with clear
  answer feedback instead of multiple-choice recognition.
- *Match-up* — up to 5 pairs on two columns against a gentle count-up clock. First-try
  matches rate as known; pairs needing retries report "still learning" once. Slips are
  counted but never punished beyond a shake.
- *Memory Match* — a concentration grid with four word ↔ meaning pairs. Cards stay hidden
  until flipped, mismatches turn back after a short pause, and clean finds rate as known.

**Scheduler (`js/scheduler.js`) — simple and transparent, no AI.**
Each word sits in one of five Leitner boxes stored on its synced `stats`:

| Box | Label         | Next review     |
|-----|---------------|-----------------|
| 0   | New / shaky   | immediately     |
| 1   | Seen once     | in 1 day        |
| 2   | Getting there | in 2 days       |
| 3   | Familiar      | in 4 days       |
| 4   | Solid         | in 8 days       |
| 5   | Mastered      | in 16 days      |

Correct → box +1; a miss → box 0. Session decks are drawn by weighted sampling without
replacement: due words weigh 10, unseen words 6, resting words by box (5, 4, 3, 2, then 1).
The hub shows this exact table behind a "How Lexio picks what you practise" disclosure.

**Sessions & summaries.** Every answer flows through `Store.recordAnswer()` (quietly
persisted, never re-rendering an active session) and every session ends with a summary:
practised / got-it / again-soon counts, time spent, accuracy bar, and a per-word list.
"Practise again" rebuilds from the freshly updated weights. Sessions append to
`state.sessions`, which feeds Review in Phase 5.

**Sync.** Learning state lives on each word's synced `stats` object, so signed-in users
keep their boxes across devices using the existing `vocabulary_entries` table — no schema
change. The legacy top-level `progress` map is kept in step locally and backfilled from
`stats` on load, import, and cloud hydration.

### Phase 5 Review mode

One call — **`Store.reviewSnapshot()`** — aggregates everything the page shows, fresh on
every render, so numbers can never go stale after a session:

- `totals` / `dueNow` — words, learned, streak, and how many are ready for review.
- `boxes` — counts per Leitner box (the six-column chart; higher boxes tint stronger).
- `allTime` — lifetime answers, overall accuracy and total practice time.
- `categories` — mastery (learned/total) plus **recall %** per category, in taxonomy order.
- `needsWork` — up to eight miss-heavy words (misses ↓, box ↑) with resolved direction.
- `recentSessions` — newest first regardless of insert order.
- `days` — fourteen zero-filled day buckets of answers/correct/sessions.

The page renders it as overview tiles (the due-now tile links straight into a session),
hue-tinted mastery rows reusing each category's identity colors, plain-CSS bar charts,
and history rows with score chips and mini accuracy bars. Empty states are purpose-built:
no words yet points to Manage Words; words but no sessions invites the first one.

### Transliteration-first vocabulary (schema v3)

Words are typed the way they sound: the add/edit forms ask for a **transliterated
spelling first** and treat the native script as an optional second field. One shared
renderer (`js/word-display.js`) draws every card as two parts divided by a hairline —
transliteration with the native spelling beneath it on one side, meaning and an optional
example on the other — so browse cards, flashcards, quiz options, match tiles, library
rows, session summaries, and the needs-work list all stay consistent. Legacy entries
that keep their native script in `term` render unchanged in the primary slot (the native
line simply never duplicates it), and search covers both spellings plus meanings and
examples.

**Backend:** `supabase/migrations/202608230001_vocabulary_native_script.sql` adds an
optional `native_script` column, relaxes the old `term >= 1` check to allow
native-only entries, and enforces "at least one script present" at the database level.
It is additive and idempotent — run it once; existing rows and RLS policies are untouched.

### My Account & the BYOK AI connector

The account button opens a **dropdown menu** (My profile + Sign in / Sign out, with an
identity header). The `#/account` page gathers:

- **Profile** — initials avatar, display name (Supabase user metadata when signed in,
  local settings for guests), email, member since, sign-in provider.
- **My Learning** — vocabulary/learned/still-learning/streak stat blocks, overall
  progress bar, language chips with counts, recently added words.
- **Preferences** — *Show native script spellings* (app-wide, honed through
  `WordDisplay.secondary()` so every surface obeys instantly) and the theme control.
- **AI assistant** — bring-your-own-key connector (OpenAI, Anthropic, Gemini,
  OpenRouter, OmniRouter, or any OpenAI-compatible URL).
- **Security** — change password, emailed reset link, connected-Google status,
  sign out, typed-confirmation account deletion.
- **Data** — CSV vocabulary export, full JSON backup, import, and a
  keep-languages `clearVocabulary()` wipe.

**Key handling is server-side by design.** Keys are never written to browser
storage. In this Phase 1 connector, the browser posts the key once to the
`ai-gateway` Edge Function → the function validates its shape, stores it via
`vault.create_secret()`, and keeps only the secret id + last-4 hint in
`public.user_ai_providers`. The metadata table is server-only; RLS remains as
defense in depth. There is deliberately no general-purpose AI proxy yet — Phase
2 should add narrow feature-specific actions with rate limits and validated
provider requests. Setup:

1. Run the migrations in `supabase/migrations/` **in filename order** (SQL Editor).
   For BYOK that means `…240001_user_ai_providers.sql` (server-only metadata table + RLS),
   `…250001_ai_vault_helpers.sql` (hardened Vault wrappers), then the additive
   `…260001_harden_ai_key_storage.sql` upgrade (also required when the first two were
   already applied). Vault ships pre-installed on current projects — verify it under
   **Integrations → Vault**; there is nothing to enable manually.
2. `supabase functions deploy ai-gateway` and `supabase functions deploy delete-account`.

The wrapper migration creates `public.lexio_create_ai_secret / lexio_delete_ai_secret /
lexio_read_ai_secret` as SECURITY DEFINER functions with an empty pinned `search_path`,
EXECUTE revoked from `anon`/`authenticated`/`public` and granted to `service_role`
only. The Vault schema is fully qualified and never exposed through PostgREST, so
client roles cannot reach keys. Both Edge Functions validate the caller with
`auth.getUser()`; their legacy gateway JWT check is disabled in `config.toml` to
avoid maintaining two different authentication paths.

### Adding a new learning activity

Drop a file that registers itself — no other file changes:

```js
// js/activities/type-trainer.js
(function () {
  Activities.register({
    id: 'typing', name: 'Typing', icon: 'edit',
    tagline: 'Type the word from memory.',
    minWords: 4, sessionSize: 10,
    create: function (stage, ctx) {
      // ctx.deck (weighted words), ctx.rate(id, correct), ctx.finish(),
      // ctx.meter.init(n)/mark(i, ok), shared helpers in Activities.util
      return { teardown: detachMyListeners };
    }
  });
})();
```

Then add one `<script>` tag to `index.html`. The hub card, gating, meter chrome,
answer recording, session summary and sync all come for free.

### Not yet implemented (Phase 6+)

- Audio / pronunciation and tags.
- Cloud sync for the session log (words and boxes already sync; history is local-only).
- Deeper Review drill-downs, e.g. tapping a mastery bar to open that category's words.

### Recommended next steps

1. **Session-log sync** — mirror `state.sessions` to a per-user Supabase table so signed-in
   users keep their history across devices (the snapshot API already reads through one
   function, so only persistence changes).
2. **Actionable needs-work** — a "drill these eight" button that builds a one-off deck from
   `reviewSnapshot().needsWork` and launches flashcards with it.

---

## Supabase setup

1. In the Supabase SQL editor, run every file in `supabase/migrations/` in filename
   order. Together they create `user_languages`, `vocabulary_entries` (including the
   optional `native_script` column and word-form check), the public `base_dictionary`,
   `notebook_documents` (Notebook notes for signed-in users), and all ownership RLS
   policies.
2. In **Authentication → Providers**, enable Email and Google. Add your Google OAuth client
   credentials in Supabase.
3. In **Authentication → URL Configuration**, set the production Site URL and add local
   and production redirect URLs (for example `http://localhost:8000/index.html`).
4. Confirm that `js/supabase-config.js` contains this project's API URL and publishable
   browser key. The publishable key is intentionally part of the static frontend; it is not
   a secret and only grants the access allowed by Supabase Authentication and Row Level
   Security. **Never put a service-role or secret key in this app.**

No environment variables, runtime config generation, or build command are required.
Deploy by publishing this directory as-is to any static host.

## Development

Serve the folder locally (OAuth does not work reliably from a `file://` URL):

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. For production, publish the same files without a build step
and add the deployed URL to Supabase's allowed redirect URLs.

### Test pages

- `test-harness.html` — assertions over the store, scheduler and review aggregation:
  CRUD, RTL entries, count aggregation, Leitner box progression, due/weight logic, deck
  building, session records, review snapshot (boxes, categories, recall, needs-work,
  fourteen-day buckets, history ordering), language scoping, export/import round-trip,
  merge idempotency, deletion cleanup, and invalid input. Open it and read the console
  for the final result.
- `rtl-check.html` — boots the real app under `dir="rtl"` with seeded Arabic vocabulary
  to check mirroring and populated-card rendering. Useful to re-run whenever layout CSS
  changes; it caught a real bug in Phase 1 (progress-bar fills anchoring to the wrong
  edge because the `<span>` track was still `display:inline`).

Both are development aids and can be deleted before publishing. Note that both call
`Store.resetAll()`, so open them in a throwaway profile if you already have real data.
 profile if you already have real data.
