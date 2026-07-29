/**
 * src/services/asset/generateAssetRedirectLinks.ts
 *
 * Asset Redirect generation — a SIBLING pipeline to createVideo(), not a
 * step inside it. Called by Videos.tsx's handleSave() immediately after
 * createVideo() returns a savedVideo.
 *
 * Architecture locks (do not revisit without reopening review):
 *
 *   - Promotion is NOT resolved here.
 *   - Shared asset promotion context is resolved upstream (see
 *     resolvePromotionContextForAsset.ts / Videos.tsx) before this
 *     function ever runs. This file only passes through an
 *     already-known promotion_id — it never guesses one.
 *   - Assignment is not used for redirect creation.
 *   - createVideo() remains responsible only for creating a Video —
 *     Promoted Asset handling does not move into it.
 *   - Asset Redirect generation is ASSET-DRIVEN, not video-campaign-driven.
 *     Campaign on an Asset Redirect is the Asset's own provenance (where
 *     it originated), never the new video's selected campaign
 *     (attribution). These are different business facts — do not
 *     conflate them, even though both happen during the same Save action.
 *   - Reuses the existing createRedirectLink() — this is not a second
 *     redirect-creation mechanism.
 *   - Reuses buildCampaignRedirectJobs() (shared with createVideo()) for
 *     the Video-asset branch — the campaign field list is not duplicated.
 *   - No new tables. redirect_links (video_id + asset_id together on one
 *     row) already represents "this Content promotes this Asset" for MVP.
 *
 * CROSS-ORG PROVENANCE (video branch only, for now): a Shared asset's
 * provenance campaign can live in a different organization than the
 * viewer's — direct `campaigns` reads are correctly blocked by RLS in
 * that case (returns { data: null, error: null }, not a query error).
 * resolveVideoAssetContext() falls back to
 * resolveAuthorizedProvenanceCampaign() ONLY when that RLS-silent-empty
 * signature is seen AND an explicit promotionId is already known for
 * this asset. That helper re-verifies the exact same authorization
 * (promotion_assets membership + promotion ownership/collaboration)
 * server-side via a SECURITY DEFINER function before reading the one
 * campaign row — campaigns RLS itself is untouched. My/Assigned assets
 * never hit this path; their direct read already succeeds.
 *
 * The resource and campaign_element branches have not been confirmed to
 * hit the same RLS wall yet (no debug evidence either way) — they are
 * deliberately left on the direct-read-only path until diagnosed the
 * same way. Do not assume and patch them without that evidence.
 *
 * One lookup per selected asset_id is required here because the Picker
 * (PromotedAssetPicker / listLibraryAssetsForAssignmentPicker /
 * listSharedAssetsForCollaborator) only returns lightweight UI rows
 * (asset_id, asset_type, display_name, thumbnail) — never enough on its
 * own to generate a redirect link.
 */

import { supabase } from '../../lib/supabase';
import { createRedirectLink } from '../../lib/redirects';
import type { RedirectLinkType } from '../../lib/redirects';
import { buildCampaignRedirectJobs } from '../redirect/buildCampaignRedirectJobs';
import type { Campaign } from '../../lib/supabase';
import type { PromotionContext } from './resolvePromotionContextForAsset';
import { resolveAuthorizedProvenanceCampaign } from './resolveAuthorizedProvenanceCampaign';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape received from Picker selection.
 *
 * Shared assets may include a resolved promotionContext.
 * My / Assigned assets intentionally do not.
 */
export interface SelectedPromotedAsset {
  asset_id: string;

  /**
   * Only exists for Shared assets.
   * Resolved before generateAssetRedirectLinks runs.
   *
   * My / Assigned assets:
   * undefined
   */
  promotionContext?: PromotionContext;
}

export interface GenerateAssetRedirectLinksOptions {
  videoId: string;
  selectedAssets: SelectedPromotedAsset[];
}

interface RedirectJob {
  linkType: RedirectLinkType;
  destinationUrl: string;
}

/** Normalized redirect context — the shape every asset_type resolves into. */
interface AssetRedirectContext {
  assetId: string;
  /** Included for debugging/observability — not branched on after resolution. */
  assetType: 'resource' | 'campaign_element' | 'video';
  organizationId: string | null;
  campaignId: string | null;
  redirectJobs: RedirectJob[];
}

// ---------------------------------------------------------------------------
// Resource-type -> link-type vocabulary
// ---------------------------------------------------------------------------

