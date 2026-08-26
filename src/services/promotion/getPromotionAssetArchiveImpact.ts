/**
 * src/services/promotion/getPromotionAssetArchiveImpact.ts
 *
 * SURFACE B — Archive Impact. Diagnostic/informational only. This is NOT
 * Promotion Archive (that's Surface A — see getPromotionArchiveContext.ts
 * and promotionArchive.ts). Per LOCKED design:
 *
 *   - If an Asset used by a Promotion becomes archived, the Promotion does
 *     NOT automatically archive, does NOT leave My Promotions, does NOT
 *     automatically remove a collaborator, and does NOT automatically
 *     revoke asset or tracking-domain access.
 *   - No Level 1 / Level 2 for this surface. No Hide/Unhide. No Restore.
 *   - This module writes NOTHING and triggers NO automatic Remove/Revoke
 *     of anything. Actual Remove/Revoke remains a manual, separate user
 *     action (see removeCollaborator.ts / assignmentAssetAccess.ts /
 *     assignmentTrackingDomainAccess.ts, all untouched by this module).
 *
 * Per-Asset reasons are read-time derived from the existing, single
 * authoritative Asset resolver (services/asset/getAssetArchiveContext.ts)
 * — this module does NOT independently join asset_user_states / videos /
 * campaigns and does NOT introduce a second Asset archive calculation.
 * Uses the single-entry getAssetArchiveContext() per promoted asset
 * (rather than the batch entry point) because it self-resolves each
 * asset's type from the `assets` table itself — this module deliberately
 * does not require callers to already know each promoted asset's
 * asset_type, since getPromotionDetail.ts's exact row shape was not
 * inspected as part of this phase (kept the resolver's public surface
 * bulletproof against that unknown rather than guessing it).
 *
 * Callers:
 *   - pages/PromotionDetail.tsx (Promoted Assets — Archive Impact banner)
 */

import { getAssetArchiveContext, type AssetArchiveContext } from '../asset/getAssetArchiveContext';

export interface PromotionAssetImpact {
  assetId: string;
  context: AssetArchiveContext;
}

export interface PromotionArchiveImpact {
  archivedAssetCount: number;
  /** Only entries where context.isArchived === true. */
  impacts: PromotionAssetImpact[];
}

export async function getPromotionAssetArchiveImpact(
  assetIds: string[],
  viewerId: string
): Promise<PromotionArchiveImpact> {
  if (assetIds.length === 0) {
    return { archivedAssetCount: 0, impacts: [] };
  }

  const settled = await Promise.all(
    assetIds.map(async (assetId): Promise<PromotionAssetImpact | null> => {
      try {
        const context = await getAssetArchiveContext(assetId, viewerId);
        return { assetId, context };
      } catch (err) {
        // Diagnostic surface only — a single asset failing to resolve
        // (e.g. deleted, or a transient RLS/network issue) must never
        // block the rest of the Promotion page from rendering.
        console.error(`[getPromotionAssetArchiveImpact] failed for asset ${assetId}:`, err);
        return null;
      }
    })
  );

  const impacts = settled.filter(
    (x): x is PromotionAssetImpact => !!x && x.context.isArchived
  );

  return { archivedAssetCount: impacts.length, impacts };
}