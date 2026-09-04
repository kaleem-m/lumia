-- Lexio: user-provided AI keys, stored as Supabase Vault secrets.
--
-- Architecture (BYOK — Bring Your Own Key):
--   browser → edge function 'ai-gateway' → vault.create_secret() → reference row here
--   The raw API key NEVER lands in browser storage and never leaves the
--   server except when the gateway forwards a request to the user's chosen
--   provider. This table keeps only the Vault secret id plus non-sensitive
--   metadata (provider name, last-4 hint, optional custom base URL).
--
-- Requires the Supabase Vault extension (Dashboard → Database → Secrets).
-- Enable it once if your project does not have it yet:
--   create extension if not exists supabase_vault with schema extensions;

create table if not exists public.user_ai_providers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null check (provider in
    ('openai', 'anthropic', 'gemini', 'openrouter', 'omni', 'custom')),
  base_url text not null default '' check (char_length(base_url) <= 300),
  secret_id uuid not null,
  key_hint text not null default '' check (char_length(key_hint) <= 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_ai_providers enable row level security;
alter table public.user_ai_providers force row level security;

-- The browser never needs direct table access; status and mutations all go
-- through ai-gateway. RLS remains as defense in depth, while table privileges
-- keep the metadata surface server-only.
revoke all on public.user_ai_providers from anon, authenticated;

drop policy if exists "Users manage own AI provider" on public.user_ai_providers;
create policy "Users manage own AI provider"
  on public.user_ai_providers for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- NOTE: plaintext keys live only in vault.decrypted_secrets, which is NOT
-- granted to client roles. Only service-role contexts (edge functions) can
-- read them.
