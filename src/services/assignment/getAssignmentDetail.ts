/**
 * src/services/assignment/getAssignmentDetail.ts
 * ...(existing header comments unchanged)...
 *
 * UPDATE (START PROMOTING door — broadened provenance resolution):
 * campaignGroups is no longer built from a single campaign_assets query.
 * Assets have 3 legitimate provenance sources (campaign_element_assets,
 * videos.campaign_id, or a formal campaign_assets row), and Resource
 * Assets intentionally have none of these natively. The door now asks,
 * per asset:
 *
 *   1. resolvePromotionCampaign(assetId) — read-only. Checks
 *      campaign_assets first (strongest, authoritative relationship),
 *      then falls back to the asset's own type-specific source of truth
 *      (videos.campaign_id for video assets, campaign_element_assets
 *      .campaign_id for campaign_element assets). Returns null for
 *      resource assets with no existing campaign_assets row — that's
 *      expected, not an error.
 *
 *   2. If null AND the asset is a resource asset —
 *      ensureResourcePromotionCampaign(assetId) is called. This is the
 *      only write path here: it finds (or requires) the organization's
 *      'ONLY PROMOTE ASSET' system campaign and inserts a campaign_assets
 *      row linking the resource asset to it, idempotently, then returns
 *      that campaign_id.
 *
 *   3. If still null (non-resource asset with no provenance anywhere) —
 *      the asset stays visible in `assignmentAssets` but is excluded
 *      from `campaignGroups`, i.e. not promotable. Same graceful
 *      degradation as before.
 *
 * This does NOT change asset creation, asset schema, createVideo.ts, or
 * addToLibrary.ts. Those remain untouched — this file only widens what
 * START PROMOTING is able to recognize as a valid promotion campaign.
 *
 * UPDATE (Path B — Start Promoting usage gates):
 * AssignmentAssetOption now surfaces assignment_assets.allow_marketer_domain,
 * allow_sponsor_domain, allow_vstrk_domain (Sponsor capability only; not
 * actual usage). trackingDomains: when the viewer is an active collaborator,
 * the list is revoke-filtered via listAssignmentTrackingDomainsForCollaborator
 * so Sponsor-domain pickers cannot offer revoked domains; when not a
 * collaborator, the unfiltered Assignment-wide list is returned (unchanged
 * for Sponsor-facing read-only display).
 */

import { supabase } from '../../lib/supabase';
import {
  resolveElementThumbnail,
  resolveAssetThumbnail,
  type CampaignElementType,
  type ResourceType,
} from '../../lib/videoFormatters';
import { resolvePromotionCampaign } from '../asset/resolvePromotionCampaign';
import { ensureResourcePromotionCampaign } from '../asset/ensureResourcePromotionCampaign';
import { getTrackingDomainAccessStatesForCollaborator } from './assignmentTrackingDomainAccess';
import {
  resolveAssignmentMode,
  resolveAssetScope,
  type AssignmentMode,
} from './assignmentMode';

export interface AssignmentAssetOption {
  asset_id: string;
  kind: 'video' | 'campaign_element' | 'resource';
  video_title: string | null;
  thumbnail_url: string | null;
  display_name?: string;
  element_type?: CampaignElementType;
  resource_type?: ResourceType;
  /** Sponsor capability on this Assignment×Asset — not actual usage. */
  allow_marketer_domain: boolean;
  allow_sponsor_domain: boolean;
  allow_vstrk_domain: boolean;
  selected_sponsor_domain_id?: string | null;
  selected_sponsor_hostname?: string | null;
  title?: string | null;
}

export interface CampaignGroup {
  campaign_id: string;
  campaign_name: string | null;
  assets: AssignmentAssetOption[];
}

/**
 * One shared Tracking Domain, as currently listed in
 * assignment_tracking_domains for this Assignment. Read-only display
 * shape — no status/authorization fields, since this PR does not add
 * any management action. hostname is reused directly from
 * branded_tracking_domains via the join below, not re-fetched through
 * listVerifiedBrandedDomains (which is org-scoped and answers a
 * different question — "what could be shared," not "what was shared
 * with this Assignment").
 */
export interface AssignmentTrackingDomain {
  id: string;
  hostname: string;
}

/**
 * Standalone, reusable read: assignment_id -> assignment_tracking_domains
 * -> branded_tracking_domains. This is the SAME query previously inlined
 * separately in both getAssignmentDetail() below and getPromotionDetail.ts
 * — extracted here (co-located with the type it returns) so both callers,
 * plus Track New Content, share one implementation instead of three
 * copies of the same join. assignment_tracking_domains remains the sole
 * source of truth; this function does not create, cache, or snapshot
 * anything — a plain read, callable from anywhere in the Assignment ->
 * Promotion -> Track New Content chain.
 */
