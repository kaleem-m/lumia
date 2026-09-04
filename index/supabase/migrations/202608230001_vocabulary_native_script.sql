-- Lexio: transliteration-primary words with optional native-script spelling.
--
-- Data model: `term` holds whatever the user types first (transliteration by
-- default going forward); `native_script` optionally holds the word in its
-- own script. At least one of the two must be present.
--
-- Fully additive and idempotent: existing rows keep working (every current
-- row satisfies the relaxed checks because term >= 1 was previously forced),
-- RLS policies are unaffected, and older clients simply ignore the column.

-- 1. New optional column.
alter table public.vocabulary_entries
  add column if not exists native_script text not null default ''
  check (char_length(native_script) <= 200);

-- 2. Allow term to be empty when the native spelling carries the word.
--    The original inline check was auto-named vocabulary_entries_term_check.
alter table public.vocabulary_entries
  drop constraint if exists vocabulary_entries_term_check;

alter table public.vocabulary_entries
  drop constraint if exists vocabulary_entries_word_form_check;

alter table public.vocabulary_entries
  add constraint vocabulary_entries_term_check check (char_length(term) <= 200);

-- 3. Keep the database honest: a word must exist in at least one script.
alter table public.vocabulary_entries
  add constraint vocabulary_entries_word_form_check
    check (char_length(term) > 0 or char_length(native_script) > 0);
