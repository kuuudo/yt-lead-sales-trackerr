/**
 * src/services/redirect/getPromotedAssetDisplay.ts
 *
 * UI-only. Does not touch redirect generation logic (beyond reading its
 * output), analytics, or createPromotion.ts.
 *
 *   getRedirectLinksDisplay()  — VideoDetail.tsx's Tracking Links section
 *                                 AND Videos.tsx's "Video Saved" modal
 *                                 (same grouped shape, both call sites)
 *   getVideoPromotionBadges()  — Videos.tsx's video list badges
 *
 * Output shape is GROUPED, not a flat card list:
 *   { campaignLinks: [...], assets: [...] }
 * "Campaign Links" = the video's own campaign redirects (asset_id null),
 * one row per link_type. "Assets" = one row per promoted asset (My /
 * Shared / Assigned), asset type shown as an expand-only field rather
 * than a separate section — creators care "what do I paste," not "which
 * internal bucket is this asset in."
 *
 * Thank-you and checkout link_types are filtered out of DISPLAY here
 * regardless of what's already in redirect_links — createVideo.ts (via
 * buildCampaignRedirectJobs) no longer generates them going forward, but
 * existing rows from before that change must not resurface in the UI.
 *
 * Reuses existing services rather than re-querying tables directly:
 *   - getAssetDetail()               → title + platform/resource/element subtitle
 *   - getAssetSharingInfo()          → Shared By + Assignment name (Shared category)
 *   - getAssignedAssetSummaryForOwner() → which of the viewer's own assets are assigned out
 */

import { supabase } from '../../lib/supabase';
import { getAssetDetail } from '../asset/getAssetDetail';
import { getAssetSharingInfo } from '../asset/getAssetSharingInfo';
import { getAssignedAssetSummaryForOwner } from '../asset/getAssignedAssetSummaryForOwner';
import { getElementTypeLabel, type CampaignElementType } from '../../lib/videoFormatters';

export type PromotedAssetCategory = 'library' | 'shared' | 'assigned';

// Link types that must NEVER appear in this UI — pixel-tracked
// confirmation endpoints and the campaign-level checkout, not things a
// creator ever pastes into a video description. Applies regardless of
// whether older rows in redirect_links still have these types.
const EXCLUDED_LINK_TYPES = new Set([
  'purchase_thankyou',
  'newsletter_thankyou',
  'sales_call_thankyou',
  'consultation_thankyou',
  'checkout',
]);

export const CATEGORY_LABEL: Record<PromotedAssetCategory, { icon: string; label: string }> = {
  library: { icon: '🟢', label: 'My Asset' },
  shared: { icon: '🔵', label: 'Shared Asset' },
  assigned: { icon: '🟣', label: 'Assigned Asset' },
};

export const CATEGORY_COLOR: Record<PromotedAssetCategory, string> = {
  library: 'text-green-500',
  shared: 'text-blue-500',
  assigned: 'text-purple-500',
};

const CAMPAIGN_LINK_ICON: Record<string, string> = {
  landing_page: '🏠',
  newsletter: '📧',
  consultation: '💼',
  sales_call: '📞',
  lead_magnet: '🎁',
};

const CAMPAIGN_LINK_LABEL: Record<string, string> = {
  landing_page: 'Landing Page',
  newsletter: 'Newsletter',
  consultation: 'Consultation',
  sales_call: 'Sales Call',
  lead_magnet: 'Lead Magnet',
};

