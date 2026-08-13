// ─────────────────────────────────────────────────────────────────────────────
// journeyAnalyticsEngine.ts
//
// PURPOSE: Given ONE conversion (a stripe_purchases or pixel_purchases row),
// reconstruct the strongest possible evidence-based user journey that led to
// it, using only real joins that exist in the current schema.
//
// This file is fully independent of `analyticsEngine.ts`. It imports nothing
// from it and analyticsEngine.ts imports nothing from here. That file remains
// the protected, unmodified baseline for existing Stripe/Pixel revenue
// metrics — this file answers a different question entirely: not "how much
// revenue," but "what journey do we actually have evidence of."
//
// LOCKED SCOPE (confirmed 2026-08-13 — do not expand without an explicit,
// separate decision):
//
//   1. journey = ORDERED SEQUENCE OF EVIDENCE, not a tree. No step is ever
//      labeled "primary," "owner," or "final." A journey like
//      Video B → Video A → Newsletter → Newsletter Thank-You is preserved
//      exactly as it happened, in order — never collapsed into a
//      video → asset → conversion hierarchy.
//
//   2. NO DEDUPE, NO COLLAPSE. If the same video or asset appears twice in
//      the same session, both are kept as separate JourneyStep entries.
//      Deciding "distinct assets touched = 1" is a downstream Asset/
//      Promotion Analytics concern, not this engine's.
//
//   3. `purchase.redirect_link_id` / `redirect_link_token` (Stripe-only) is
//      NOT used to reconstruct the journey. Verified against real
//      production data: stripe_purchases.redirect_link_id can point to a
//      DIFFERENT redirect link than the one recorded on the checkout event
//      in the very same session. It is kept only as a confirmed fact about
//      the purchase row itself — never a join key into the journey.
//
//   4. The only journey boundary is session_id equality:
//         purchase.session_id → events WHERE session_id = purchase.session_id
//      This is an application-layer equality match, NOT a foreign key —
//      there is no `sessions` table anywhere in this schema, and no column
//      on `events` carries a database-enforced link back to a purchase.
//
//   5. NO CROSS-SESSION STITCHING. Verified against real production data:
//      a landing_page visit and its checkout can land under two different
//      session_id values, and only the LAST one reaches
//      stripe_purchases.session_id. There is currently no column anywhere
//      in this schema (vt_first_touch_redirect_link_id only ever appears in
//      a URL query string, never persisted) that connects two different
//      session_ids. This is reported as a structural unknown, never
//      bridged with a heuristic.
//
//   6. campaign_element_assets MUST be looked up via the COMPOSITE key
//      (asset_id, campaign_id) — both columns are NOT NULL on that table,
//      and the same asset_id can legitimately map to a different
//      element_type under a different campaign_id. Never look it up by
//      asset_id alone.
//
//   7. Event-row snapshot data and live redirect_links join data are kept
//      SEPARATE, never merged. A redirect_links row can be edited after an
//      event fired against it, so event.asset_id / event.promotion_id /
//      event.link_type must never be overwritten by, or silently unified
//      with, redirectLinks lookup values for the same step.
//
//   8. This engine does NOT: resolve promotion owners or collaborators,
//      compute revenue attribution or credit assignment, pick a "final" or
//      "terminal" step, aggregate anything across purchases, or do any UI/
//      chart shaping. `promotion_id` and `asset_id` are preserved on each
//      step purely as observed evidence — resolving what a promotion_id
//      MEANS (owner, collaborator, performance) is explicitly deferred to
//      future promotionAnalyticsEngine.ts / assetAnalyticsEngine.ts /
//      collaboratorAnalyticsEngine.ts files that consume this engine's
//      output.
//
//   9. Resource-type assets (source: asset_resources) have NO campaign_id
//      provenance in this schema — asset_resources has no campaign_id
//      column. This engine reports that as unknown; it does not modify the
//      schema or infer a campaign relationship.
// ─────────────────────────────────────────────────────────────────────────────


