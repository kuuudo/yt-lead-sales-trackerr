/**
 * Canonical Asset Click definition — exact AllAssets behavior from
 * assetAnalyticsEngine.computeAssetMetrics:
 *
 *   clicks = events.filter(
 *     e => e.event_type != null && CLICK_EVENT_TYPES.has(e.event_type)
 *   ).length
 *
 * - Uses CLICK_EVENT_MAP values (same set as AllAssets)
 * - NO event.id dedupe (raw row count)
 * - NO session dedupe for clicks
 * - Does NOT require asset_id / video_id inside this function
 *   (caller scopes events first: asset, and optionally video for pair grain)
 * - activeSource / purchases do NOT affect the count
 *
 * AllAssets and AllPromotions must both call this. Do not reintroduce a
 * second interpretation (e.g. id-deduped helpers).
 */

import { CLICK_EVENT_MAP } from './analyticsEngine';

const CLICK_EVENT_TYPES: Set<string> = new Set(
  Object.values(CLICK_EVENT_MAP).flatMap(types => types),
);

export type AssetClickEventInput = {
  event_type?: string | null;
  asset_id?: string | null;
  video_id?: string | null;
  id?: string;
};

export type AssetClickScope = {
  /** When set, only events with this asset_id are counted. */
  assetId?: string | null;
  /** When set, only events with this video_id are counted (pair grain). */
  videoId?: string | null;
};

function matchesScope(
  e: AssetClickEventInput,
  scope?: AssetClickScope,
): boolean {
  if (!scope) return true;
  if (scope.assetId != null && scope.assetId !== '' && e.asset_id !== scope.assetId) {
    return false;
  }
  if (scope.videoId != null && scope.videoId !== '' && e.video_id !== scope.videoId) {
    return false;
  }
  return true;
}

/**
 * Canonical Asset Click count — AllAssets computeAssetMetrics clicks line.
 */
export function countAssetClicks(
  events: AssetClickEventInput[],
  scope?: AssetClickScope,
): number {
  return events.filter(
    e =>
      matchesScope(e, scope) &&
      e.event_type != null &&
      CLICK_EVENT_TYPES.has(e.event_type),
  ).length;
}

/**
 * Per-asset breakdown using the SAME filter as countAssetClicks (no id dedupe).
 * sum(values) === countAssetClicks(events, scope without assetId lock) when
 * every counted event has a non-null asset_id.
 */
export function countAssetClicksByAssetId(
  events: AssetClickEventInput[],
  scope?: Omit<AssetClickScope, 'assetId'>,
): Map<string, number> {
  const byAsset = new Map<string, number>();
  for (const e of events) {
    if (!matchesScope(e, scope)) continue;
    if (e.event_type == null || !CLICK_EVENT_TYPES.has(e.event_type)) continue;
    if (!e.asset_id) continue;
    byAsset.set(e.asset_id, (byAsset.get(e.asset_id) ?? 0) + 1);
  }
  return byAsset;
}