function platformLabel(platform: string | null): string | null {
  if (!platform) return null;
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

// ---------------------------------------------------------------------------
// Shared categorization rule
// ---------------------------------------------------------------------------

export function categorizeAsset({
  assetOrganizationId,
  viewerOrganizationId,
  isAssignedOut,
}: {
  assetOrganizationId: string | null;
  viewerOrganizationId: string;
  isAssignedOut: boolean;
}): PromotedAssetCategory {
  if (assetOrganizationId !== viewerOrganizationId) return 'shared';
  return isAssignedOut ? 'assigned' : 'library';
}

// ---------------------------------------------------------------------------
// getRedirectLinksDisplay — VideoDetail.tsx + Videos.tsx "Video Saved" modal
// ---------------------------------------------------------------------------

export interface CampaignLinkRow {
  key: string; // token
  icon: string;
  label: string;
  token: string;
  destinationUrl: string;
  trackingHostname: string | null;
}

export interface AssetLinkRow {
  key: string; // token
  category: PromotedAssetCategory;
  title: string;
  subtitle: string | null;
  token: string;
  destinationUrl: string;
  trackingHostname: string | null;
  more: {
    owner?: string;
    assignment?: string;
    sharedBy?: string;
    created?: string;
    usedByVideoCount: number;
  };
}

// Single source of truth for "what URL do I show/copy for this token" —
// every call site should use this instead of hardcoding
// window.location.origin, so the custom-domain fallback logic lives in
// exactly one place.
export function buildTrackingLinkUrl(token: string, trackingHostname: string | null): string {
  if (trackingHostname) {
    return `https://${trackingHostname}/${token}`;
  }
  return `${window.location.origin}/${token}`;
}

export interface RedirectLinksDisplayGroups {
  campaignLinks: CampaignLinkRow[];
  assets: AssetLinkRow[];
}

export interface GetRedirectLinksDisplayInput {
  videoId: string;
  viewerOrganizationId: string;
  viewerUserId: string;
}

export async function getRedirectLinksDisplay({
  videoId,
  viewerOrganizationId,
  viewerUserId,
}: GetRedirectLinksDisplayInput): Promise<RedirectLinksDisplayGroups> {
  // Own org's name is always readable under RLS — no cross-org concern here.
  const { data: orgRow } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', viewerOrganizationId)
    .maybeSingle();
  const viewerOrganizationName = orgRow?.name ?? 'Your Organization';

  const { data: linkRows, error: linkErr } = await supabase
    .from('redirect_links')
    .select('token, link_type, destination_url, asset_id, campaign_id, created_at, tracking_hostname')
    .eq('video_id', videoId)
    .order('created_at', { ascending: true });

  if (linkErr) {
    throw new Error(`Failed to load redirect links: ${linkErr.message}`);
  }

  const rows = (linkRows ?? []).filter(r => !EXCLUDED_LINK_TYPES.has(r.link_type));
  const campaignRows = rows.filter(r => !r.asset_id);
  const assetRows = rows.filter(r => r.asset_id);

  const campaignLinks: CampaignLinkRow[] = campaignRows.map(r => ({
    key: r.token,
    icon: CAMPAIGN_LINK_ICON[r.link_type] ?? '🔗',
    label: CAMPAIGN_LINK_LABEL[r.link_type] ?? r.link_type,
    token: r.token,
    destinationUrl: r.destination_url,
    trackingHostname: r.tracking_hostname ?? null,
  }));

  // ---- Asset-driven rows: resolve per distinct asset_id ----
  const assetIds = Array.from(new Set(assetRows.map(r => r.asset_id as string)));

  const assignedSummary = await getAssignedAssetSummaryForOwner(viewerUserId);
  const assignedOutIds = new Set(assignedSummary.map(s => s.assetId));

  // "Used by N videos" — distinct video_id count per asset_id, across ALL
  // of this asset's redirect_links, not just this video's. Same source
  // of truth (redirect_links) as everything else here, no new table.
  const usedByCountByAssetId = new Map<string, number>();
  if (assetIds.length > 0) {
    const { data: usageRows } = await supabase
      .from('redirect_links')
      .select('asset_id, video_id')
      .in('asset_id', assetIds);
    const videoSetByAsset = new Map<string, Set<string>>();
    (usageRows ?? []).forEach((row: any) => {
      if (!videoSetByAsset.has(row.asset_id)) videoSetByAsset.set(row.asset_id, new Set());
      videoSetByAsset.get(row.asset_id)!.add(row.video_id);
    });
    videoSetByAsset.forEach((videoSet, assetId) => usedByCountByAssetId.set(assetId, videoSet.size));
  }

  // Assignment name lookup, scoped to the viewer's own created Assignments —
  // only needed for the 'assigned' category (own asset, assigned out).
  const { data: myAssignmentRows } = await supabase
    .from('assignments')
    .select('id, title')
    .eq('created_by_user_id', viewerUserId);
  const myAssignmentTitleById = new Map((myAssignmentRows ?? []).map((a: any) => [a.id, a.title]));

  const assetContextById = new Map<
    string,
    { title: string; subtitle: string | null; organizationId: string | null; createdAt: string | null }
  >();
  const assignmentNameByAssetId = new Map<string, string>();
  const sharedByNameByAssetId = new Map<string, string>();
  const sharedAssignmentNameByAssetId = new Map<string, string>();

  await Promise.all(
    assetIds.map(async (assetId) => {
      const detail = await getAssetDetail(assetId);
      if (!detail) return;

      const { asset, resource } = detail;
      const subtitle =
        resource?.origin === 'campaign_element'
          ? getElementTypeLabel((resource.resourceType ?? 'landing_page') as CampaignElementType)
          : platformLabel(resource?.platform ?? null);

      assetContextById.set(assetId, {
        title: resource?.title ?? 'Untitled Asset',
        subtitle,
        organizationId: (asset as any).organization_id ?? null,
        createdAt: (asset as any).created_at ?? null,
      });

      const isOwnOrg = (asset as any).organization_id === viewerOrganizationId;

      if (isOwnOrg && assignedOutIds.has(assetId)) {
        const { data: aaRows } = await supabase
          .from('assignment_assets')
          .select('assignment_id')
          .eq('asset_id', assetId);
        const matchingAssignmentId = (aaRows ?? []).find((r: any) =>
          myAssignmentTitleById.has(r.assignment_id)
        )?.assignment_id;
        if (matchingAssignmentId) {
          assignmentNameByAssetId.set(assetId, myAssignmentTitleById.get(matchingAssignmentId)!);
        }
      }

      if (!isOwnOrg) {
        const sharingInfo = await getAssetSharingInfo(assetId, viewerUserId);
        const first = sharingInfo.assignments[0];
        if (first) {
          sharedByNameByAssetId.set(assetId, first.sharedBy.name);
          sharedAssignmentNameByAssetId.set(assetId, first.assignmentTitle);
        }
      }
    })
  );

  const assetLinkRows: AssetLinkRow[] = assetRows.map(r => {
    const assetId = r.asset_id as string;
    const ctx = assetContextById.get(assetId);
    const category = categorizeAsset({
      assetOrganizationId: ctx?.organizationId ?? null,
      viewerOrganizationId,
      isAssignedOut: assignedOutIds.has(assetId),
    });

    const more: AssetLinkRow['more'] = {
      created: ctx?.createdAt ?? undefined,
      usedByVideoCount: usedByCountByAssetId.get(assetId) ?? 0,
    };
    if (category === 'library') {
      more.owner = viewerOrganizationName;
    } else if (category === 'assigned') {
      more.owner = viewerOrganizationName;
      const assignmentName = assignmentNameByAssetId.get(assetId);
      if (assignmentName) more.assignment = assignmentName;
    } else if (category === 'shared') {
      // No cross-org "owner" — RLS blocks org name lookup for other orgs.
      const sharedBy = sharedByNameByAssetId.get(assetId);
      if (sharedBy) more.sharedBy = sharedBy;
      const assignmentName = sharedAssignmentNameByAssetId.get(assetId);
      if (assignmentName) more.assignment = assignmentName;
    }

    return {
      key: r.token,
      category,
      title: ctx?.title ?? 'Untitled Asset',
      subtitle: ctx?.subtitle ?? null,
      token: r.token,
      destinationUrl: r.destination_url,
      trackingHostname: r.tracking_hostname ?? null,
      more,
    };
  });

  // Stable, predictable order: library, shared, assigned.
  const CATEGORY_SORT: PromotedAssetCategory[] = ['library', 'shared', 'assigned'];
  const assets = assetLinkRows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const diff = CATEGORY_SORT.indexOf(a.row.category) - CATEGORY_SORT.indexOf(b.row.category);
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map(({ row }) => row);

  return { campaignLinks, assets };
}

// ---------------------------------------------------------------------------
// getVideoPromotionBadges — Videos.tsx list badges (unchanged from before)
// ---------------------------------------------------------------------------

export interface GetVideoPromotionBadgesInput {
  videoIds: string[];
  viewerOrganizationId: string;
  viewerUserId: string;
}

export type VideoPromotionBadgeMap = Map<string, Partial<Record<PromotedAssetCategory, number>>>;

export async function getVideoPromotionBadges({
  videoIds,
  viewerOrganizationId,
  viewerUserId,
}: GetVideoPromotionBadgesInput): Promise<VideoPromotionBadgeMap> {
  const result: VideoPromotionBadgeMap = new Map();
  if (videoIds.length === 0) return result;

  const { data: linkRows, error } = await supabase
    .from('redirect_links')
    .select('video_id, asset_id')
    .in('video_id', videoIds)
    .not('asset_id', 'is', null);

  if (error) {
    console.error('[getVideoPromotionBadges] Failed to load redirect_links:', error.message);
    return result;
  }

  const rows = linkRows ?? [];
  const assetIds = Array.from(new Set(rows.map(r => r.asset_id as string)));
  if (assetIds.length === 0) return result;

  const { data: assetRows } = await supabase
    .from('assets')
    .select('id, organization_id')
    .in('id', assetIds);
  const orgByAssetId = new Map((assetRows ?? []).map((a: any) => [a.id, a.organization_id]));

  const assignedSummary = await getAssignedAssetSummaryForOwner(viewerUserId);
  const assignedOutIds = new Set(assignedSummary.map(s => s.assetId));

  for (const row of rows) {
    const assetId = row.asset_id as string;
    const category = categorizeAsset({
      assetOrganizationId: orgByAssetId.get(assetId) ?? null,
      viewerOrganizationId,
      isAssignedOut: assignedOutIds.has(assetId),
    });

    const existing = result.get(row.video_id) ?? {};
    existing[category] = (existing[category] ?? 0) + 1;
    result.set(row.video_id, existing);
  }

  return result;
}
