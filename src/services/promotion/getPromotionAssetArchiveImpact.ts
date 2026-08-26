/**
 * src/services/promotion/getPromotionArchiveContext.ts
 *
 * Central Promotion Archive Resolver — SURFACE A ONLY, READ ONLY. Mirrors
 * the shape of services/campaign/getCampaignArchiveContext.ts, but the
 * archive condition is PERSONAL (promotion_user_states.archived_at),
 * scoped to (promotion_id, viewerId) — not a global column, unlike
 * Campaign. There is no upstream-derived reason for Promotion under
 * Surface A: whether an Asset used by this Promotion is archived is
 * Surface B (Archive Impact) — a completely separate, non-L1/L2,
 * non-archived-state diagnostic surface. See
 * getPromotionAssetArchiveImpact.ts for that. Do not merge the two here.
 *
 * Level 1 vs Level 2 is a separate signal — archive_ui_visibility
 * (entity_type='promotion') — used ONLY to compute `level`, never to
 * compute `isArchived`. Does NOT add archive_reason / archive_level /
 * archive_source_* columns, and does NOT add promotions.archived_at —
 * forbidden by LOCKED design.
 *
 * No writes. No cascade reads into promotion_assets/assets — Archive
 * Impact (Surface B) is intentionally a separate module/concern.
 *
 * Callers:
 *   - pages/PromotionDetail.tsx (getPromotionArchiveContext — single promotion)
 */

import { supabase } from '../../lib/supabase';

export type PromotionArchiveLevel = 'normal' | 'level1' | 'level2';

export interface PromotionArchiveContext {
  promotionId: string;
  isArchived: boolean;
  isHiddenByViewer: boolean;
  level: PromotionArchiveLevel;
}

// ── Single-promotion entry point (PromotionDetail.tsx) ───────────────────

export async function getPromotionArchiveContext(
  promotionId: string,
  viewerId: string
): Promise<PromotionArchiveContext> {
  const { data, error } = await supabase
    .from('promotion_user_states')
    .select('archived_at')
    .eq('promotion_id', promotionId)
    .eq('user_id', viewerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load promotion archive state: ${error.message}`);
  }

  const isArchived = !!data?.archived_at;
  const isHiddenByViewer = isArchived ? await getIsHiddenByViewer(promotionId, viewerId) : false;

  return buildContext(promotionId, isArchived, isHiddenByViewer);
}

// ── Batch entry point (kept for parity with Asset/Video/Campaign; not ────
// currently required by Marketplace.tsx, which already maintains its own
// archivedPromotionMap via promotionArchive.ts's bulk getter and only
// needs the Level 2 hidden-id set on top of it — see
// archiveUiVisibility.ts's getHiddenPromotionIdsForUser for that.)

export interface PromotionForArchiveContext {
  id: string;
  archivedAt: string | null;
}

export async function getPromotionArchiveContextsForViewer(
  promotionsIn: PromotionForArchiveContext[],
  viewerId: string
): Promise<Map<string, PromotionArchiveContext>> {
  if (promotionsIn.length === 0) return new Map();

  const archivedIds = promotionsIn.filter(p => !!p.archivedAt).map(p => p.id);
  const hiddenSet = archivedIds.length > 0
    ? await getHiddenPromotionIdsBulk(archivedIds, viewerId)
    : new Set<string>();

  const result = new Map<string, PromotionArchiveContext>();
  for (const p of promotionsIn) {
    const isArchived = !!p.archivedAt;
    const isHiddenByViewer = isArchived && hiddenSet.has(p.id);
    result.set(p.id, buildContext(p.id, isArchived, isHiddenByViewer));
  }
  return result;
}

// ── Shared level computation ──────────────────────────────────────────────

function buildContext(
  promotionId: string,
  isArchived: boolean,
  isHiddenByViewer: boolean
): PromotionArchiveContext {
  const level: PromotionArchiveLevel = !isArchived ? 'normal' : isHiddenByViewer ? 'level2' : 'level1';
  return { promotionId, isArchived, isHiddenByViewer, level };
}

// ── Queries ────────────────────────────────────────────────────────────────

async function getIsHiddenByViewer(promotionId: string, viewerId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('archive_ui_visibility')
    .select('id')
    .eq('entity_type', 'promotion')
    .eq('entity_id', promotionId)
    .eq('user_id', viewerId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load archive_ui_visibility state: ${error.message}`);
  return !!data;
}

async function getHiddenPromotionIdsBulk(
  promotionIds: string[],
  viewerId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('archive_ui_visibility')
    .select('entity_id')
    .eq('entity_type', 'promotion')
    .eq('user_id', viewerId)
    .in('entity_id', promotionIds);

  if (error) throw new Error(`Failed to bulk-load archive_ui_visibility: ${error.message}`);
  return new Set((data ?? []).map((row: any) => row.entity_id as string));
}