export async function listAssignmentTrackingDomains(
  assignmentId: string
): Promise<AssignmentTrackingDomain[]> {
  const { data, error } = await supabase
    .from('assignment_tracking_domains')
    .select('branded_tracking_domain_id, branded_tracking_domains(id, hostname)')
    .eq('assignment_id', assignmentId);

  if (error) {
    throw new Error(`Tracking domains query failed: ${error.message}`);
  }

  return (data ?? [])
    .map((row: any) => row.branded_tracking_domains)
    .filter((d: any): d is { id: string; hostname: string } => !!d)
    .map((d: any) => ({ id: d.id, hostname: d.hostname }));
}

/**
 * Sponsor assigns one of their own verified domains to this Assignment.
 * Direct insert, no RPC — authorization is entirely handled by the
 * existing assignment_tracking_domains_insert_by_creator RLS policy
 * (assignments.created_by_user_id = auth.uid()), same policy already in
 * place since the Create Assignment PR. This is Assignment-wide, not
 * Promotion-only — inserting here makes the domain visible to every
 * Promotion under this Assignment, an accepted tradeoff for this MVP.
 */
export async function addAssignmentTrackingDomain(
  assignmentId: string,
  brandedTrackingDomainId: string
): Promise<void> {
  const { error } = await supabase
    .from('assignment_tracking_domains')
    .insert({ assignment_id: assignmentId, branded_tracking_domain_id: brandedTrackingDomainId });

  if (error) {
    throw new Error(error.message ?? 'Failed to assign tracking domain');
  }
}

/**
 * PR4 — Track New Content's actual data source. Composes two already-
 * existing reads rather than writing new query logic: the full
 * Assignment-wide domain list (listAssignmentTrackingDomains, UNCHANGED
 * above — Assignment Detail keeps using that one, unfiltered, since it
 * never shows revoke status) minus whatever's currently revoked for
 * THIS SPECIFIC collaborator (getTrackingDomainAccessStatesForCollaborator,
 * from PR2's assignmentTrackingDomainAccess.ts).
 *
 * Revocation is per (assignment_collaborator_id, branded_tracking_domain_id)
 * — never Assignment-wide. Revoking for one collaborator never affects
 * the domain owner's own use of it, nor any other collaborator's; this
 * function is the only place that filter is ever applied, and it's
 * scoped by construction to exactly one collaborator's access states.
 */
export async function listAssignmentTrackingDomainsForCollaborator(
  assignmentId: string,
  assignmentCollaboratorId: string
): Promise<AssignmentTrackingDomain[]> {
  const [allDomains, accessStateMap] = await Promise.all([
    listAssignmentTrackingDomains(assignmentId),
    getTrackingDomainAccessStatesForCollaborator(assignmentCollaboratorId),
  ]);

  return allDomains.filter(d => !accessStateMap.has(d.id));
}

export interface AssignmentDetailData {
  assignment: {
    id: string;
    title: string;
    description: string | null;
    status: string;
    organization_id: string;
    created_by_user_id: string;
    sponsor_name: string | null;
    /** Product source of truth: regular | creative */
    assignment_mode: AssignmentMode;
    /** @deprecated legacy dual-write; prefer assignment_mode */
    creative_creation_mode: 'campaign_asset_only' | 'campaign_links_and_assets' | null;
    creative_campaign_id: string | null;
    /** Display name for creative_campaign_id (Sponsor normal campaign). */
    creative_campaign_name: string | null;
    /** Asset Usage — BOTH Regular and Creative */
    asset_scope: 'promotion_only' | 'allow_additional' | null;
  };
  myInvitation: { id: string; status: string } | null;
  myCollaboratorId: string | null;
  assignmentAssets: AssignmentAssetOption[];
  campaignGroups: CampaignGroup[];
  trackingDomains: AssignmentTrackingDomain[];
}

