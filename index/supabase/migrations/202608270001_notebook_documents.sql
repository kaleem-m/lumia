-- Notebook documents — rich-text notes for authenticated users.
-- Run this migration in the Supabase SQL editor (or `supabase db push`).
-- It is additive and idempotent: existing tables, rows, and policies for the
-- vocabulary feature are untouched.

create table if not exists public.notebook_documents (
  id            text not null,
  user_id       uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,
  title         text not null default 'Untitled Note'
                  check (char_length(title) between 1 and 200),
  content_html  text not null default ''
                  check (char_length(content_html) <= 2000000),
  search_text   text not null default ''
                  check (char_length(search_text) <= 25000),
  script        text not null default 'latin',
  font_family   text not null default '' check (char_length(font_family) <= 500),
  font_size     integer not null default 17
                  check (font_size between 8 and 96),
  direction     text not null default 'auto' check (direction in ('auto', 'ltr', 'rtl')),
  line_height   numeric not null default 1.7 check (line_height > 0 and line_height <= 5),
  starred       boolean not null default false,
  word_count    integer not null default 0 check (word_count >= 0),
  char_count    integer not null default 0 check (char_count >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, id)
);

-- Upgrade tables created by an earlier version of this migration. The frontend
-- also sends user_id explicitly; this default keeps direct authenticated API
-- inserts safe and prevents a missing field from becoming a NOT NULL failure.
alter table public.notebook_documents
  alter column user_id set default auth.uid();

-- Sidebar ordering: newest edit first per user.
create index if not exists notebook_documents_user_updated_idx
  on public.notebook_documents (user_id, updated_at desc);

alter table public.notebook_documents enable row level security;
alter table public.notebook_documents force row level security;

revoke all on public.notebook_documents from anon, authenticated;
grant select, insert, update, delete on public.notebook_documents to authenticated;

drop policy if exists "Users read own notes" on public.notebook_documents;
create policy "Users read own notes"
  on public.notebook_documents for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users create own notes" on public.notebook_documents;
create policy "Users create own notes"
  on public.notebook_documents for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own notes" on public.notebook_documents;
create policy "Users update own notes"
  on public.notebook_documents for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users delete own notes" on public.notebook_documents;
create policy "Users delete own notes"
  on public.notebook_documents for delete to authenticated
  using ((select auth.uid()) = user_id);