// ═════════════════════════════════════════════════════════════════════════════
// INPUT ROW TYPES — shaped from the verified Supabase schema
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CanonicalConversionRow
 *
 * Unifies stripe_purchases and pixel_purchases into one shape so
 * buildPurchaseJourney() doesn't need two code paths. Only CONFIRMED fields
 * — ones that sit directly on the purchase row — belong here. Nothing
 * derived, nothing joined.
 *
 * Stripe-only fields (redirect_link_id / redirect_link_token) are optional
 * and simply absent for pixel conversions. They are kept on the returned
 * `Journey.purchase` for completeness, but — per locked scope §3 — are
 * never used to drive journey reconstruction.
 */
export interface CanonicalConversionRow {
  id:                    string;
  source:                'stripe' | 'pixel';
  amount:                number | string | null; // Supabase may return numeric as string
  created_at:            string;
  session_id:            string | null;
  video_id:              string | null;
  campaign_id:           string | null;
  promotion_id:          string | null;
  organization_id:       string | null;
  // Stripe-only — present verbatim if supplied, never required, never used
  // as a join key (see locked scope §3).
  redirect_link_id?:     string | null;
  redirect_link_token?:  string | null;
}

/**
 * JourneyEvent — mirrors the `events` table exactly (verified schema,
 * 2026-08-13). session_id is NOT NULL on the real table; kept required here.
 */
export interface JourneyEvent {
  id:                  string;
  session_id:          string;
  video_id:            string | null;
  campaign_id:         string | null;
  event_type:          string | null;
  created_at:          string;
  organization_id:     string | null;
  promotion_id:        string | null;
  asset_id:            string | null;
  redirect_link_id:    string | null;
  tracking_hostname:   string | null;
  link_type:           string | null;
}

/**
 * JourneyRedirectLinkRow — the FULL redirect_links shape needed for journey
 * work (id, asset_id, promotion_id, destination_url, etc.).
 *
 * Deliberately named differently from analyticsEngine.ts's own
 * `RedirectLinkRow`, which is a thin { token, link_type } shape used only
 * for Stripe revenue-type classification there. Kept as a distinct type so
 * nothing collides if a future component imports both files.
 */
export interface JourneyRedirectLinkRow {
  id:                 string;
  token:              string;
  video_id:           string | null;
  campaign_id:        string | null;
  link_type:          string;              // NOT NULL on the real table
  destination_url:    string;              // NOT NULL on the real table
  organization_id:    string | null;
  promotion_id:       string | null;
  asset_id:           string | null;
  tracking_hostname:  string | null;
}

/**
 * CampaignElementAssetRow — mirrors campaign_element_assets exactly.
 * asset_id + campaign_id are both NOT NULL and together form the ONLY valid
 * lookup key — verified that the same asset_id can map to a different
 * element_type under a different campaign_id (locked scope §6).
 */
export interface CampaignElementAssetRow {
  id:            string;
  asset_id:      string;
  campaign_id:   string;
  element_type:  string;
  source_field:  string;
  display_name:  string;
}


// ═════════════════════════════════════════════════════════════════════════════
// OUTPUT TYPES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * JourneyStepRedirectLink — the redirect_links data joined for this one
 * step, kept as its OWN nested object so it never overwrites the parent
 * JourneyStep's event-snapshot fields (locked scope §7). Its `elementType`
 * is resolved from this redirect link's own (asset_id, campaign_id) and is
 * intentionally independent from JourneyStep.elementType below.
 */
export interface JourneyStepRedirectLink {
  id:               string;
  token:            string;
  asset_id:         string | null;
  campaign_id:      string | null;
  promotion_id:     string | null;
  link_type:        string;
  destination_url:  string;
  elementType:      string | null;
}

/**
 * JourneyStep — one `events` row, enriched, never merged/collapsed/deduped
 * against any other step (locked scope §1–2). Steps are chronological
 * (ascending created_at) — that ordering is the only signal this engine
 * provides; it never labels a step "final" or "primary" (locked scope §8).
 */
export interface JourneyStep {
  event_id:            string;
  created_at:          string;
  event_type:          string | null;
  session_id:          string;

