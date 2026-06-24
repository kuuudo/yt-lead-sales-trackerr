import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

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

  // Peek at payload to extract client_reference_id (token)
  // so we can look up the right user's webhook secret.
  let tokenFromPayload: string | null = null;
  try {
    const peeked = JSON.parse(rawBody.toString());
    const session = peeked?.data?.object;
    // Support composite format "{token}:{session_id}" — extract token portion only
    const raw = session?.client_reference_id ?? null;
    tokenFromPayload = raw?.includes('__') ? raw.split('__')[0] : raw;
  } catch {
    // fall through to platform secret
  }

  // Look up user's webhook secret via token → redirect_links → campaigns → stripe_configs
  let webhookSecret: string | null = null;
  let resolvedUserId: string | null = null;

  if (tokenFromPayload) {
    const { data: link } = await supabase
      .from('redirect_links')
      .select('campaign_id, video_id')
      .eq('token', tokenFromPayload)
      .single();

    if (link) {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('user_id')
        .eq('id', link.campaign_id)
        .single();

      if (campaign?.user_id) {
        resolvedUserId = campaign.user_id;

        const { data: stripeConfig } = await supabase
          .from('stripe_configs')
          .select('stripe_webhook_secret')
          .eq('user_id', campaign.user_id)
          .single();

        webhookSecret = stripeConfig?.stripe_webhook_secret ?? null;
      }
    }
  }

  // Fall back to platform-level secret
  if (!webhookSecret) {
    webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  }

  // Verify webhook signature
  let event: Stripe.Event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-04-30.basil',
    });
    console.log(
  "[stripe-webhook]",
  "token:",
  tokenFromPayload,
  "resolvedUser:",
  resolvedUserId,
  "usingCreatorSecret:",
  !!resolvedUserId,
  "secretPrefix:",
  webhookSecret?.substring(0, 12)
);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('[stripe-webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  console.log(`[stripe-webhook] Received event: ${event.type}`);

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;

  // Parse composite client_reference_id: "{token}__{session_id}__{video_id}"
  // Falls back gracefully to legacy token__session_id or plain token formats.
  // video_id segment may be empty string for direct/cold traffic — treated as null.
  const rawRef = session.client_reference_id ?? '';
  const parts = rawRef.split('__');
  const token = parts[0] || null;
  const resolvedSessionId: string | null = parts[1] || null;
  const resolvedVideoId: string | null = parts[2] || null;

  if (!token) {
    console.log('[stripe-webhook] No client_reference_id — skipping');
    return res.status(200).json({ received: true });
  }

  console.log('[stripe-webhook] parsed ref — token:', token, '| session_id:', resolvedSessionId, '| video_id:', resolvedVideoId);

  // Look up redirect link via token → campaign_id
  const { data: link, error: linkError } = await supabase
    .from('redirect_links')
    .select('video_id, campaign_id, organization_id')
    .eq('token', token)
    .single();

  if (linkError || !link) {
    console.error('[stripe-webhook] No redirect link for token:', token);
    return res.status(200).json({ received: true });
  }

  // video_id comes directly from composite — no events table lookup.
  // NULL is honest for direct/cold traffic. Wrong video from events is not acceptable.

  // Re-resolve user_id from the verified token (pre-verification lookup may have been skipped)
  if (!resolvedUserId) {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('user_id')
      .eq('id', link.campaign_id)
      .single();
    resolvedUserId = campaign?.user_id ?? null;
  }

  // Deduplicate
  const { data: existing } = await supabase
    .from('stripe_purchases')
    .select('id')
    .eq('stripe_session_id', session.id)
    .single();

  if (existing) {
    console.log('[stripe-webhook] Duplicate — already recorded:', session.id);
    return res.status(200).json({ received: true });
  }

  // Insert purchase
  const { error: insertError } = await supabase.from('stripe_purchases').insert({
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
  });

  if (insertError) {
    console.error('[stripe-webhook] Insert failed:', insertError);
    return res.status(500).json({ error: 'Database insert failed' });
  }

  console.log(`[stripe-webhook] ✅ Recorded — token: ${token}, session: ${resolvedSessionId}, video: ${resolvedVideoId}, user: ${resolvedUserId}, amount: ${session.amount_total}`);
  return res.status(200).json({ received: true });
}
