// src/services/attribution/resolveBridgeAttribution.ts
//
// Given a bridge_token from an outbound event (Video A -> Asset/Video B
// click), find the later Video B VSTRK session it most plausibly
// connects to. Read-only, no new tables, no journey_id.

import { supabase } from '../../lib/supabase';

const ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days, adjust as needed

export interface BridgeAttributionResult {
  bridgeToken: string;
  sourceVideoId: string;
  targetAssetId: string;
  targetVideoId: string | null;
  outboundAt: string;
  candidateSessionId: string | null;
  candidateFirstEventAt: string | null;
  competingBridgeCount: number;
  confidence: 'high' | 'low' | 'none';
}

export async function resolveBridgeAttribution(
  bridgeToken: string
): Promise<BridgeAttributionResult | null> {
  // 1. The outbound bridge event itself.
  const { data: outbound, error: outboundErr } = await supabase
    .from('events')
    .select('video_id, asset_id, created_at')
    .eq('bridge_token', bridgeToken)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (outboundErr || !outbound || !outbound.asset_id) return null;

  const { video_id: sourceVideoId, asset_id: targetAssetId, created_at: outboundAt } = outbound;

  // 2. Resolve target asset -> the actual Video B row.
  const { data: targetVideo, error: targetVideoErr } = await supabase
    .from('videos')
    .select('id')
    .eq('asset_id', targetAssetId)
    .maybeSingle();

  if (targetVideoErr || !targetVideo) {
    return {
      bridgeToken,
      sourceVideoId,
      targetAssetId,
      targetVideoId: null,
      outboundAt,
      candidateSessionId: null,
      candidateFirstEventAt: null,
      competingBridgeCount: 0,
      confidence: 'none',
    };
  }

  const windowEnd = new Date(
    new Date(outboundAt).getTime() + ATTRIBUTION_WINDOW_MS
  ).toISOString();

  // 3. Earliest Video B session activity after the outbound click.
  const { data: laterEvents, error: laterErr } = await supabase
    .from('events')
    .select('session_id, created_at')
    .eq('video_id', targetVideo.id)
    .gt('created_at', outboundAt)
    .lte('created_at', windowEnd)
    .order('created_at', { ascending: true })
    .limit(1);

  const candidate = laterErr ? null : laterEvents?.[0] ?? null;

  // 4. Competing bridges: other outbound bridges to the SAME target asset
  //    inside the same window. If more than this one exists, don't force it.
  const { count: competingCount } = await supabase
    .from('events')
    .select('bridge_token', { count: 'exact', head: true })
    .eq('asset_id', targetAssetId)
    .not('bridge_token', 'is', null)
    .neq('bridge_token', bridgeToken)
    .gte('created_at', outboundAt)
    .lte('created_at', windowEnd);

  const competingBridgeCount = competingCount ?? 0;

  const confidence: BridgeAttributionResult['confidence'] =
    !candidate ? 'none' : competingBridgeCount === 0 ? 'high' : 'low';

  return {
    bridgeToken,
    sourceVideoId,
    targetAssetId,
    targetVideoId: targetVideo.id,
    outboundAt,
    candidateSessionId: candidate?.session_id ?? null,
    candidateFirstEventAt: candidate?.created_at ?? null,
    competingBridgeCount,
    confidence,
  };
}