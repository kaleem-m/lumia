-- Lexio private vocabulary schema
-- Run this migration in the Supabase SQL editor or with `supabase db push`.

create extension if not exists pgcrypto;

create table if not exists public.user_languages (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  code text not null default '' check (char_length(code) <= 20),
  direction text not null default 'ltr' check (direction in ('auto', 'ltr', 'rtl')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  unique (id, user_id)
);

create table if not exists public.vocabulary_entries (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  language_id text not null,
  category_id text not null check (category_id in (
    'pronouns', 'greetings', 'numbers', 'colors', 'time', 'family', 'people',
    'body', 'home', 'places', 'food', 'animals', 'nature', 'clothing', 'work',
    'verbs', 'adjectives', 'questions', 'connectors', 'phrases'
  )),
  term text not null check (char_length(term) between 1 and 200),
  meaning text not null check (char_length(meaning) between 1 and 300),
  example text not null default '' check (char_length(example) <= 1000),
  direction text not null default 'auto' check (direction in ('auto', 'ltr', 'rtl')),
  date_added timestamptz not null default now(),
  updated_at timestamptz,
  stats jsonb not null default '{"seen":0,"correct":0,"incorrect":0,"streak":0,"box":0,"lastReviewedAt":null,"nextReviewAt":null}'::jsonb,
  primary key (user_id, id),
  constraint vocabulary_language_owner_fk
    foreign key (user_id, language_id)
    references public.user_languages(user_id, id)
    on delete cascade,
  constraint vocabulary_stats_object check (jsonb_typeof(stats) = 'object')
);

create index if not exists vocabulary_entries_user_language_idx
  on public.vocabulary_entries (user_id, language_id, date_added desc);
create index if not exists vocabulary_entries_user_category_idx
  on public.vocabulary_entries (user_id, category_id);

-- Optional shared dictionary. There are intentionally no client write policies.
create table if not exists public.base_dictionary (
  id uuid primary key default gen_random_uuid(),
  language_code text not null,
  category_id text,
  term text not null,
  meaning text not null,
  example text not null default '',
  direction text not null default 'auto' check (direction in ('auto', 'ltr', 'rtl')),
  created_at timestamptz not null default now()
);

alter table public.user_languages enable row level security;
alter table public.vocabulary_entries enable row level security;
alter table public.base_dictionary enable row level security;

-- Force table owners through RLS too, reducing accidental bypasses in application code.
alter table public.user_languages force row level security;
alter table public.vocabulary_entries force row level security;
alter table public.base_dictionary force row level security;

revoke all on public.user_languages from anon, authenticated;
revoke all on public.vocabulary_entries from anon, authenticated;
revoke all on public.base_dictionary from anon, authenticated;
grant select, insert, update, delete on public.user_languages to authenticated;
grant select, insert, update, delete on public.vocabulary_entries to authenticated;
grant select on public.base_dictionary to anon, authenticated;

drop policy if exists "Users read own languages" on public.user_languages;
create policy "Users read own languages"
  on public.user_languages for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create own languages" on public.user_languages;
create policy "Users create own languages"
  on public.user_languages for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own languages" on public.user_languages;
create policy "Users update own languages"
  on public.user_languages for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own languages" on public.user_languages;
create policy "Users delete own languages"
  on public.user_languages for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users read own vocabulary" on public.vocabulary_entries;
create policy "Users read own vocabulary"
  on public.vocabulary_entries for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create own vocabulary" on public.vocabulary_entries;
create policy "Users create own vocabulary"
  on public.vocabulary_entries for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own vocabulary" on public.vocabulary_entries;
create policy "Users update own vocabulary"
  on public.vocabulary_entries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own vocabulary" on public.vocabulary_entries;
create policy "Users delete own vocabulary"
  on public.vocabulary_entries for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Base dictionary is publicly readable" on public.base_dictionary;
create policy "Base dictionary is publicly readable"
  on public.base_dictionary for select to anon, authenticated
  using (true);