export async function getAssignmentDetail(
  assignmentId: string,
  currentUserId: string,
  currentUserEmail: string
): Promise<AssignmentDetailData> {
  const { data: assignment, error: assignmentErr } = await supabase
    .from('assignments')
    .select('id, title, description, status, organization_id, created_by_user_id, assignment_mode, creative_creation_mode, creative_campaign_id, asset_scope')
    .eq('id', assignmentId)
    .single();

  if (assignmentErr || !assignment) {
    throw new Error(assignmentErr?.message ?? 'Assignment not found');
  }

  const { data: sponsorProfile } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', assignment.created_by_user_id)
    .maybeSingle();

  const sponsorName =
  sponsorProfile?.full_name?.trim() ||
  sponsorProfile?.email ||
  null;

  const assignmentMode = resolveAssignmentMode({
    assignment_mode: (assignment as any).assignment_mode as string | null,
    creative_creation_mode: assignment.creative_creation_mode as string | null,
  });
  const modeRaw = assignment.creative_creation_mode as string | null;
  const legacyCreativeMode =
    modeRaw === 'campaign_asset_only' || modeRaw === 'campaign_links_and_assets'
      ? modeRaw
      : null;
  const creativeCampaignId = (assignment.creative_campaign_id as string | null) ?? null;

  // Asset scope applies to BOTH Regular and Creative
  const resolvedAssetScope = resolveAssetScope(
    assignment.asset_scope as string | null
  );

  let creativeCampaignName: string | null = null;

  if (assignmentMode === 'creative' && creativeCampaignId) {
    const { data: creativeCamp } = await supabase
      .from('campaigns')
      .select('id, campaign_name, organization_id, is_system, archived_at')
      .eq('id', creativeCampaignId)
      .maybeSingle();
    if (
      creativeCamp &&
      creativeCamp.organization_id === assignment.organization_id &&
      !creativeCamp.is_system &&
      !creativeCamp.archived_at
    ) {
      creativeCampaignName = (creativeCamp.campaign_name as string) ?? null;
    }
  }

  const [
    { data: invitation, error: invitationErr },
    { data: collaborator, error: collaboratorErr },
    { data: assignmentAssetRows, error: assetsErr },
    allTrackingDomains,
  ] = await Promise.all([
    supabase
      .from('assignment_invitations')
      .select('id, status')
      .eq('assignment_id', assignmentId)
      .ilike('invited_email', currentUserEmail)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('assignment_collaborators')
      .select('id')
      .eq('assignment_id', assignmentId)
      .eq('user_id', currentUserId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('assignment_assets')
      .select('asset_id, allow_marketer_domain, allow_sponsor_domain, allow_vstrk_domain, selected_sponsor_domain_id')
      .eq('assignment_id', assignmentId),
    // Assignment-wide list first; may be revoke-filtered below for collaborators.
    listAssignmentTrackingDomains(assignmentId),
  ]);

  if (invitationErr) throw new Error(`Invitation query failed: ${invitationErr.message}`);
  if (collaboratorErr) throw new Error(`Collaborator query failed: ${collaboratorErr.message}`);
  if (assetsErr) throw new Error(`Assignment assets query failed: ${assetsErr.message}`);

  // Marketer (active collaborator): selectable Sponsor domains must exclude
  // domains revoked for this collaborator. Non-collaborator (e.g. Sponsor
  // viewing the Assignment): keep the unfiltered Assignment-wide list.
  const trackingDomains =
    collaborator?.id
      ? await listAssignmentTrackingDomainsForCollaborator(assignmentId, collaborator.id)
      : allTrackingDomains;

  const assetIds = (assignmentAssetRows ?? []).map(r => r.asset_id);
  const allowByAssetId = new Map(
    (assignmentAssetRows ?? []).map((r: any) => [
      r.asset_id as string,
      {
        allow_marketer_domain: !!r.allow_marketer_domain,
        allow_sponsor_domain: !!r.allow_sponsor_domain,
        allow_vstrk_domain: !!r.allow_vstrk_domain,
        selected_sponsor_domain_id: (r.selected_sponsor_domain_id as string | null) ?? null,
      },
    ])
  );

  // Resolve Sponsor domain hostnames for display (read-only).
  const selectedSponsorIds = [
    ...new Set(
      [...allowByAssetId.values()]
        .map(a => a.selected_sponsor_domain_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const sponsorHostnameById = new Map<string, string>();
  if (selectedSponsorIds.length > 0) {
    const { data: domainRows } = await supabase
      .from('branded_tracking_domains')
      .select('id, hostname')
      .in('id', selectedSponsorIds);
    for (const d of domainRows ?? []) {
      sponsorHostnameById.set(d.id as string, d.hostname as string);
    }
  }

  let assignmentAssets: AssignmentAssetOption[] = [];
  let campaignGroups: CampaignGroup[] = [];

  if (assetIds.length > 0) {
    // These three queries remain — they're display-data lookups only
    // (title, thumbnail, element type, etc.), used by toAssetOption().
    // They are NOT used to decide campaign grouping anymore.
    const [
      { data: videoRows, error: videoErr },
      { data: elementRows, error: elementErr },
      { data: resourceRows, error: resourceErr },
    ] = await Promise.all([
      supabase
        .from('videos')
        .select('asset_id, video_title, thumbnail_url')
        .in('asset_id', assetIds),
      supabase
        .from('campaign_element_assets')
        .select('asset_id, display_name, element_type')
        .in('asset_id', assetIds),
      supabase
        .from('asset_resources')
        .select('asset_id, title, thumbnail_url, platform, resource_type')
        .in('asset_id', assetIds),
    ]);

    if (videoErr) throw new Error(`Failed to load asset display info: ${videoErr.message}`);
    if (elementErr) throw new Error(`Failed to load campaign element display info: ${elementErr.message}`);
    if (resourceErr) throw new Error(`Failed to load resource display info: ${resourceErr.message}`);

    const videoByAsset = new Map((videoRows ?? []).map(v => [v.asset_id, v]));
    const elementByAsset = new Map((elementRows ?? []).map(e => [e.asset_id, e]));
    const resourceByAsset = new Map((resourceRows ?? []).map(r => [r.asset_id, r]));

    const toAssetOption = (assetId: string): AssignmentAssetOption => {
      const allows = allowByAssetId.get(assetId) ?? {
        allow_marketer_domain: false,
        allow_sponsor_domain: false,
        allow_vstrk_domain: false,
        selected_sponsor_domain_id: null as string | null,
      };
      const selected_sponsor_domain_id = allows.selected_sponsor_domain_id;
      const selected_sponsor_hostname = selected_sponsor_domain_id
        ? sponsorHostnameById.get(selected_sponsor_domain_id) ?? null
        : null;
      const element = elementByAsset.get(assetId);
      if (element) {
        return {
          asset_id: assetId,
          kind: 'campaign_element',
          video_title: null,
          thumbnail_url: resolveElementThumbnail(element.element_type),
          display_name: element.display_name,
          element_type: element.element_type,
          ...allows,
          selected_sponsor_hostname,
        };
      }
      const video = videoByAsset.get(assetId);
      if (video) {
        return {
          asset_id: assetId,
          kind: 'video',
          video_title: video.video_title ?? null,
          thumbnail_url: video.thumbnail_url ?? null,
          ...allows,
          selected_sponsor_hostname,
        };
      }
      const resource = resourceByAsset.get(assetId);
      if (resource) {
        return {
          asset_id: assetId,
          kind: 'resource',
          video_title: resource.title ?? null,
          thumbnail_url: resolveAssetThumbnail({
            thumbnail_url: resource.thumbnail_url,
            resource_type: resource.resource_type,
            platform: resource.platform,
          }),
          resource_type: resource.resource_type,
          ...allows,
          selected_sponsor_hostname,
        };
      }
      return {
        asset_id: assetId,
        kind: 'video',
        video_title: null,
        thumbnail_url: null,
        ...allows,
          selected_sponsor_hostname,
      };
    };

    // "Assets in this Assignment" — unchanged, every asset regardless of
    // Campaign provenance.
    assignmentAssets = assetIds.map(toAssetOption);

    // "Select Assets to Promote" — the broadened door. Each asset resolves
    // its own promotion campaign via its own type's source of truth;
    // resource assets get an idempotent system-campaign link created on
    // demand instead of being permanently excluded.
    const groupMap = new Map<string, CampaignGroup>();
    const campaignNameCache = new Map<string, string | null>();

    const getCampaignName = async (campaignId: string): Promise<string | null> => {
      if (campaignNameCache.has(campaignId)) return campaignNameCache.get(campaignId)!;
      const { data, error } = await supabase
        .from('campaigns')
        .select('campaign_name')
        .eq('id', campaignId)
        .maybeSingle();
      const name = error ? null : data?.campaign_name ?? null;
      campaignNameCache.set(campaignId, name);
      return name;
    };

    const addToGroup = async (campaignId: string, assetOption: AssignmentAssetOption) => {
      if (!groupMap.has(campaignId)) {
        groupMap.set(campaignId, {
          campaign_id: campaignId,
          campaign_name: await getCampaignName(campaignId),
          assets: [],
        });
      }
      groupMap.get(campaignId)!.assets.push(assetOption);
    };

    for (const assetId of assetIds) {
      const assetOption = toAssetOption(assetId);
      const resolved = await resolvePromotionCampaign(assetId);

      if (resolved) {
        await addToGroup(resolved.campaignId, assetOption);
        continue;
      }

      if (assetOption.kind === 'resource') {
        const campaignId = await ensureResourcePromotionCampaign(assetId);
        await addToGroup(campaignId, assetOption);
      }
      // else: no provenance anywhere and not a resource asset — stays
      // visible in assignmentAssets but excluded from campaignGroups
      // (not promotable), same graceful degradation as before.
    }

    campaignGroups = Array.from(groupMap.values());
  }

  return {
    assignment: {
      ...assignment,
      sponsor_name: sponsorName,
      assignment_mode: assignmentMode,
      creative_creation_mode: legacyCreativeMode,
      creative_campaign_id: creativeCampaignId,
      creative_campaign_name: creativeCampaignName,
      asset_scope: resolvedAssetScope,
    },
    myInvitation: invitation ?? null,
    myCollaboratorId: collaborator?.id ?? null,
    assignmentAssets,
    campaignGroups,
    trackingDomains,
  };
}
