/**
 * src/services/asset/getAsset.ts
 *
 * Fetches a single Asset by id. Does not join to `videos` — callers who need
 * display metadata should use listAssetsByOrganization.ts instead.
 *
 * Not called by anything yet in Phase 1. Included because it is part of the
 * locked Asset Module skeleton (Design Lock §3 Step 2), not a new addition.
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
