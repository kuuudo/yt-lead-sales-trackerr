/**
 * src/services/asset/importAsset.ts
 *
 * Single source of truth for "import a URL into the Asset Library."
 * Sibling of createVideo.ts, not a caller of it — Import never touches the
 * videos table or the Campaign/tracking domain, by design.
 *
 * Pipeline (Design Lock §1):
 *   validateUrl -> identifyResource -> extractMetadata
 *     -> createAsset() -> createAssetResource() -> return AssetResource
 *
 * Only validateUrl() can reject the import. Everything after it degrades
 * gracefully instead of throwing (Design Lock §1, §5).
 *
 * Not responsible for:
 *   - Any React state / UI feedback (caller's job — ImportAssetModal.tsx)
 *   - Prompting for a manual resource_type — the caller must supply
 *     `manualResourceType` when identifyResource() can't determine one
 *     (Design Lock §4); this function has no UI to ask with.
 *
 * Callers:
 *   - ImportAssetModal.tsx (Assets.tsx entry point)
 */

import { validateUrl } from './validateUrl';
import { identifyResource } from './identifyResource';
import { extractMetadata } from './extractMetadata';
import { createAsset } from './createAsset';
import { createAssetResource, type AssetResource } from './createAssetResource';
import { listCampaignsForAssetImport } from '../campaign/listCampaignsForAssetImport';
import type { ResourceType } from '../../lib/videoFormatters';

export interface ImportAssetInput {
  url: string;
  /** User-entered Asset Name — always wins when non-empty (Design Lock §2). */
  assetName: string;
  /** Required only when identifyResource() returns resourceType: null. */
  manualResourceType?: ResourceType;
  organizationId: string;
  /** Campaign this Resource Asset belongs to. Required — LOCKED RULE: every Asset must belong to exactly one Campaign. */
  campaignId: string;
}

export interface ImportAssetResult {
  assetResource: AssetResource;
}

export async function importAsset({
  url,
  assetName,
  manualResourceType,
  organizationId,
  campaignId,
}: ImportAssetInput): Promise<ImportAssetResult> {
  // 1. Validate — the ONLY step allowed to reject (Design Lock §1).
  const validation = validateUrl(url);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }

  // 1b. Campaign is required (LOCKED RULE) and must belong to this
  // organization. Enforced here — not only in the UI — since this is the
  // single entry point for Import Asset regardless of caller. Reuses the
  // existing org-scoped campaign query rather than a new one.
  if (!campaignId) {
    throw new Error('A Campaign is required to import an Asset.');
  }
  const orgCampaigns = await listCampaignsForAssetImport(organizationId);
  if (!orgCampaigns.some(c => c.id === campaignId)) {
    throw new Error('Selected Campaign is invalid or does not belong to this organization.');
  }

  // 2. Identify — never throws.
  const identified = identifyResource(validation.url);

  const resourceType = identified.resourceType ?? manualResourceType;
  if (!resourceType) {
    throw new Error(
      'Could not automatically determine a resource type for this URL — a manual selection is required.'
    );
  }

  // 3. Extract — never throws, worst case { title: null, thumbnailUrl: null }.
  const metadata = await extractMetadata(validation.url, identified.platform);

  // Title priority, per Design Lock §2:
  //   user-entered Asset Name > extracted title > generic placeholder
  const trimmedAssetName = assetName.trim();
  const title =
    trimmedAssetName ||
    metadata.title ||
    `${identified.platform} import`;

  // Thumbnail: only what was actually extracted is persisted. The
  // resource_type default (Design Lock §6) is applied at render time via
  // resolveAssetThumbnail(), not guessed and written here.
  const thumbnailUrl = metadata.thumbnailUrl;

  // 4. Persist.
  const { asset } = await createAsset({
    organizationId,
    assetType: 'resource', 
    addToLibrary: true,
  });

  const assetResource = await createAssetResource({
    assetId: asset.id,
    organizationId,
    resourceType,
    platform: identified.platform,
    url: validation.url,
    title,
    thumbnailUrl,
    campaignId,
  });

  return { assetResource };
}