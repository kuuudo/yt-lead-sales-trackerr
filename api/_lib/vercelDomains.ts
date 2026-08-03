// lib/vercelDomains.ts
//
// Thin wrapper around the Vercel REST API for attaching a custom hostname
// to this project. Called from verify-domain.ts only, after DNS TXT
// ownership has already been confirmed — never called directly by any
// client-facing code path. VERCEL_TOKEN / VERCEL_PROJECT_ID stay server-side
// env vars, same trust boundary as SUPABASE_SERVICE_KEY in verify-domain.ts.
//
// Sources (checked against official docs, not assumed):
//
// [DOCS] Endpoint + method + request body shape + response shape:
//   https://vercel.com/docs/rest-api/projects/add-a-domain-to-a-project
//   POST /v10/projects/:idOrName/domains  — minimal body is { name }.
//
// [DOCS] Status code -> meaning mapping (same page, "Response" section):
//   400 = domain already exists on THIS project
//   403 = "You don't have access to the domain you are adding" (permission)
//   409 = "The domain is already assigned to another Vercel project"
//
// [DOCS] Error code for "domain already exists":
//   https://vercel.com/docs/rest-api/errors  ("Domain already exists" section)
//   code: "not_modified", message: `The domain "NAME" already exists`
//   NOTE: this error-code reference page documents Vercel's Domains API
//   family generally; the add-project-domain endpoint page itself does not
//   explicitly cross-reference which error.code accompanies its 400. We
//   check for code === 'not_modified' as the documented signal, and fall
//   back to a message-text match as a secondary check — but do NOT treat
//   every 400 as success, since 400 is also the generic "invalid request
//   body" status per the same errors page (code: "bad_request",
//   "invalid_name", "missing_name", etc). Only a confirmed
//   already-exists signal is treated as an idempotent success; any other
//   400 is surfaced as a real error.
//
// [NOT DOCS-CONFIRMED / defensive] The exact production behavior of the
//   v10 add-project-domain endpoint's 400 body has not been verified
//   against a live response for THIS project — log the raw body on any
//   400 that doesn't match the known signal, so real-world behavior can
//   be confirmed on first use and this comment updated accordingly.

const VERCEL_API_BASE = 'https://api.vercel.com';

export type VercelAttachResult =
  | { ok: true; alreadyAttached: boolean }
  | { ok: false; error: string };

export async function attachDomainToVercel(
  hostname: string
): Promise<VercelAttachResult> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!token || !projectId) {
    console.error('[vercelDomains] VERCEL_TOKEN or VERCEL_PROJECT_ID missing');
    return { ok: false, error: 'Server misconfiguration: Vercel credentials missing' };
  }

  let response: Response;
  try {
    response = await fetch(`${VERCEL_API_BASE}/v10/projects/${projectId}/domains`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: hostname }),
    });
  } catch (err) {
    console.error('[vercelDomains] attach threw:', err);
    return { ok: false, error: 'Could not reach Vercel API' };
  }

  if (response.ok) {
    return { ok: true, alreadyAttached: false };
  }

  const body = await response.json().catch(() => null);
  const code: string | undefined = body?.error?.code;
  const message: string | undefined = body?.error?.message;

  // 409 [DOCS-confirmed]: domain belongs to a DIFFERENT Vercel project.
  // Not retryable from our side.
  if (response.status === 409) {
    console.error('[vercelDomains] domain claimed elsewhere:', hostname, message);
    return {
      ok: false,
      error: 'This domain is already attached to a different Vercel project.',
    };
  }

  // 403 [DOCS-confirmed]: permission issue, almost always our own token
  // scope/config rather than a per-domain problem.
  if (response.status === 403) {
    console.error('[vercelDomains] permission denied:', hostname, message);
    return {
      ok: false,
      error: 'Vercel denied access to this domain (check API token permissions).',
    };
  }

  // 400: could be "already exists on this project" (idempotent success —
  // the retry case) OR a genuine validation error. Only treat it as
  // success when the response actually signals "already exists"; anything
  // else is a real failure.
  if (response.status === 400) {
    const alreadyExists =
      code === 'not_modified' ||
      (typeof message === 'string' && message.toLowerCase().includes('already exists'));

    if (alreadyExists) {
      return { ok: true, alreadyAttached: true };
    }

    console.error('[vercelDomains] 400 without already-exists signal:', hostname, {
      code,
      message,
      rawBody: body,
    });
    return { ok: false, error: message || 'Vercel rejected the domain (400)' };
  }

  console.error('[vercelDomains] attach failed:', response.status, message, body);
  return { ok: false, error: message || `Vercel API error (${response.status})` };
}
