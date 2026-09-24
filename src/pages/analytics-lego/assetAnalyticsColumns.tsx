// ─────────────────────────────────────────────────────────────────────────────
// assetAnalyticsTypes.ts
//
// Page-level presentation types for All Assets Analytics (and future
// composition into other asset analytics UI).
//
// Does NOT redefine engine/service DTOs from analyticsEngine,
// assetAnalyticsEngine, or getAssetAnalyticsRows.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react';
import type { MetricType } from '../../lib/analyticsEngine';

// ── Asset type taxonomy (UI badge labels only; not assets.asset_type enum) ──

export type AssetTypeTag =
  | 'campaign_element'
  | 'promotional_video'
  | 'resource'
  | 'content_video';

export const ASSET_TYPE_LABELS: Record<AssetTypeTag, string> = {
  campaign_element: 'Campaign Element',
  promotional_video: 'Promotional Video',
  resource: 'Resource',
  content_video: 'Content Video',
};

export const ASSET_TYPE_COLORS: Record<AssetTypeTag, string> = {
  campaign_element: 'bg-violet-500/10 border-violet-500/30 text-violet-400',
  promotional_video: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  resource: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
  content_video: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
};

export const ALL_ASSET_TYPES: AssetTypeTag[] = [
  'campaign_element',
  'promotional_video',
  'resource',
  'content_video',
];

// ── Filter option shapes (presentation / filter panel only) ────────────────

/** Promotion dropdown option — display fields only. */
export interface PromotionOption {
  id: string;
  name: string;
}

/**
 * Asset Campaign filter selection — OR'd multi-select.
 * Independent from the legacy Campaign filter.
 */
export type AssetCampaignSelection =
  | { type: 'all' }
  | { type: 'campaign'; id: string }
  | { type: 'owner'; ownerId: string }
  | { type: 'campaignFree' };

export interface AssetCampaignFilterOptions {
  myCampaigns: { id: string; name: string; isArchived: boolean }[];
  otherOwners: { ownerId: string; displayName: string; campaignIds: string[] }[];
  systemCampaigns: { id: string; name: string }[];
  hasCampaignFreeResources: boolean;
}

// ── Table row identity (page view model; not service AssetAnalyticsTableRow) ─

export interface AssetIdentity {
  id: string;
  title: string | undefined;
  thumbnail_url?: string;
  asset_type: AssetTypeTag;
  platform?: string | null;
  created_at?: string | null;
}

export interface PromotingVideoIdentity {
  id: string;
  title: ReactNode | undefined;
  thumbnail_url?: string;
  platform?: string | null;
  created_at?: string | null;
  content_owner_id?: string | null;
  content_owner_name?: string | null;
  content_campaign_id?: string | null;
}

/**
 * ONE ROW = ONE (asset, promoting video) PAIR for the table/cards UI.
 * Metrics use the shared MetricType keys from analyticsEngine (structural).
 */
export interface AssetAnalyticsRow {
  asset: AssetIdentity;
  promoting_video: PromotingVideoIdentity;
  campaign_id: string | null;
  /** Asset's OWN campaign provenance source — never redirect_links.campaign_id. */
  assetCampaignSource: 'video' | 'campaign_element' | 'resource' | null;
  isCampaignFreeResource: boolean;
  promotion_id: string | null;
  /** assets.organization_id — compared to viewer org for My vs Shared. */
  assetOrganizationId: string;
  /** Annotation on My; not an exclusive scope. */
  isAssigned: boolean;
  archive: {
    isArchived: boolean;
    reasons: { sourceType: string; sourceId: string; sourceName: string | null }[];
  };
  videoArchive: {
    isArchived: boolean;
  };
  campaignArchive: {
    isArchived: boolean;
  };
  promotionArchive: {
    isArchived: boolean;
  };
  /** null = not computed yet (UI shows "—"); number includes real zeros. */
  asset_clicks: number | null;
  metrics: Record<MetricType, number | string>;
}

/** Map engine asset_type → UI badge taxonomy (local labels only). */
export function toAssetTypeTag(assetType: string): AssetTypeTag {
  if (assetType === 'campaign_element') return 'campaign_element';
  if (assetType === 'resource') return 'resource';
  if (assetType === 'video') return 'promotional_video';
  return 'content_video';
}

// ── Campaign Element TYPE cell = same text WebMood 2×2 as InDepthAnalytics ──
export const WEBMOOD_LINK_TYPES = ['sales_call', 'consultation', 'newsletter', 'landing_page'] as const;
export type WebmoodLinkType = (typeof WEBMOOD_LINK_TYPES)[number];
export const WEBMOOD_CELL_META: { type: WebmoodLinkType; label: string }[] = [
  { type: 'sales_call', label: 'SALES' },
  { type: 'consultation', label: 'CONSULT' },
  { type: 'newsletter', label: 'NEWS' },
  { type: 'landing_page', label: 'PURCHASE' },
];

/** Map campaign_element_assets.element_type → WebMood cell key. */
export function elementTypeToWebmood(elementType: string | null | undefined): WebmoodLinkType | null {
  if (!elementType) return null;
  const t = elementType.toLowerCase();
  if (t === 'sales_call' || t === 'sales') return 'sales_call';
  if (t === 'consultation' || t === 'consult') return 'consultation';
  if (t === 'newsletter' || t === 'news') return 'newsletter';
  if (t === 'landing_page' || t === 'landing' || t === 'purchase' || t === 'direct_purchase')
    return 'landing_page';
  return null;
}

export function WebmoodGrid({ activeTypes }: { activeTypes: Set<string> }) {
  return (
    <div
      className="grid grid-cols-2 gap-0.5 w-[88px] h-[44px] rounded-md overflow-hidden border border-zinc-800 bg-zinc-950 shrink-0"
      title="Campaign element position (orange = this asset's element type)"
    >
      {WEBMOOD_CELL_META.map(cell => {
        const on = activeTypes.has(cell.type);
        return (
          <div
            key={cell.type}
            className={
              on
                ? 'flex items-center justify-center text-[7px] font-black tracking-wider text-orange-400 bg-orange-500/20'
                : 'flex items-center justify-center text-[7px] font-black tracking-wider text-zinc-600 bg-zinc-900/80'
            }
          >
            {cell.label}
          </div>
        );
      })}
    </div>
  );
}

/** Zero-filled 14-column metrics bag; overlay AssetMetrics onto compatible keys. */
export function toTableMetrics(
  m: AssetAnalyticsTableRow['metrics'],
  full?: AssetAnalyticsTableRow['fullMetrics'],
): Record<MetricType, number | string> {
  const base = {} as Record<MetricType, number | string>;
  for (const key of TABLE_COLUMNS) {
    base[key as MetricType] = full ? ((full as any)[key] ?? 0) : 0;
  }
  // AssetMetrics is the 5-metric vocabulary from assetAnalyticsEngine.
  // Map into the shared table columns without inventing funnel breakdowns.
  if (!full && 'total_revenue' in base) base.total_revenue = m.revenue ?? 0;
  if ('unique_clicks' in base) base.unique_clicks = m.clicks ?? 0;
  return base;
}