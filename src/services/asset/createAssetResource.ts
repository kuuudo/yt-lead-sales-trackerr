/**
 * src/services/asset/createAssetResource.ts
 *
 * Persists the asset_resources row. Structurally mirrors createVideo.ts's
 * steps 1-2: called AFTER createAsset() by importAsset.ts, and if this
 * insert fails, the just-created Asset is compensated (deleted) — same
 * pattern as createVideo.ts's compensation on a failed videos insert. The
 * Asset is guaranteed to have zero references at this point, so deleting
 * it is safe.
 *
 * Not responsible for: calling createAsset() itself (caller's job — keeps
 * this a single INSERT + compensation, testable in isolation).
 */

import { supabase } from '../../lib/supabase';
import type { ResourceType } from '../../lib/videoFormatters';
import type { Platform } from '../../lib/platformParser';

export interface CreateAssetResourceInput {
  assetId: string;
  organizationId: string;
  resourceType: ResourceType;
  platform: Platform | 'website';
  url: string;
  title: string | null;
  thumbnailUrl: string | null;
  campaignId?: string | null;
}

export interface AssetResource {
  id: string;
  asset_id: string;
  organization_id: string;
  campaign_id: string | null;
  resource_type: string;
  platform: string;
  url: string;
  title: string | null;
  thumbnail_url: string | null;
  description: string | null;
  author_name: string | null;
  published_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export async function createAssetResource({
  assetId,
  organizationId,
  resourceType,
  platform,
  url,
  title,
  thumbnailUrl,
  campaignId = null,
}: CreateAssetResourceInput): Promise<AssetResource> {
  const { data, error } = await supabase
    .from('asset_resources')
    .insert([{
      asset_id: assetId,
      organization_id: organizationId,
      resource_type: resourceType,
      platform,
      url,
      title,
      thumbnail_url: thumbnailUrl,
      campaign_id: campaignId,
    }])
    .select()
    .single();

  if (error || !data) {
    const { error: compensationError } = await supabase
      .from('assets')
      .delete()
      .eq('id', assetId);

    if (compensationError) {
      console.error(
        '[createAssetResource] Compensation failed — orphaned asset:',
        assetId,
        compensationError.message
      );
    }

    throw new Error(error?.message ?? 'asset_resources insert returned no data');
  }

  return data as AssetResource;
}