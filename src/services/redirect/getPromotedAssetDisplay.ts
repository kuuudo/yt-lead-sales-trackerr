/**
 * src/services/redirect/getPromotedAssetDisplay.ts
 *
 * UI-only. Does not touch redirect generation, analytics, or
 * createPromotion.ts — purely resolves existing redirect_links rows into
 * display-ready shapes for two call sites:
 *
 *   getRedirectLinksDisplay()  — VideoDetail.tsx's Tracking Links section
 *   getVideoPromotionBadges()  — Videos.tsx's video list badges
 *
 * Both share one categorization rule (categorizeAsset). Source of truth
 * for "does this video promote this asset" remains redirect_links
 * (video_id, asset_id) — nothing here is stored, everything is derived.
 *
 * Reuses existing services rather than re-querying tables directly:
 *   - getAssetDetail()               → title + platform/resource/element subtitle
 *   - getAssetSharingInfo()          → Shared By + Assignment name (Shared category)
 *   - getAssignedAssetSummaryForOwner() → which of the viewer's own assets are assigned out
 *
 * Category ordering is fixed everywhere: campaign, library, shared, assigned.
 */

import { supabase } from '../../lib/supabase';
import { getAssetDetail } from '../asset/getAssetDetail';
import { getAssetSharingInfo } from '../asset/getAssetSharingInfo';
import { getAssignedAssetSummaryForOwner } from '../asset/getAssignedAssetSummaryForOwner';
import { getElementTypeLabel, type CampaignElementType } from '../../lib/videoFormatters';

export type PromotedAssetCategory = 'campaign' | 'library' | 'shared' | 'assigned';

export const CATEGORY_ORDER: PromotedAssetCategory[] = ['campaign', 'library', 'shared', 'assigned'];

export const CATEGORY_LABEL: Record<PromotedAssetCategory, string> = {
  campaign: '📁 Campaign',
  library: '🟢 Library Asset',
  shared: '🔵 Shared Asset',
  assigned: '🟣 Assigned Asset',
};

const CAMPAIGN_LINK_TYPE_LABEL: Record<string, string> = {
  landing_page: 'Landing Page',
  newsletter: 'Newsletter',
  newsletter_thankyou: 'Newsletter Thank You',
  checkout: 'Checkout',
  purchase_thankyou: 'Purchase Thank You',
  sales_call: 'Sales Call',
  sales_call_thankyou: 'Sales Call Thank You',
  consultation: 'Consultation',
  consultation_thankyou: 'Consultation Thank You',
  lead_magnet: 'Lead Magnet',
};

function platformLabel(platform: string | null): string | null {
  if (!platform) return null;
  return platform.charAt(0).toUpperCase() + platform.slice(1);
}

// ---------------------------------------------------------------------------
// Shared categorization rules
// ---------------------------------------------------------------------------

function categorizeAsset({
  assetOrganizationId,
  viewerOrganizationId,
  isAssignedOut,
}: {
  assetOrganizationId: string | null;
  viewerOrganizationId: string;
  isAssignedOut: boolean;
}): 'library' | 'shared' | 'assigned' {
  if (assetOrganizationId !== viewerOrganizationId) return 'shared';
  return isAssignedOut ? 'assigned' : 'library';
}

// ---------------------------------------------------------------------------
// getRedirectLinksDisplay — VideoDetail.tsx
// ---------------------------------------------------------------------------