  // Confirmed — verbatim from the events row itself.
  video_id:            string | null;
  campaign_id:         string | null;
  promotion_id:        string | null;
  asset_id:            string | null;
  redirect_link_id:    string | null;
  link_type:           string | null;
  tracking_hostname:   string | null;
  organization_id:     string | null;

  // Derived — only populated if event.redirect_link_id resolved to a real
  // row in the redirectLinks input. Never fabricated.
  redirectLink:        JourneyStepRedirectLink | null;

  // Derived — element_type resolved from THIS event's own
  // (asset_id, campaign_id) composite key (locked scope §6). null if either
  // is missing on the event itself, or no matching campaign_element_assets
  // row exists. Never borrowed from redirectLink.elementType, never
  // borrowed from any other step.
  elementType:         string | null;
}

/**
 * Journey — the full reconstruction for ONE purchase.
 */
export interface Journey {
  purchase: {
    id:                     string;
    source:                 'stripe' | 'pixel';
    amount:                 number;
    created_at:             string;
    session_id:             string | null;
    video_id:               string | null;
    campaign_id:            string | null;
    promotion_id:           string | null;
    organization_id:        string | null;
    // Present only for Stripe, and — per locked scope §3 — NOT used to
    // derive `steps` below. Kept purely as a confirmed fact about the row.
    redirect_link_id?:      string | null;
    redirect_link_token?:   string | null;
  };

  // All events sharing purchase.session_id, ordered by created_at ascending.
  // Empty if purchase.session_id is null, or no events matched it.
  steps: JourneyStep[];

  meta: {
    // Exactly [purchase.session_id] if present, else []. Kept as an array
    // (not a bare string) so that if a future schema change enables real
    // cross-session stitching, this return shape doesn't need to change —
    // only how it's populated would.
    joinedSessionIds:      string[];
    // Structural gaps this engine will NOT attempt to resolve. Always
    // includes 'cross_session' (see locked scope §5 — this boundary exists
    // regardless of how many steps were found). Includes 'journey_steps'
    // when no events matched purchase.session_id at all. Callers should
    // treat this as an explicit "here is what we know we don't know," never
    // an incidental empty array.
    unresolvedDimensions:  string[];
  };
}


// ═════════════════════════════════════════════════════════════════════════════
// buildPurchaseJourney
// ═════════════════════════════════════════════════════════════════════════════

/**
 * parseSupabaseTimestamp
 *
 * Supabase/Postgres commonly returns timestamptz values like
 * "2026-08-11 09:09:59.654767+00" — a space separator and a timezone
 * offset with NO minutes component. Verified: `new Date(...)` returns
 * Invalid Date (NaN) for that exact shape in Node/V8, which would silently
 * corrupt the chronological sort below (Array.prototype.sort with a NaN
 * comparator leaves elements in an unpredictable, non-chronological order
 * without throwing). This only normalizes the STRING FORMAT for parsing —
 * it does not alter, infer, or guess at the value itself.
 */
function parseSupabaseTimestamp(raw: string): number {
  const normalized = raw.trim()
    .replace(' ', 'T')                 // "YYYY-MM-DD HH:MM:SS" → "...T..."
    .replace(/([+-]\d{2})$/, '$1:00'); // "+00" / "-05" → "+00:00" / "-05:00"
  const t = new Date(normalized).getTime();
  return Number.isNaN(t) ? new Date(raw).getTime() : t;
}

/**
 * buildPurchaseJourney
 *
 * For ONE conversion, reconstructs the ordered sequence of journey steps
 * observable via session_id equality, enriching each step independently
 * with redirect_links and campaign_element_assets data wherever a real join
 * exists. Never guesses, never merges event-snapshot data with live joined
 * data, never designates a "final" step, never resolves promotion/asset
 * ownership. See the file header for the full set of locked scope decisions
 * this follows.
 */
