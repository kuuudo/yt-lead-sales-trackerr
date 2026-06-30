import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// api/stripe-webhook.ts
//
// Single global endpoint for ALL tenant Stripe accounts.
// https://www.vstrk.com/api/stripe-webhook
//
// Phase 3A scope (deliberately minimal):
//   - Only checkout.session.completed is processed. Onboarding instructs
//     every tenant to subscribe to ONLY this event — nothing else is sent
//     to this endpoint, so nothing else needs to be handled.
//   - 1 user = 1 Stripe account = 1 webhook secret (stripe_configs.user_id)
//   - campaign token is the resolution key: token -> redirect_links ->
//     campaigns -> user_id -> stripe_configs -> secret. This is the ONLY
//     identity resolution path. No identity-map table — not needed, since
//     client_reference_id always carries the token on this event type.
//   - NO platform-secret fallback. If resolution fails at any step, the
//     event is rejected with an explicit error. There are no live tenants
//     yet, so silent fallback would only mask configuration bugs.
//   - Existing tables only: redirect_links, campaigns, stripe_configs,
//     stripe_purchases, plus one new table (stripe_events_log) for
//     idempotency.
//
// Deferred to a later phase (only if/when those event types are actually
// subscribed to): subscription updates, invoice failures, refunds, and the
// stripe_identity_map table that resolving those would require.
// ============================================================================

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export const config = {
  api: { bodyParser: false },
};

const getRawBody = (req: VercelRequest): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });

  const rawBody = await getRawBody(req);

  // ── Step 1: peek unverified payload for the resolution key ───────────────
  // No writes happen based on this peek. It only determines which secret to
  // attempt verification with. Nothing here is trusted until verification
  // succeeds below.
  // Parsed once here, reused for the rest of the request — no re-parsing
  // client_reference_id later once the event is verified.
  let tokenFromPayload: string | null = null;
  let sessionIdFromPayload: string | null = null;
  let videoIdFromPayload: string | null = null;

  try {
    const peeked = JSON.parse(rawBody.toString());
    const session = peeked?.data?.object;
    const rawRef: string = session?.client_reference_id ?? '';
    const parts = rawRef.split('__');

    tokenFromPayload = parts[0] || null;
    sessionIdFromPayload = parts[1] || null;
    videoIdFromPayload = parts[2] || null;
  } catch {
    // fall through — resolution will fail below and event will be rejected
  }

  if (!tokenFromPayload) {
    console.error('[stripe-webhook] No client_reference_id / token in payload');
    return res.status(400).json({ error: 'Unable to resolve token from payload' });
  }

  // ── Step 2: resolve token -> campaign -> user (single query for campaign) ─
  const { data: link, error: linkError } = await supabase
    .from('redirect_links')
    .select('campaign_id, video_id, organization_id')
    .eq('token', tokenFromPayload)
    .maybeSingle();

  if (linkError || !link) {
    console.error('[stripe-webhook] No redirect_links row for token:', tokenFromPayload);
    return res.status(400).json({ error: 'Unknown token — no matching campaign' });
  }

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('user_id')
    .eq('id', link.campaign_id)
    .maybeSingle();

  if (campaignError || !campaign?.user_id) {
    console.error('[stripe-webhook] No campaign/user for campaign_id:', link.campaign_id);
    return res.status(400).json({ error: 'Unable to resolve user for this campaign' });
  }

  const resolvedUserId = campaign.user_id;

  // ── Step 3: get this user's webhook secret — NO fallback ─────────────────
  const { data: stripeConfig, error: configError } = await supabase
    .from('stripe_configs')
    .select('stripe_webhook_secret')
    .eq('user_id', resolvedUserId)
    .maybeSingle();

  if (configError || !stripeConfig?.stripe_webhook_secret) {
    console.error('[stripe-webhook] No webhook secret configured for user:', resolvedUserId);
    return res.status(400).json({ error: 'User resolved but no webhook secret configured' });
  }

  const webhookSecret = stripeConfig.stripe_webhook_secret;

  // ── Step 4: verify signature ──────────────────────────────────────────────
  let event: Stripe.Event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-04-22.dahlia',
    });

    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  // ── Step 5: only checkout.session.completed is handled ───────────────────
  // Onboarding subscribes tenants to this event only. Anything else arriving
  // here is unexpected — acknowledge it so Stripe doesn't retry, but don't
  // process it.
  if (event.type !== 'checkout.session.completed') {
    console.warn('[stripe-webhook] Unexpected event type received:', event.type);
    return res.status(200).json({ received: true, ignored: true });
  }

  // ── Step 6: idempotency via upsert — no race window ───────────────────────
  // INSERT ... ON CONFLICT DO NOTHING replaces SELECT-then-INSERT. Two
  // concurrent deliveries of the same event can no longer both "see no row"
  // and both proceed — the DB resolves the conflict atomically.
  const { data: insertedEvent, error: eventLogError } = await supabase
    .from('stripe_events_log')
    .upsert(
      {
        stripe_event_id: event.id,
        event_type: event.type,
        user_id: resolvedUserId,
        campaign_id: link.campaign_id,
        organization_id: link.organization_id ?? null,
        token: tokenFromPayload,
      },
      { onConflict: 'stripe_event_id', ignoreDuplicates: true }
    )
    .select('stripe_event_id');

  if (eventLogError) {
    console.error('[stripe-webhook] Event log write failed:', eventLogError);
    return res.status(500).json({ error: 'Event log write failed' });
  }

  // ignoreDuplicates means a conflicting row returns no data — that's our
  // duplicate signal, with no race window since the check and the write are
  // the same atomic operation.
  if (!insertedEvent || insertedEvent.length === 0) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  // ── Step 7: use the already-parsed client_reference_id fields ────────────
  const session = event.data.object as Stripe.Checkout.Session;
  const token = tokenFromPayload;
  const resolvedSessionId = sessionIdFromPayload;
  // Attribution comes only from client_reference_id. redirect_links.video_id
  // is a different concept (which row this token belongs to, not which
  // video the customer actually clicked) — never used as a fallback here.
  // Empty string in the payload correctly means cold traffic -> null.
  const resolvedVideoId = videoIdFromPayload || null;

  // ── Step 8: dedup + write purchase via upsert — same race fix ────────────
  const { data: insertedPurchase, error: insertError } = await supabase
    .from('stripe_purchases')
    .upsert(
      {
        stripe_session_id: session.id,
        token,
        video_id: resolvedVideoId,
        campaign_id: link.campaign_id,
        user_id: resolvedUserId,
        session_id: resolvedSessionId,
        organization_id: link.organization_id ?? null,
        amount: session.amount_total ? session.amount_total / 100 : null,
        currency: session.currency,
        customer_email: session.customer_details?.email ?? null,
      },
      { onConflict: 'stripe_session_id', ignoreDuplicates: true }
    )
    .select('id');

  if (insertError) {
    console.error('[stripe-webhook] Purchase insert failed:', insertError);
    return res.status(500).json({ error: 'Database insert failed' });
  }

  if (!insertedPurchase || insertedPurchase.length === 0) {
    console.log('[stripe-webhook] Duplicate purchase — already recorded:', session.id);
    return res.status(200).json({ received: true, duplicate: true });
  }

  console.log(
    '[stripe-webhook] Recorded purchase —',
    'token:', token,
    'user:', resolvedUserId,
    'amount:', session.amount_total
  );

  return res.status(200).json({ received: true });
}
