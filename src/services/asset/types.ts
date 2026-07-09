/**
 * src/services/asset/types.ts
 *
 * Shared types for the Asset Module.
 *
 * `Asset` itself is defined once in lib/supabase.ts (single source of truth
 * for DB row shapes, consistent with how Video/Campaign are already typed).
 * This file only defines the Input/Output shapes for this module's functions.
 */

import type { Asset } from '../../lib/supabase';

export type { Asset };

export type AssetType =
  | 'video'
  | 'campaign_element'
  | 'resource';

export interface CreateAssetInput {
  organizationId: string;
  assetType: AssetType;
  /**
   * Default false — preserves existing behavior for createVideo.ts, which
   * relies on a separate explicit "Add to Library" action to set this
   * later. Import Asset passes true: pasting a URL directly into the
   * Asset Library means immediate library visibility, there's no
   * intermediate step.
   */
  addToLibrary?: boolean;
}

export interface CreateAssetResult {
  asset: Asset;
}

export interface ListAssetsByOrganizationInput {
  organizationId: string;
  filters?: {
    assetType?: AssetType;
  };
}

export interface AddToLibraryResult {
  asset: Asset;
}