import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export const config = {
  api: { bodyParser: true },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow CORS — the pixel fires from the user's own website domain
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, video_id, campaign_id, event_type, amount } = req.body;

  if (!token && !video_id) {
    return res.status(400).json({ error: 'Missing token or video_id' });
  }

  // Resolve user_id from token → redirect_links → campaigns
  let resolvedVideoId = video_id;
  let resolvedCampaignId = campaign_id;
  let resolvedUserId: string | null = null;

  if (token) {
    const { data: link } = await supabase
      .from('redirect_links')
      .select('video_id, campaign_id')
      .eq('token', token)
      .single();

    if (link) {
      resolvedVideoId = link.video_id;
      resolvedCampaignId = link.campaign_id;
    }
  }

  if (resolvedCampaignId) {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('user_id, offer_price')
      .eq('id', resolvedCampaignId)
      .single();

    if (campaign) {
      resolvedUserId = campaign.user_id;
      // If no amount provided, use the campaign's offer price
      if (!amount && campaign.offer_price) {
        req.body.amount = campaign.offer_price;
      }
    }
  }

  const finalAmount = amount ?? req.body.amount ?? null;
  const finalEventType = event_type ?? 'purchase';

  // Insert into pixel_purchases for confirmed revenue
  const { error: purchaseError } = await supabase
    .from('pixel_purchases')
    .insert({
      token: token ?? null,
      video_id: resolvedVideoId ?? null,
      campaign_id: resolvedCampaignId ?? null,
      user_id: resolvedUserId,
      amount: finalAmount,
    });

  if (purchaseError) {
    console.error('Failed to insert pixel_purchase:', purchaseError);
    return res.status(500).json({ error: 'Database insert failed' });
  }

  // Also log as an event for funnel tracking
  if (resolvedVideoId && resolvedCampaignId) {
    // Try to find existing session for this video in recent window (1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: session } = await supabase
      .from('sessions')
      .select('id')
      .eq('video_id', resolvedVideoId)
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (session) {
      await supabase.from('events').insert({
        session_id: session.id,
        video_id: resolvedVideoId,
        campaign_id: resolvedCampaignId,
        event_type: finalEventType,
        value: finalAmount,
      });
    }
  }

  console.log(`✅ Pixel purchase recorded — token: ${token}, video: ${resolvedVideoId}, amount: ${finalAmount}`);
  return res.status(200).json({ received: true });
}
