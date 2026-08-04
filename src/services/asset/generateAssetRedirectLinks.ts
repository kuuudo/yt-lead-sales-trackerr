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
 * CROSS-ORG PROVENANCE: a Shared asset's provenance campaign can live in
 * a different organization than the viewer's — direct `campaigns` reads
 * are correctly blocked by RLS in that case (returns { data: null,
 * error: null }, not a query error). Both resolveVideoAssetContext() and
 * resolveCampaignElementContext() fall back to
 * resolveAuthorizedProvenanceCampaign() ONLY when that RLS-silent-empty
 * signature is seen AND an explicit promotionId is already known for
 * this asset. That helper re-verifies the exact same authorization
 * (promotion_assets membership + promotion ownership/collaboration)
 * server-side via a SECURITY DEFINER function before reading the one
 * campaign row — campaigns RLS itself is untouched. My/Assigned assets
 * never hit this path; their direct read already succeeds.
 *
 * The resource branch has not been confirmed to hit the same RLS wall
 * yet (no debug evidence either way) — it is deliberately left on the
 * direct-read-only path until diagnosed the same way. Do not assume and
 * patch it without that evidence.
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
import { ensureResourcePromotionCampaign } from './ensureResourcePromotionCampaign';

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

  /**
   * Chosen per asset, not per call — different assets in the same
   * batch can legitimately belong to different promotions (different
   * organizations), and therefore have different valid domain
   * choices. Never a shared/global value across selectedAssets.
   *
   * REQUIRED (not optional): every caller must explicitly decide this
   * per asset, even if the decision is "no branded domain" (null).
   * Deliberately not string | undefined — callers should never be
   * able to omit this field and drift into an implicit default.
   */
  trackingDomainId: string | null;
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
// Resource asset provenance lookup
// ---------------------------------------------------------------------------

/**
 * Resource assets do not store campaign_id directly.
 * Their provenance comes from campaign_assets.
 *
 * This campaign is the asset's original campaign ownership,
 * not the campaign selected by the new video.
 */
async function resolveResourceProvenanceCampaign(
  assetId: string,
  organizationId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('campaign_assets')
    .select('campaign_id')
    .eq('asset_id', assetId)
    .maybeSingle();

  if (error) {
    console.error(
      '[generateAssetRedirectLinks] resource provenance lookup failed',
      {
        assetId,
        organizationId,
        error: error.message,
      }
    );

    return null;
  }

  return data?.campaign_id ?? null;
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

  const campaignId = await resolveResourceProvenanceCampaign(
    assetId,
    data.organization_id
  );

   // Lazy provenance: a Resource Asset intentionally has no campaign at
   // Import time (see resolvePromotionCampaign.ts — "resource -> null ...
   // this is expected, not an error"). The moment a Resource Asset is
   // actually selected for +Track New Content, it is entering the
   // tracking/promotion system for the first time, so THIS is the correct
   // point to attach it to the org's 'ONLY PROMOTE ASSET' system campaign
   // — not at Import. Same helper Gate 1 (createAssignment.ts) and Gate 2
   // (getAssignmentDetail.ts) already use; idempotent, safe to call even
   // if a row already exists.
   const resolvedCampaignId = campaignId ?? await (async () => {
     try {
       return await ensureResourcePromotionCampaign(assetId);
     } catch (ensureErr) {
       console.error(
         '[generateAssetRedirectLinks] Failed to establish provenance campaign for resource asset:',
         assetId,
         ensureErr
       );
       return null;
     }
   })();

  console.log('[DEBUG resource provenance]', {
    assetId,
    organizationId: data.organization_id,
    campaignId: resolvedCampaignId,
  });

  return {
    assetId,
    assetType: 'resource',
    organizationId: data.organization_id,
    campaignId: resolvedCampaignId,
    redirectJobs: [
      {
        linkType: resolveResourceLinkType(data.resource_type),
        destinationUrl: data.url,
      },
    ],
  };
}