// asset_resources.resource_type values observed in production ('video',
// 'consultation', 'social_post', etc.) do not all map cleanly onto
// RedirectLinkType. Known overlaps map directly; anything unrecognized
// falls back to 'landing_page' as the closest generic destination type.
// This is a naming/vocabulary decision, not a missing-data problem —
// revisit if product wants a dedicated resource_type -> link_type
// dictionary instead of this fallback.
const RESOURCE_TYPE_TO_LINK_TYPE: Partial<Record<string, RedirectLinkType>> = {
  consultation: 'consultation',
  landing_page: 'landing_page',
  newsletter: 'newsletter',
  sales_call: 'sales_call',
  checkout: 'checkout',
};

function resolveResourceLinkType(resourceType: string | null): RedirectLinkType {
  if (resourceType && RESOURCE_TYPE_TO_LINK_TYPE[resourceType]) {
    return RESOURCE_TYPE_TO_LINK_TYPE[resourceType]!;
  }
  return 'landing_page';
}

// ---------------------------------------------------------------------------
// System Campaign lookup (Resource asset provenance)
// ---------------------------------------------------------------------------

/**
 * Resource assets have no campaign_id anywhere in the schema — confirmed
 * via information_schema (no column on asset_resources, no campaign_assets
 * row for any resource-type asset in the sample data). Their business
 * origin is "imported directly into the library," which IS the System
 * Campaign (is_system = true, unique per org). This is provenance, not a
 * technical fallback to satisfy createRedirectLink()'s campaignId param.
 */
async function getSystemCampaignId(organizationId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('is_system', true)
    .maybeSingle();

  if (error) {
    console.error('[generateAssetRedirectLinks] Failed to load System Campaign for org:', organizationId, error.message);
    return null;
  }

  return data?.id ?? null;
}

// ---------------------------------------------------------------------------
// Per-type context resolution
// ---------------------------------------------------------------------------

async function getAssetType(assetId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('assets')
    .select('asset_type')
    .eq('id', assetId)
    .maybeSingle();

  if (error || !data) {
    console.error('[generateAssetRedirectLinks] Failed to load asset:', assetId, error?.message);
    return null;
  }

  return data.asset_type as string;
}

// ---- Type 1: Resource ----
async function resolveResourceContext(assetId: string): Promise<AssetRedirectContext | null> {
  const { data, error } = await supabase
    .from('asset_resources')
    .select('organization_id, url, resource_type')
    .eq('asset_id', assetId)
    .maybeSingle();

  if (error || !data) {
    console.error('[generateAssetRedirectLinks] Failed to load asset_resources row:', assetId, error?.message);
    return null;
  }

  if (!data.url) {
    console.error('[generateAssetRedirectLinks] Resource asset has no url, skipping:', assetId);
    return null;
  }

  const campaignId = await getSystemCampaignId(data.organization_id);

  return {
    assetId,
    assetType: 'resource',
    organizationId: data.organization_id,
    campaignId,
    redirectJobs: [
      {
        linkType: resolveResourceLinkType(data.resource_type),
        destinationUrl: data.url,
      },
    ],
  };
}

