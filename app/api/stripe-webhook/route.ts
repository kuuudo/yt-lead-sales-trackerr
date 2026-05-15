import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// App Router: no `export const config` needed — raw body is available via request.arrayBuffer()

export async function POST(request: Request) {
  const sig = request.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  // Read raw body as ArrayBuffer → Buffer (required for Stripe signature verification)
  const rawBodyBuffer = await request.arrayBuffer();
  const rawBody = Buffer.from(rawBodyBuffer);

  // Peek at the payload to extract client_reference_id (the token)
  // so we can look up the right user's webhook secret.
  let tokenFromPayload: string | null = null;
  try {
    const peeked = JSON.parse(rawBody.toString());
    const session = peeked?.data?.object;
    tokenFromPayload = session?.client_reference_id ?? null;
  } catch {
    // If we can't parse, fall through to the fallback secret
  }

  // Look up the user's webhook secret via token → redirect_links → campaigns → user
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

  // Fall back to the platform-level secret (for your own account / testing)
  if (!webhookSecret) {
    webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  }

  // Now verify the webhook signature with the correct secret
  let event: Stripe.Event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-04-22.dahlia',
    });
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  console.log(`[stripe-webhook] Received event: ${event.type}`);

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const token = session.client_reference_id;

  if (!token) {
    console.log('[stripe-webhook] No client_reference_id on session — skipping');
    return NextResponse.json({ received: true });
  }

  // Look up the redirect link to get video_id and campaign_id
  const { data: link, error: linkError } = await supabase
    .from('redirect_links')
    .select('video_id, campaign_id')
    .eq('token', token)
    .single();

  if (linkError || !link) {
    console.error('[stripe-webhook] Could not find redirect link for token:', token);
    return NextResponse.json({ received: true });
  }

  // Check for duplicate (Stripe can fire webhooks more than once)
  const { data: existing } = await supabase
    .from('stripe_purchases')
    .select('id')
    .eq('stripe_session_id', session.id)
    .single();

  if (existing) {
    console.log('[stripe-webhook] Duplicate webhook — already recorded:', session.id);
    return NextResponse.json({ received: true });
  }

  // Write confirmed purchase to stripe_purchases
  const { error: insertError } = await supabase.from('stripe_purchases').insert({
    stripe_session_id: session.id,
    token,
    video_id: link.video_id,
    campaign_id: link.campaign_id,
    user_id: resolvedUserId,
    amount: session.amount_total ? session.amount_total / 100 : null,
    currency: session.currency,
    customer_email: session.customer_details?.email ?? null,
  });

  if (insertError) {
    console.error('[stripe-webhook] Failed to insert stripe_purchase:', insertError);
    return NextResponse.json({ error: 'Database insert failed' }, { status: 500 });
  }

  console.log(`[stripe-webhook] ✅ Purchase recorded — token: ${token}, user: ${resolvedUserId}, amount: ${session.amount_total}`);
  return NextResponse.json({ received: true });
}
