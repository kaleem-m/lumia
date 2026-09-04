// Lexio — permanent account deletion.
//
// Supabase only allows the service role to delete auth users, so the client
// asks this function (with its own access token) and we verify identity
// before calling admin.deleteUser(). Cascades remove vocabulary rows, AI
// provider references, and Vault secrets via ON DELETE CASCADE / explicit
// cleanup below.
//
// Deploy: supabase functions deploy delete-account

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL') ?? '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const authed = createClient(url, anon, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data, error } = await authed.auth.getUser();
    if (error || !data.user) {
      return new Response(JSON.stringify({ error: 'Not authenticated.' }),
        { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    const userId = data.user.id;

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // Remove Vault secrets through the hardened wrapper (the vault schema is
    // not exposed via PostgREST, and only service role may execute this).
    const { data: rows, error: rowsError } = await admin
      .from('user_ai_providers').select('secret_id').eq('user_id', userId);
    if (rowsError) throw new Error('AI provider lookup failed.');
    for (const row of rows ?? []) {
      const { error: secretError } = await admin.rpc('lexio_delete_ai_secret', {
        p_secret_id: row.secret_id,
      });
      if (secretError) throw new Error('AI secret deletion failed.');
    }

    const { error: delError } = await admin.auth.admin.deleteUser(userId);
    if (delError) {
      return new Response(JSON.stringify({ error: 'Account deletion failed.' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true }),
      { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[delete-account]', err);
    return new Response(JSON.stringify({ error: 'Unexpected error.' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
