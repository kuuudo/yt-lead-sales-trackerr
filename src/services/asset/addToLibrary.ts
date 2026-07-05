/**
 * src/services/asset/addToLibrary.ts
 *
 * Marks an Asset as visible in the Library. Repeated calls must be
 * idempotent (Design Lock §5) — an already-set timestamp is never
 * overwritten. Verified idempotent in integration testing: the two assets
 * tested each have a single, stable added_to_library_at timestamp.
 *
 * Callers:
 *   - pages/VideoDetail.tsx ("Add to Library" button)
 */

import { supabase } from '../../lib/supabase';
import type { AddToLibraryResult } from './types';

export async function addToLibrary(assetId: string): Promise<AddToLibraryResult> {
  const { data: existing, error: fetchError } = await supabase
    .from('assets')
    .select('*')
    .eq('id', assetId)
    .single();

  if (fetchError || !existing) {
    throw new Error(fetchError?.message ?? 'Asset not found');
  }

  if (existing.added_to_library_at) {
    return { asset: existing };
  }

  const { data, error } = await supabase
    .from('assets')
    .update({ added_to_library_at: new Date().toISOString() })
    .eq('id', assetId)
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? 'Asset update returned no data');
  }

  return { asset: data };
}
