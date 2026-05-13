import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

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
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Missing stripe-signature header' });

  let event: Stripe.Event;

  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const token = session.client_reference_id;

  if (!token) {
    console.log('No client_reference_id on session — skipping');
    return res.status(200).json({ received: true });
  }

  // Look up the redirect link to get video_id and campaign_id
  const { data: link, error: linkError } = await supabase
    .from('redirect_links')
    .select('video_id, campaign_id')
    .eq('token', token)
    .single();

  if (linkError || !link) {
    console.error('Could not find redirect link for token:', token);
    return res.status(200).json({ received: true });
  }

  // Check for duplicate (Stripe can fire webhooks more than once)
  const { data: existing } = await supabase
    .from('stripe_purchases')
    .select('id')
    .eq('stripe_session_id', session.id)
    .single();

  if (existing) {
    console.log('Duplicate webhook — already recorded:', session.id);
    return res.status(200).json({ received: true });
  }

  // Write confirmed purchase to stripe_purchases
  const { error: insertError } = await supabase.from('stripe_purchases').insert({
    stripe_session_id: session.id,
    token,
    video_id: link.video_id,
    campaign_id: link.campaign_id,
    amount: session.amount_total ? session.amount_total / 100 : null,
    currency: session.currency,
    customer_email: session.customer_details?.email ?? null,
  });

  if (insertError) {
    console.error('Failed to insert stripe_purchase:', insertError);
    return res.status(500).json({ error: 'Database insert failed' });
  }

  console.log(`✅ Purchase recorded — token: ${token}, amount: ${session.amount_total}`);
  return res.status(200).json({ received: true });
}
