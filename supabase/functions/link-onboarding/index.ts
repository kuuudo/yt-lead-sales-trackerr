// Authenticated endpoint: ties an anonymous onboarding session to the signed-in user.
// The user id comes from the verified access token, never from the request body.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json, UUID_RE } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // The public anon key is also a valid bearer token, but it has no user, so this rejects it.
  const { data, error: userError } = await admin.auth.getUser(token);
  if (userError || !data.user) return json({ error: 'unauthorized' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const sessionId = body?.session_id;
  if (typeof sessionId !== 'string' || !UUID_RE.test(sessionId)) return json({ error: 'invalid_session' }, 400);

  const { data: result, error } = await admin.rpc('link_onboarding_session', {
    p_session_id: sessionId,
    p_user_id: data.user.id,
  });
  if (error) {
    console.error('link_onboarding_session failed:', error.message);
    return json({ error: 'link_failed' }, 500);
  }
  return json({ result }); // 'linked' | 'already_linked' | 'not_found' | 'claimed_by_other'
});