// ---- Type 2: Campaign Element ----
async function resolveCampaignElementContext(
  assetId: string,
  promotionId: string | null
): Promise<AssetRedirectContext | null> {
  const { data: elementRow, error: elementErr } = await supabase
    .from('campaign_element_assets')
    .select('campaign_id, element_type, source_field')
    .eq('asset_id', assetId)
    .maybeSingle();

  if (elementErr || !elementRow) {
    console.error('[generateAssetRedirectLinks] Failed to load campaign_element_assets row:', assetId, elementErr?.message);
    return null;
  }

  let { data: campaign, error: campaignErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', elementRow.campaign_id)
    .maybeSingle();

  // RLS-silent-empty signature: data:null, error:null — not a query
  // error, just "you're not allowed to read this cross-org campaign
  // directly." Same fallback pattern as the video branch. Only used
  // when we already have an explicit promotionId (resolved upstream).
  if (!campaign && !campaignErr && promotionId) {
    campaign = await resolveAuthorizedProvenanceCampaign(
      assetId,
      promotionId,
      elementRow.campaign_id
    );
  }

  if (campaignErr || !campaign) {
    console.error('[generateAssetRedirectLinks] Failed to load campaign for element asset:', assetId, campaignErr?.message);
    return null;
  }

  // Dynamic field lookup: source_field names which campaign URL column
  // this element represents (e.g. 'consultation_booking_url').
  const destinationUrl = (campaign as any)[elementRow.source_field];

console.log('[DEBUG campaign element]', {
  sourceField: elementRow.source_field,
  destinationUrl,
  campaign,
});

  if (!destinationUrl) {
    console.error(
      '[generateAssetRedirectLinks] Campaign field empty for element asset:',
      assetId,
      'source_field:', elementRow.source_field
    );
    return null;
  }

console.log('[DEBUG campaign element context]', {
  assetId,
  campaignId: campaign.id,
  organizationId: campaign.organization_id,
  elementType: elementRow.element_type,
  sourceField: elementRow.source_field,
  destinationUrl,
});

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
    .select('campaign_id, organization_id, platform_url')
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

    //Product rule: an Asset redirect resolves to the Asset itself.
   // A Video Asset IS its content (YouTube/TikTok/LinkedIn/etc.) — the
   // campaign above is consulted only for provenance/attribution
   // (campaignId, below), never for the destination. This mirrors
   // Resource Asset's use of asset_resources.url as its own destination.
   if (!videoRow.platform_url) {
     console.error('[generateAssetRedirectLinks] Video asset has no platform_url, skipping:', assetId);
     return null;
   }
 
   const redirectJobs: RedirectJob[] = [
     {
       linkType: 'landing_page',
       destinationUrl: videoRow.platform_url,
     },
   ];

  return {
    assetId,
    assetType: 'video',
    organizationId: videoRow.organization_id,
    campaignId: campaign.id,
    redirectJobs,
  };
} // <-- CLOSE resolveVideoAssetContext HERE

async function resolveAssetRedirectContext(
  assetId: string,
  promotionId: string | null
): Promise<AssetRedirectContext | null> {
  const assetType = await getAssetType(assetId);
  if (!assetType) return null;

  if (assetType === 'resource') return resolveResourceContext(assetId);
  if (assetType === 'campaign_element') {
    return resolveCampaignElementContext(assetId, promotionId);
  }
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

  contextIsNull: context === null,

  campaignId: context?.campaignId ?? null,

  redirectJobCount: context?.redirectJobs.length ?? 0,

  assetType: context?.assetType ?? null,
});

      console.log('[DEBUG context validation]', {
        assetId: selected.asset_id,
        promotionId: selected.promotionContext?.promotionId ?? null,
        context,
        hasContext: !!context,
        campaignId: context?.campaignId,
      });

      if (!context) {
  console.error(
    '[DEBUG FAIL] resolveAssetRedirectContext returned null',
    {
      assetId: selected.asset_id,
      promotionId: selected.promotionContext?.promotionId ?? null,
    }
  );

  return;
}

if (!context.campaignId) {
  console.error(
    '[DEBUG FAIL] context has no campaignId',
    {
      assetId: selected.asset_id,
      assetType: context.assetType,
      context,
    }
  );

  return;
}

if (context.redirectJobs.length === 0) {
  console.error(
    '[DEBUG FAIL] context has zero redirect jobs',
    {
      assetId: selected.asset_id,
      assetType: context.assetType,
      context,
    }
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
              trackingDomainId: selected.trackingDomainId,
            }
          );
        })
      );
    })   // closes selectedAssets.map(...)
  );     // closes Promise.all(...)
}        // closes generateAssetRedirectLinks()