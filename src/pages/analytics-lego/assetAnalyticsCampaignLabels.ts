// ─────────────────────────────────────────────────────────────────────────────
// assetAnalyticsCampaignLabels.ts
// Pure presentation helpers for Asset / Content Campaign cells (Phase 4).
// ─────────────────────────────────────────────────────────────────────────────

import type { AssetAnalyticsRow } from './assetAnalyticsTypes';

export interface CampaignLabelMaps {
  campaignNameById: Map<string, string>;
  campaignOwnerLabelById: Map<string, string>;
  unresolvedCampaignNameById: Map<string, string>;
}

export function resolveAssetCampaignLabel(
  row: AssetAnalyticsRow,
  maps: CampaignLabelMaps,
): string {
  const { campaignNameById, campaignOwnerLabelById, unresolvedCampaignNameById } = maps;
  if (row.campaign_id) {
    return (
      campaignNameById.get(row.campaign_id) ??
      (campaignOwnerLabelById.get(row.campaign_id)
        ? `🔒 ${campaignOwnerLabelById.get(row.campaign_id)}'s Campaign`
        : unresolvedCampaignNameById.get(row.campaign_id) ?? '—')
    );
  }
  if (row.isCampaignFreeResource) {
    return 'Campaign-Free Resource Asset';
  }
  return 'No Campaign';
}

export function resolveContentCampaignLabel(
  row: AssetAnalyticsRow,
  maps: CampaignLabelMaps,
): string {
  const { campaignNameById, campaignOwnerLabelById, unresolvedCampaignNameById } = maps;
  const contentCampaignId = row.promoting_video.content_campaign_id;
  if (contentCampaignId) {
    return (
      campaignNameById.get(contentCampaignId) ??
      (campaignOwnerLabelById.get(contentCampaignId)
        ? `🔒 ${campaignOwnerLabelById.get(contentCampaignId)}'s Campaign`
        : unresolvedCampaignNameById.get(contentCampaignId) ?? 'No Campaign')
    );
  }
  return 'No Campaign';
}