export function buildPurchaseJourney(
  conversion:              CanonicalConversionRow,
  events:                  JourneyEvent[],
  redirectLinks:           JourneyRedirectLinkRow[],
  campaignElementAssets:   CampaignElementAssetRow[],
): Journey {
  const amount = parseFloat(String(conversion.amount ?? '0'));

  const purchase: Journey['purchase'] = {
    id:                    conversion.id,
    source:                conversion.source,
    amount,
    created_at:            conversion.created_at,
    session_id:            conversion.session_id,
    video_id:              conversion.video_id,
    campaign_id:           conversion.campaign_id,
    promotion_id:          conversion.promotion_id,
    organization_id:       conversion.organization_id,
    redirect_link_id:      conversion.redirect_link_id ?? null,
    redirect_link_token:   conversion.redirect_link_token ?? null,
  };

  const joinedSessionIds = conversion.session_id ? [conversion.session_id] : [];

  // No session_id at all on the purchase row — nothing to join against.
  // Not an error; just the honest boundary (locked scope §4).
  if (!conversion.session_id) {
    return {
      purchase,
      steps: [],
      meta: {
        joinedSessionIds,
        unresolvedDimensions: ['cross_session', 'journey_steps'],
      },
    };
  }

  const sessionEvents = events
    .filter(e => e.session_id === conversion.session_id)
    .slice()
    .sort((a, b) => parseSupabaseTimestamp(a.created_at) - parseSupabaseTimestamp(b.created_at));

  // Cross-session evidence is structurally unreachable under the current
  // schema regardless of whether sessionEvents is empty — always flagged
  // (locked scope §5).
  const unresolvedDimensions: string[] = ['cross_session'];
  if (sessionEvents.length === 0) {
    unresolvedDimensions.push('journey_steps');
  }

  const redirectLinkById = new Map(redirectLinks.map(r => [r.id, r]));

  // Composite (asset_id, campaign_id) key — see locked scope §6. asset_id
  // alone is never a valid lookup into campaign_element_assets.
  const elementTypeByCompositeKey = new Map(
    campaignElementAssets.map(cea => [`${cea.asset_id}::${cea.campaign_id}`, cea.element_type]),
  );
  const resolveElementType = (assetId: string | null, campaignId: string | null): string | null => {
    if (!assetId || !campaignId) return null;
    return elementTypeByCompositeKey.get(`${assetId}::${campaignId}`) ?? null;
  };

  const steps: JourneyStep[] = sessionEvents.map((evt): JourneyStep => {
    const linkRow = evt.redirect_link_id ? redirectLinkById.get(evt.redirect_link_id) ?? null : null;

    const redirectLink: JourneyStepRedirectLink | null = linkRow ? {
      id:               linkRow.id,
      token:            linkRow.token,
      asset_id:         linkRow.asset_id,
      campaign_id:      linkRow.campaign_id,
      promotion_id:     linkRow.promotion_id,
      link_type:        linkRow.link_type,
      destination_url:  linkRow.destination_url,
      // Independent lookup using the redirect link's OWN (asset_id,
      // campaign_id) — deliberately not the event's — the link row can
      // carry a different campaign_id than the event it was clicked from
      // (locked scope §7).
      elementType:      resolveElementType(linkRow.asset_id, linkRow.campaign_id),
    } : null;

    return {
      event_id:            evt.id,
      created_at:           evt.created_at,
      event_type:           evt.event_type,
      session_id:           evt.session_id,
      video_id:             evt.video_id,
      campaign_id:          evt.campaign_id,
      promotion_id:         evt.promotion_id,
      asset_id:             evt.asset_id,
      redirect_link_id:     evt.redirect_link_id,
      link_type:            evt.link_type,
      tracking_hostname:    evt.tracking_hostname,
      organization_id:      evt.organization_id,
      redirectLink,
      // Resolved from the event's OWN (asset_id, campaign_id) — separate
      // from redirectLink.elementType above; never merged with it
      // (locked scope §7).
      elementType:          resolveElementType(evt.asset_id, evt.campaign_id),
    };
  });

  return {
    purchase,
    steps,
    meta: { joinedSessionIds, unresolvedDimensions },
  };
}
