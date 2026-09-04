-- Apply the simplified Phase 1 BYOK permissions and Vault wrappers to projects
-- that already ran the original AI migrations.

-- AI provider metadata is only accessed by service-role Edge Functions.
revoke all on public.user_ai_providers from anon, authenticated;

create or replace function public.lexio_create_ai_secret(
  p_secret text,
  p_name text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_secret is null or length(p_secret) = 0 then
    raise exception 'Empty secret';
  end if;

  select vault.create_secret(p_secret, p_name, 'Lexio BYOK AI key')
    into v_id;
  return v_id;
end;
$$;

create or replace function public.lexio_delete_ai_secret(
  p_secret_id uuid
) returns void
language sql
security definer
set search_path = ''
as $$
  delete from vault.secrets where id = p_secret_id;
$$;

create or replace function public.lexio_read_ai_secret(
  p_secret_id uuid
) returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where id = p_secret_id;
$$;

revoke all on function public.lexio_create_ai_secret(text, text)
  from public, anon, authenticated;
revoke all on function public.lexio_delete_ai_secret(uuid)
  from public, anon, authenticated;
revoke all on function public.lexio_read_ai_secret(uuid)
  from public, anon, authenticated;

grant execute on function public.lexio_create_ai_secret(text, text) to service_role;
grant execute on function public.lexio_delete_ai_secret(uuid) to service_role;
grant execute on function public.lexio_read_ai_secret(uuid) to service_role;
