/**
 * src/services/asset/getAsset.ts
 *
 * Fetches a single Asset by id. Does not join to `videos` — callers who need
 * display metadata should use listAssetsByOrganization.ts instead.
 *
 * Callers:
 *   - video/deleteVideo.ts (resolves the Video's Asset to decide soft vs hard delete)
 *   - pages/VideoDetail.tsx (loads Library status for the Add to Library button)
 */

import { supabase } from '../../lib/supabase';
import type { Asset } from './types';

export async function getAsset(assetId: string): Promise<Asset | null> {
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('id', assetId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ?? null;
}
