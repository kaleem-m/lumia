// Lexio AI gateway — Vault-backed BYOK key connection.
//
// The browser never stores API keys and does not talk to AI providers in
// Phase 1. It invokes this function with the user's access token; the function
// verifies the user and keeps their key encrypted in Supabase Vault.
//
// Vault access goes through SECURITY DEFINER wrapper functions
// (public.lexio_*_ai_secret) that only the service role may execute —
// see supabase/migrations/202608250001_ai_vault_helpers.sql. The vault
// schema itself is never touched through PostgREST.
//
// Phase 1 actions (POST JSON body):
//   { action: 'save-key',  provider, apiKey, baseUrl? } → { ok, provider, hint }
//   { action: 'clear-key' }                             → { ok }
//   { action: 'status' }                                → { connected, provider, hint, baseUrl }
//
// Provider calls intentionally do not live here yet. Phase 2 can add a narrow,
// feature-specific action after its request shape, rate limits, and egress rules
// are defined. Keeping Phase 1 storage-only avoids an unnecessary proxy/SSRF
// surface while the product does not use AI responses.
//
// Secrets handling rules enforced in this file:
//   • API keys are accepted once, validated for shape, then immediately
//     handed to Vault. They are never written to logs, responses, or
//     error messages.
//   • Client-visible errors are generic; details go to console.error only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // Supabase JS sends x-client-info. Omitting it makes the browser reject the
  // preflight and surfaces only "Failed to send a request to the Edge Function".
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type AdminClient = ReturnType<typeof createClient<any>>;
type ProviderRow = {
  provider: string;
  base_url: string;
  secret_id: string;
  key_hint: string;
};

const PROVIDERS = new Set([
  'openai',
  'anthropic',
  'gemini',
  'openrouter',
  'omni',
  'custom',
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function fail(message: string, status = 500) {
  // Generic on purpose — internal detail stays in function logs only.
  return json({ error: message }, status);
}

function keyShapeOk(provider: string, key: string) {
  if (!key || key.length < 12 || key.length > 512 || /\s/.test(key)) return false;
  if (provider === 'openai') return /^sk-/.test(key);
  if (provider === 'anthropic') return /^sk-ant-/.test(key);
  if (provider === 'gemini') return /^AIza/.test(key);
  if (provider === 'openrouter') return /^sk-or-/.test(key);
  return true; // omni / custom — length + no whitespace only
}

function normalizeBaseUrl(provider: string, value: unknown): string | null {
  if (provider !== 'custom') return '';
  const raw = String(value || '').trim();
  if (!raw || raw.length > 300) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function getUser(req: Request, anonKey: string) {
  const authed = createClient(Deno.env.get('SUPABASE_URL') ?? '', anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data, error } = await authed.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

async function loadRow(admin: AdminClient, userId: string): Promise<ProviderRow | null> {
  const { data, error } = await admin
    .from('user_ai_providers')
    .select('provider, base_url, secret_id, key_hint')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error('Provider lookup failed.');
  return data as ProviderRow | null;
}

async function createSecret(
  admin: AdminClient,
  secret: string,
  name: string,
) {
  const { data, error } = await admin.rpc('lexio_create_ai_secret', {
    p_secret: secret,
    p_name: name,
  });
  if (error || !data) {
    console.error('[ai-gateway] create_secret failed:', error?.message);
    throw new Error('Vault write failed.');
  }
  return data as string; // uuid returned directly by the SQL function
}

async function deleteSecret(
  admin: AdminClient,
  secretId: string,
) {
  const { error } = await admin.rpc('lexio_delete_ai_secret', { p_secret_id: secretId });
  if (error) {
    console.error('[ai-gateway] delete_secret failed:', error.message);
    throw new Error('Vault delete failed.');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('Method not allowed.', 405);

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const user = await getUser(req, Deno.env.get('SUPABASE_ANON_KEY') ?? '');
    if (!user) return fail('Not authenticated.', 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    /* ---- save-key ------------------------------------------------------ */
    if (action === 'save-key') {
      const provider = String(body.provider || '');
      if (!PROVIDERS.has(provider)) return fail('Unknown provider.', 400);
      const apiKey = String(body.apiKey || '').trim();
      if (!keyShapeOk(provider, apiKey)) {
        return fail("That doesn't look like a valid key for this provider.", 400);
      }
      const baseUrl = normalizeBaseUrl(provider, body.baseUrl);
      if (baseUrl === null) {
        return fail('Custom providers need a valid HTTPS base URL.', 400);
      }

      const previous = await loadRow(admin, user.id);
      let newSecretId: string | null = null;

      try {
        // Write the replacement first; swap the pointer; then remove the old
        // secret — so a failure mid-way can never leave the user keyless.
        newSecretId = await createSecret(
          admin,
          apiKey,
          `lexio:${user.id}:${provider}`,
        );

        const { error } = await admin.from('user_ai_providers').upsert({
          user_id: user.id,
          provider,
          base_url: baseUrl,
          secret_id: newSecretId,
          key_hint: apiKey.slice(-4),
          updated_at: new Date().toISOString(),
        });
        if (error) throw new Error('Provider row upsert failed.');
      } catch (err) {
        if (newSecretId) {
          await deleteSecret(admin, newSecretId).catch(() => {});
        }
        console.error('[ai-gateway] save-key:', err instanceof Error ? err.message : String(err));
        return fail('Could not store your key securely. Try again.', 500);
      }

      if (previous?.secret_id && previous.secret_id !== newSecretId) {
        await deleteSecret(admin, previous.secret_id).catch(() => {});
      }
      return json({ ok: true, provider, hint: apiKey.slice(-4) });
    }

    /* ---- clear-key ----------------------------------------------------- */
    if (action === 'clear-key') {
      const row = await loadRow(admin, user.id);
      if (row?.secret_id) {
        // Keep the reference row if Vault deletion fails so the secret remains
        // reachable for a retry instead of becoming an orphan.
        await deleteSecret(admin, row.secret_id);
      }
      const { error } = await admin.from('user_ai_providers').delete().eq('user_id', user.id);
      if (error) return fail('Could not disconnect the provider.', 500);
      return json({ ok: true });
    }

    /* ---- status ---------------------------------------------------------- */
    if (action === 'status') {
      const row = await loadRow(admin, user.id);
      return json({
        connected: !!row,
        provider: row?.provider ?? null,
        hint: row?.key_hint ?? '',
        baseUrl: row?.base_url ?? '',
      });
    }

    return fail('Unknown action.', 400);
  } catch (err) {
    console.error('[ai-gateway]', err instanceof Error ? err.message : String(err));
    return fail('Unexpected gateway error.', 500);
  }
});
