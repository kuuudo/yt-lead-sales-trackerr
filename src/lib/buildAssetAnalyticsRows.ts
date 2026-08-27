// ─────────────────────────────────────────────────────────────────────────────
// src/lib/buildAssetAnalyticsRows.ts
//
// PURPOSE: row-identity / attribution-scope layer for AllAssetsAnalytics.
// Answers exactly one question: given a set of redirect_links rows (already
// scoped to one organization by the caller — see PRECONDITION below), which
// (video_id, asset_id) pairs exist, and which rows are "own campaign"
// (asset_id IS NULL) vs "asset-promoting" (asset_id IS NOT NULL)?
//
// Does NOT calculate clicks, revenue, conversions, or RPC — that's the next
// layer's job, reusing the existing generic click/revenue mechanism already
// confirmed in ASSET_ANALYTICS_DESIGN.md §2 (CLICK_EVENT_MAP /
// mapLinkTypeToRevenueType, both from analyticsEngine.ts — untouched here).
//
// Does NOT classify assets.asset_type (Type 1 / 2 / 3) — that's the existing
// asset classification logic's job, consumed downstream by whichever engine
// wires this into AllAssetsAnalytics.tsx. This file only ever asks "is
// asset_id null or not", never "what kind of asset is this".
//
// PRECONDITION: `redirectLinks` must already be scoped to a single
// organization_id before calling this function. Real sample data shows the
// same video_id can legitimately appear under different campaign_id /
// organization_id pairs (see ASSET_ANALYTICS_DESIGN.md), so grouping
// unscoped cross-org input by (video_id, asset_id) alone could blend two
// orgs' activity into one row. This function does not defend against that —
// it assumes the caller already established the org boundary, same as the
// locked Promotion Analytics architecture.
// ─────────────────────────────────────────────────────────────────────────────

export interface RedirectLinkAttributionRow {
  id: string;
  token: string;
  video_id: string;
  campaign_id: string;
  link_type: string;
  asset_id: string | null;
  promotion_id: string | null;
  organization_id: string | null;
  tracking_hostname: string | null;
  created_at: string;
}

export interface AssetAnalyticsRowIdentity {
  video_id: string;
  asset_id: string; // never null in this bucket
  // Every redirect_links row belonging to this pair — raw, unfiltered.
  // Multiple link_types for the same (video_id, asset_id) collapse into
  // ONE identity here, per your explicit instruction — the individual
  // rows are preserved for whatever computes KPIs next, not discarded.
  redirectLinks: RedirectLinkAttributionRow[];
  linkTypes: string[];   // distinct link_type values seen, informational
  campaignIds: string[]; // distinct campaign_id values seen, informational —
                          // length > 1 here would be a real anomaly worth
                          // investigating, not something this file resolves
  promotionIds: string[]; // distinct non-null promotion_id values seen
}

export interface OwnCampaignRowIdentity {
  video_id: string;
  redirectLinks: RedirectLinkAttributionRow[];
}

export interface BuildAssetAnalyticsRowsResult {
  assetAnalyticsRows: AssetAnalyticsRowIdentity[];
  ownCampaignRows: OwnCampaignRowIdentity[];
  // Rows with no video_id (shouldn't exist per the RedirectLink type being
  // non-nullable on video_id, but real data can violate a TS type) — kept
  // visible rather than silently dropped.
  unclassified: RedirectLinkAttributionRow[];
}

export function buildAssetAnalyticsRows(
  redirectLinks: RedirectLinkAttributionRow[]
): BuildAssetAnalyticsRowsResult {
  const assetGroups = new Map<string, AssetAnalyticsRowIdentity>();
  const ownGroups = new Map<string, OwnCampaignRowIdentity>();
  const unclassified: RedirectLinkAttributionRow[] = [];

  for (const link of redirectLinks) {
    if (!link.video_id) {
      unclassified.push(link);
      continue;
    }

    if (link.asset_id) {
      const key = `${link.video_id}::${link.asset_id}`;
      let group = assetGroups.get(key);
      if (!group) {
        group = {
          video_id: link.video_id,
          asset_id: link.asset_id,
          redirectLinks: [],
          linkTypes: [],
          campaignIds: [],
          promotionIds: [],
        };
        assetGroups.set(key, group);
      }
      group.redirectLinks.push(link);
      if (!group.linkTypes.includes(link.link_type)) group.linkTypes.push(link.link_type);
      if (link.campaign_id && !group.campaignIds.includes(link.campaign_id)) {
        group.campaignIds.push(link.campaign_id);
      }
      if (link.promotion_id && !group.promotionIds.includes(link.promotion_id)) {
        group.promotionIds.push(link.promotion_id);
      }
    } else {
      let group = ownGroups.get(link.video_id);
      if (!group) {
        group = { video_id: link.video_id, redirectLinks: [] };
        ownGroups.set(link.video_id, group);
      }
      group.redirectLinks.push(link);
    }
  }

  return {
    assetAnalyticsRows: Array.from(assetGroups.values()),
    ownCampaignRows: Array.from(ownGroups.values()),
    unclassified,
  };
}