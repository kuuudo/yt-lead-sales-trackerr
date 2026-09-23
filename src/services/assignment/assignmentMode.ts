/**
 * Shared Assignment Mode helpers.
 * assignment_mode is the product source of truth (regular | creative).
 * creative_creation_mode is legacy dual-write / read fallback only.
 */

export type AssignmentMode = 'regular' | 'creative';

export type LegacyCreativeCreationMode =
  | 'campaign_asset_only'
  | 'campaign_links_and_assets'
  | null;

export type AssetScope = 'promotion_only' | 'allow_additional';

/** Prefer assignment_mode; fall back to legacy creative_creation_mode. */
export function resolveAssignmentMode(row: {
  assignment_mode?: string | null;
  creative_creation_mode?: string | null;
}): AssignmentMode {
  const m = row.assignment_mode;
  if (m === 'regular' || m === 'creative') return m;
  const legacy = row.creative_creation_mode;
  if (legacy === 'campaign_links_and_assets' || legacy === 'campaign_asset_only') {
    return 'creative';
  }
  return 'regular';
}

export function resolveAssetScope(
  raw: string | null | undefined
): AssetScope | null {
  if (raw === 'promotion_only' || raw === 'allow_additional') return raw;
  return null;
}

/** Dual-write value for legacy column when creating/updating. */
export function legacyCreativeCreationModeFor(
  mode: AssignmentMode
): LegacyCreativeCreationMode {
  // New product only uses creative vs regular; map creative → campaign_links_and_assets
  return mode === 'creative' ? 'campaign_links_and_assets' : null;
}