export interface RedirectLinkDisplayCard {
  key: string; // redirect token — always unique
  category: PromotedAssetCategory;
  title: string;
  /** Small source hint: platform (YouTube/TikTok/...), element type, or campaign link type. */
  subtitle: string | null;
  token: string;
  destinationUrl: string;
  more: {
    owner?: string;
    assignment?: string;
    sharedBy?: string;
    created?: string;
  };
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
}: GetRedirectLinksDisplayInput): Promise<RedirectLinkDisplayCard[]> {
  // Own org's name is always readable under RLS — no cross-org concern here.
  const { data: orgRow } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', viewerOrganizationId)
    .maybeSingle();
  const viewerOrganizationName = orgRow?.name ?? 'Your Organization';

  const { data: linkRows, error: linkErr } = await supabase
    .from('redirect_links')
    .select('token, link_type, destination_url, asset_id, campaign_id, created_at')
    .eq('video_id', videoId)
    .order('created_at', { ascending: true });

  if (linkErr) {
    throw new Error(`Failed to load redirect links: ${linkErr.message}`);
  }

  const rows = linkRows ?? [];
  const campaignRows = rows.filter(r => !r.asset_id);
  const assetRows = rows.filter(r => r.asset_id);

  // ---- Campaign name lookup (only for the video's own, asset_id-null rows) ----
  const campaignIds = Array.from(new Set(campaignRows.map(r => r.campaign_id)));
  const campaignNames = new Map<string, string>();
  if (campaignIds.length > 0) {
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, campaign_name')
      .in('id', campaignIds);
    (campaigns ?? []).forEach((c: any) => campaignNames.set(c.id, c.campaign_name));
  }

  const campaignCards: RedirectLinkDisplayCard[] = campaignRows.map(r => ({
    key: r.token,
    category: 'campaign',
    title: campaignNames.get(r.campaign_id) ?? 'Untitled Campaign',
    subtitle: CAMPAIGN_LINK_TYPE_LABEL[r.link_type] ?? r.link_type,
    token: r.token,
    destinationUrl: r.destination_url,
    more: {
      owner: viewerOrganizationName,
      created: r.created_at,
    },
  }));

  // ---- Asset-driven rows: resolve per distinct asset_id ----
  const assetIds = Array.from(new Set(assetRows.map(r => r.asset_id as string)));

  const assignedSummary = await getAssignedAssetSummaryForOwner(viewerUserId);
  const assignedOutIds = new Set(assignedSummary.map(s => s.assetId));

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
        // Find which of the viewer's own Assignments reference this asset —
        // display-only, first match is enough.
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
        // Shared category — reuse getAssetSharingInfo for Shared By + Assignment name.
        const sharingInfo = await getAssetSharingInfo(assetId, viewerUserId);
        const first = sharingInfo.assignments[0];
        if (first) {
          sharedByNameByAssetId.set(assetId, first.sharedBy.name);
          sharedAssignmentNameByAssetId.set(assetId, first.assignmentTitle);
        }
      }
    })
  );

  const assetCards: RedirectLinkDisplayCard[] = assetRows.map(r => {
    const assetId = r.asset_id as string;
    const ctx = assetContextById.get(assetId);
    const category = categorizeAsset({
      assetOrganizationId: ctx?.organizationId ?? null,
      viewerOrganizationId,
      isAssignedOut: assignedOutIds.has(assetId),
    });

    const more: RedirectLinkDisplayCard['more'] = { created: ctx?.createdAt ?? undefined };
    if (category === 'library') {
      more.owner = viewerOrganizationName;
    } else if (category === 'assigned') {
      more.owner = viewerOrganizationName;
      const assignmentName = assignmentNameByAssetId.get(assetId);
      if (assignmentName) more.assignment = assignmentName;
    } else if (category === 'shared') {
      // No cross-org "owner" — RLS blocks org name lookup for other orgs
      // (same constraint documented in listSharedAssetsForCollaborator.ts).
      // Shared By is the actually-available, actually-correct identity.
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
      more,
    };
  });

  const allCards = [...campaignCards, ...assetCards];

  // Fixed category order everywhere: campaign, library, shared, assigned.
  // Stable within each category (original created_at order preserved).
  return allCards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => {
      const catDiff = CATEGORY_ORDER.indexOf(a.card.category) - CATEGORY_ORDER.indexOf(b.card.category);
      if (catDiff !== 0) return catDiff;
      return a.index - b.index;
    })
    .map(({ card }) => card);
}

// ---------------------------------------------------------------------------
// getVideoPromotionBadges — Videos.tsx list badges
// ---------------------------------------------------------------------------

export interface GetVideoPromotionBadgesInput {
  videoIds: string[];
  viewerOrganizationId: string;
  viewerUserId: string;
}

/** videoId -> counts per category (campaign excluded — badges are asset-only). */
export type VideoPromotionBadgeMap = Map<string, Partial<Record<'library' | 'shared' | 'assigned', number>>>;

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
