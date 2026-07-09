/**
 * src/services/asset/createAsset.ts
 *
 * Creates a new Asset row. Asset is Content Identity — minimal by design:
 * no title, no owner_user_id, no metadata columns at all. Metadata always
 * lives on the type-specific table (e.g. `videos`) and is retrieved via join
 * (see listAssetsByOrganization.ts).
 *
 * Not responsible for:
 *   - Creating the `videos` row (caller's job — see video/createVideo.ts)
 *   - Any compensation/rollback logic if a later step fails (caller's job)
 *
 * Callers:
 *   - video/createVideo.ts (Phase 1)
 */

import { supabase } from '../../lib/supabase';
import type { CreateAssetInput, CreateAssetResult } from './types';

export async function createAsset({
  organizationId,
  assetType,
  addToLibrary = false,
}: CreateAssetInput): Promise<CreateAssetResult> {
  const { data, error } = await supabase
    .from('assets')
    .insert([{
      organization_id: organizationId,
      asset_type: assetType,
      added_to_library_at: addToLibrary ? new Date().toISOString() : null,
    }])
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Asset insert returned no data');
  }

  return { asset: data };
}