// ---- Type 2: Campaign Element ----
async function resolveCampaignElementContext(assetId: string): Promise<AssetRedirectContext | null> {
  const { data: elementRow, error: elementErr } = await supabase
    .from('campaign_element_assets')
    .select('campaign_id, element_type, source_field')
    .eq('asset_id', assetId)
    .maybeSingle();

  if (elementErr || !elementRow) {
    console.error('[generateAssetRedirectLinks] Failed to load campaign_element_assets row:', assetId, elementErr?.message);
    return null;
  }

  const { data: campaign, error: campaignErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', elementRow.campaign_id)
    .maybeSingle();

  if (campaignErr || !campaign) {
    console.error('[generateAssetRedirectLinks] Failed to load campaign for element asset:', assetId, campaignErr?.message);
    return null;
  }

  // Dynamic field lookup: source_field names which campaign URL column
  // this element represents (e.g. 'consultation_booking_url').
  const destinationUrl = (campaign as any)[elementRow.source_field];

  if (!destinationUrl) {
    console.error(
      '[generateAssetRedirectLinks] Campaign field empty for element asset:',
      assetId,
      'source_field:', elementRow.source_field
    );
    return null;
  }

  return {
    assetId,
    assetType: 'campaign_element',
    organizationId: campaign.organization_id,
    // This is the Asset's OWN campaign — its provenance. Never the new
    // video's selected campaign.
    campaignId: campaign.id,
    redirectJobs: [
      {
        linkType: elementRow.element_type as RedirectLinkType,
        destinationUrl,
      },
    ],
  };
}

// ---- Type 3: Video-as-Asset ----
async function resolveVideoAssetContext(
  assetId: string,
  promotionId: string | null
): Promise<AssetRedirectContext | null> {
  const { data: videoRow, error: videoErr } = await supabase
    .from('videos')
    .select('campaign_id, organization_id')
    .eq('asset_id', assetId)
    .maybeSingle();

  if (videoErr || !videoRow) {
    console.error('[generateAssetRedirectLinks] Failed to load videos row for asset:', assetId, videoErr?.message);
    return null;
  }

  if (!videoRow.campaign_id) {
    console.error('[generateAssetRedirectLinks] Video asset has no campaign_id, skipping:', assetId);
    return null;
  }

  // BEFORE the database query happens
console.log('[DEBUG campaign lookup]', {
  assetId,
  videoCampaignId: videoRow.campaign_id,
  currentUser: (await supabase.auth.getUser()).data.user?.id
});


let { data: campaign, error: campaignErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', videoRow.campaign_id)
    .maybeSingle();


// AFTER the database query finishes
console.log('[DEBUG campaign result]', {
  campaign,
  campaignErr
});

  // RLS-silent-empty signature: data:null, error:null — not a query
  // error, not a missing row, just "you're not allowed to read this
  // cross-org campaign directly." Only fall back to the authorized
  // provenance resolver when we ALSO already have an explicit
  // promotionId (resolved upstream, never guessed here). My/Assigned
  // assets never hit this branch — their direct read already succeeds.
  if (!campaign && !campaignErr && promotionId) {
    campaign = await resolveAuthorizedProvenanceCampaign(assetId, promotionId, videoRow.campaign_id);
  }

  if (campaignErr || !campaign) {
    console.error('[generateAssetRedirectLinks] Failed to load campaign for video asset:', assetId, campaignErr?.message);
    return null;
  }

  // Reuses the exact same field list createVideo() uses — but for THIS
  // asset's own campaign (provenance), never the newly created video's
  // selected campaign (attribution). Do not swap this input.
  const campaignJobs = buildCampaignRedirectJobs(campaign as Campaign);
console.log('[DEBUG video asset final context]', {
  assetId,
  campaignId: campaign.id,
  landing_page_url: campaign.landing_page_url,
  campaign,
});
  return {
    assetId,
    assetType: 'video',
    organizationId: videoRow.organization_id,
    campaignId: campaign.id,
    redirectJobs: [
      {
        linkType: 'landing_page',
        destinationUrl: campaign.landing_page_url,
      },
    ],
  };
}

async function resolveAssetRedirectContext(
  assetId: string,
  promotionId: string | null
): Promise<AssetRedirectContext | null> {
  const assetType = await getAssetType(assetId);
  if (!assetType) return null;

  if (assetType === 'resource') return resolveResourceContext(assetId);
  if (assetType === 'campaign_element') return resolveCampaignElementContext(assetId);
  if (assetType === 'video') return resolveVideoAssetContext(assetId, promotionId);

  console.error('[generateAssetRedirectLinks] Unknown asset_type, skipping:', assetId, assetType);
  return null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function generateAssetRedirectLinks({
  videoId,
  selectedAssets,
}: GenerateAssetRedirectLinksOptions): Promise<void> {
  if (!selectedAssets || selectedAssets.length === 0) return;

  const appBaseUrl = window.location.origin;

  await Promise.all(
    selectedAssets.map(async (selected) => {
      const context = await resolveAssetRedirectContext(
  selected.asset_id,
  selected.promotionContext?.promotionId ?? null
);

console.log('[DEBUG resolved asset context]', {
  assetId: selected.asset_id,
  promotionId: selected.promotionContext?.promotionId ?? null,
  context,
});

      if (!context || !context.campaignId) {
        console.error(
          '[generateAssetRedirectLinks] Skipping asset — no usable redirect context:',
          selected.asset_id
        );
        return;
      }

      console.log('[generateAssetRedirectLinks] Generating redirects', {
        assetId: context.assetId,
        assetType: context.assetType,
        campaignId: context.campaignId,
        jobCount: context.redirectJobs.length,
      });

      await Promise.all(
  context.redirectJobs.map((job) => {

console.log('[DEBUG destination check]', {
  assetId: context.assetId,
  campaignId: context.campaignId,
  destinationUrl: job.destinationUrl,
  promotionId: selected.promotionContext?.promotionId ?? null,
});

console.log('[DEBUG BEFORE createRedirectLink]', {
  videoId,
  assetId: context.assetId,
  assetType: context.assetType,
  campaignId: context.campaignId,
  linkType: job.linkType,
  destinationUrl: job.destinationUrl,
  promotionId: selected.promotionContext?.promotionId ?? null,
});

return createRedirectLink(
      videoId,
      context.campaignId!,
      job.linkType,
      job.destinationUrl,
      appBaseUrl,
      undefined, // leadMagnetId — not applicable to asset redirects
      true,
      {
        assetId: context.assetId,
        promotionId: selected.promotionContext?.promotionId ?? null,
      }
       );
  })
      );
    })   // closes selectedAssets.map(...)
  );     // closes Promise.all(...)
}        // closes generateAssetRedirectLinks()