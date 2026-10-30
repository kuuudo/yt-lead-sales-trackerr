// Public endpoint: saves anonymous onboarding answers and progress.
// Validates shape and size, and checks enumerated answers (role) against the allowed ids.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, json, UUID_RE } from '../_shared/cors.ts';

// Keep in sync with ROLES in src/lib/onboardingFlow.ts. If you add or rename a role there,
// change it here too, or saves containing that role are rejected.
const ALLOWED_VALUES: Record<string, string[]> = {
  role: ['business_owner', 'marketer', 'agency', 'sponsor_brand', 'creator'],
};

const KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_KEYS = 40;
const MAX_STRING = 500;
const MAX_ARRAY = 20;
const MAX_STEP = 50;
const MAX_BODY_CHARS = 8000;

/** Returns the value if acceptable, or undefined if not. */
function cleanValue(v: unknown): unknown {
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') return v.length <= MAX_STRING ? v : undefined;
  if (Array.isArray(v) && v.length <= MAX_ARRAY && v.every((x) => typeof x === 'string' && x.length <= MAX_STRING)) {
    return v;
  }
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return json({ error: 'too_large' }, 413);

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { session_id, version, step, completed } = body ?? {};
  const answers = body?.answers ?? {};

  if (typeof session_id !== 'string' || !UUID_RE.test(session_id)) return json({ error: 'invalid_session' }, 400);
  if (typeof answers !== 'object' || Array.isArray(answers)) return json({ error: 'invalid_answers' }, 400);

  const entries = Object.entries(answers);
  if (entries.length > MAX_KEYS) return json({ error: 'invalid_answers' }, 400);

  const clean: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    let cleaned = KEY_RE.test(key) ? cleanValue(value) : undefined;
    const allowed = ALLOWED_VALUES[key];
    if (allowed && cleaned !== null && !(typeof cleaned === 'string' && allowed.includes(cleaned))) cleaned = undefined;
    if (cleaned === undefined) return json({ error: 'invalid_answer', key }, 400);
    clean[key] = cleaned;
  }

  if (step !== undefined && !(Number.isInteger(step) && step >= 1 && step <= MAX_STEP)) {
    return json({ error: 'invalid_step' }, 400);
  }
  if (completed !== undefined && typeof completed !== 'boolean') return json({ error: 'invalid_completed' }, 400);
  if (entries.length === 0 && step === undefined && completed !== true) return json({ error: 'nothing_to_save' }, 400);

  const ver = Number.isInteger(version) && version > 0 && version < 1000 ? version : 1;

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const { error } = await admin.rpc('save_onboarding_answers', {
    p_session_id: session_id,
    p_answers: clean,
    p_version: ver,
    p_step: step ?? null,
    p_completed: completed === true,
  });
  if (error) {
    console.error('save_onboarding_answers failed:', error.message);
    return json({ error: 'save_failed' }, 500);
  }
  return json({ ok: true });
});
