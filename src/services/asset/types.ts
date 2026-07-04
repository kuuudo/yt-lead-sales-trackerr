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

export interface CreateAssetInput {
  organizationId: string;
  assetType: 'video';
}

export interface CreateAssetResult {
  asset: Asset;
}

export interface ListAssetsByOrganizationInput {
  organizationId: string;
  filters?: {
    assetType?: string;
  };
}

export interface AddToLibraryResult {
  asset: Asset;
}
