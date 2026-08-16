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
//   3. AMENDED 2026-08-16 (see §12 — do not re-read this as still absolute).
//      `purchase.redirect_link_id` is still NEVER used — verified real data
//      shows it can point to a redirect_links row that doesn't even match
//      the purchase's own `redirect_link_token` (e.g. purchase.redirect_link_id
//      = eefd41da..., but the row with that purchase's token N1Gj is a
//      DIFFERENT row, ef874960...). `redirect_link_id` equality is
//      unreliable and stays banned as a join key.
//      `purchase.redirect_link_token`, however, IS now used — narrowly — as
//      one of two Attribution Verification paths (§12). The original reason
//      this was banned (checkout event's redirect_link differs from the
//      purchase's) turned out to be explained, not disproven: the purchase
//      captures the FIRST-TOUCH token, while a checkout event's own
//      redirect_link is a distinct, later-stage link with its own token.
//      They're allowed to differ by design — the token is only ever
//      compared against the FIRST-TOUCH-shaped event it actually matches,
//      never used as a blanket "every step must equal this" join.
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
//
//  10. JOURNEY EVIDENCE CONTRACT (added 2026-08-16): session_id equality
//      alone is NOT sufficient for an event to become a JourneyStep.
//      session_id and campaign_id are near-universal on `events` rows —
//      they are grouping keys, not proof of a real touchpoint. After the
//      session_id boundary (§4) is applied, each session-matched event must
//      ALSO pass isJourneyEligibleEvidence(): Tier A event types
//      (consultation, newsletter, sales_call) are eligible unconditionally;
//      everything else needs at least one non-null Evidence Anchor
//      (organization_id, promotion_id, asset_id, redirect_link_id,
//      tracking_hostname, link_type, or value). Events that fail this check
//      are excluded from Journey.steps only — they are never deleted or
//      mutated in the raw `events` data this engine receives.
//
//  11. PAGE_VIEW HARD EXCLUSION (added 2026-08-16): event_type === 'page_view'
//      is now excluded from Journey.steps unconditionally, before the Tier
//      A / Evidence Anchor check even runs — confirmed against real
//      tracking data where a meaningful touchpoint always produces a
//      SEPARATE semantic event (landing_page, checkout, ...) carrying the
//      attribution fields; page_view itself has never been observed to
//      carry them. Every other event_type (known or unknown) still goes
//      through Tier A / Evidence Anchor exactly as in §10 — this is a
//      single named carve-out, not a reversion to an event_type blacklist.
//
//  12. ATTRIBUTION VERIFICATION CONTRACT (added 2026-08-16): §10's
//      Evidence Contract proves an event is REAL (not tracking noise). It
//      does NOT prove the event belongs to THIS conversion. Verified real
//      data: session_id in this schema is a persistent, localStorage-backed
//      client identifier, not a bounded browser session — the SAME
//      session_id was observed spanning ~2 months and multiple distinct
//      campaign_ids (1615 page_view / 78 checkout / 63 landing_page / 32
//      consultation / 8 sales_call / 3 newsletter events, all sharing one
//      session_id). Tier A auto-eligibility (§10) previously meant a
//      consultation/sales_call/newsletter event became a JourneyStep purely
//      by type, with no proof it belonged to this purchase — that gap is
//      closed here. Every event that passes §10/§11 must ALSO pass
//      isAttributionVerified() before becoming a JourneyStep:
//
//        VERIFIED  — token-chain match: event.redirect_link_id resolves (via
//                    the redirectLinks input) to a token equal to
//                    conversion.redirect_link_token (the purchase's captured
//                    FIRST-TOUCH token — Stripe only); OR campaign+org
//                    match: event.campaign_id === conversion.campaign_id AND
//                    event.organization_id === conversion.organization_id
//                    (both must be present on the CONVERSION side — a
//                    missing field there is never treated as a wildcard).
//        AMBIGUOUS — passed §10/§11 (real, anchored evidence) but matched
//                    NEITHER path above. Not deleted, not called wrong —
//                    just insufficiently proven to belong to THIS
//                    conversion specifically. Excluded from `steps`, counted
//                    in `meta.attributionSummary.ambiguous`.
//        REJECTED  — failed §10/§11 (page_view, or no evidence anchor), or
//                    failed the temporal check in §13.
//
//      Deliberately NOT implemented as a third path: promotion_id / asset_id
//      equality. Both are too sparsely/inconsistently populated on
//      historical purchase and event rows to serve as a trustworthy
//      boundary yet (locked scope §8 — this engine never fabricates
//      missing attribution). Revisit once promotion_id is reliably written
//      on both sides.
//
//  13. TEMPORAL CAUSALITY (added 2026-08-16): an event with
//      created_at > conversion.created_at is rejected before any other
//      check runs. This is not an arbitrary lookback window (none is
//      imposed) — it is the logical fact that an event occurring AFTER the
//      purchase cannot be evidence of the journey that LED to it. Given
//      §12's finding that session_id can span months, this is a cheap,
//      always-correct floor under the rest of the contract, not a
//      replacement for it.
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
  // Added for the Journey Evidence Contract's `value` anchor check (see
  // isJourneyEligibleEvidence below). Nothing on this engine read `value`
  // before now. Presence, not truthiness, is what's checked — `value = 0`
  // is a written value and counts as an anchor; only NULL/undefined don't.
  value:               number | string | null;
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
  value:               number | string | null;

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
    // Additive (locked scope §12) — diagnostic breakdown of why the raw
    // session_id match did or didn't collapse down to `steps`. Never
    // required reading; existing callers reading only `steps` are
    // unaffected.
    attributionSummary: {
      rawSessionEvents:      number;
      rejectedFutureEvent:   number;
      rejectedNoEvidence:    number;
      ambiguous:             number;
      verified:              number;
    };
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

// ═════════════════════════════════════════════════════════════════════════════
// JOURNEY EVIDENCE CONTRACT
//
// Fixes the bug where every event sharing the purchase's session_id was
// admitted into Journey.steps, with no eligibility check. session_id and
// campaign_id are near-universal on `events` rows — they are grouping keys,
// not proof a row is a real journey touchpoint. This section is the only
// thing standing between "session-matched" and "journey-eligible."
//
// Verified real-data case this must exclude: event_type = 'page_view',
// session_id + campaign_id present, organization_id / promotion_id /
// asset_id / redirect_link_id / tracking_hostname / link_type / value all
// NULL. That row must never reach Journey.steps.
//
// Verified real-data cases this must keep: 'consultation' / 'newsletter' /
// 'sales_call' events, and a 'landing_page' event carrying organization_id,
// promotion_id, redirect_link_id, tracking_hostname, and link_type.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * TIER_A_EVENT_TYPES
 *
 * Intrinsically behavioral event types: the type itself asserts a real user
 * action occurred, so no Evidence Anchor is required. Kept as an explicit,
 * maintained list — never inferred — per the file's existing "never guess"
 * principle (see locked scope). 'sales_call' is included alongside the
 * originally-confirmed 'consultation' / 'newsletter' because it is the same
 * category of explicit conversion/engagement event; it happened to also
 * carry anchors in the sample row, so this inclusion doesn't change that
 * row's outcome — flagging it here so it can be corrected if wrong.
 *
 * 'page_view' and 'landing_page' are deliberately NOT in this list — both
 * are ambient/contextual types that can fire with no attribution, so both
 * fall through to the anchor check (Tier B) instead.
 */
const TIER_A_EVENT_TYPES: ReadonlySet<string> = new Set([
  'consultation',
  'newsletter',
  'sales_call',
]);

/**
 * hasEvidenceAnchor
 *
 * An Evidence Anchor is a field whose non-null presence proves the event is
 * tied to something more specific than "happened during this session."
 * session_id, campaign_id, and video_id are deliberately excluded — they are
 * association/grouping fields present on nearly every row, not proof of a
 * real touchpoint.
 *
 * `value` is checked for presence (`!= null`), not truthiness: `value = 0`
 * is a deliberately written value and counts as an anchor. Only NULL /
 * undefined mean "no value was recorded."
 */
function hasEvidenceAnchor(evt: JourneyEvent): boolean {
  return (
    evt.organization_id    != null ||
    evt.promotion_id       != null ||
    evt.asset_id           != null ||
    evt.redirect_link_id   != null ||
    evt.tracking_hostname  != null ||
    evt.link_type          != null ||
    evt.value              != null
  );
}

/**
 * isJourneyEligibleEvidence
 *
 * The Journey Evidence Contract's admission test, applied AFTER the
 * session_id boundary (session matching is unchanged — this is an
 * additional filter on top of it, not a replacement for it):
 *
 *   event_type === 'page_view'   → ALWAYS excluded, unconditionally (see below)
 *   Tier A event_type            → eligible unconditionally (type IS the evidence)
 *   Tier B/C (anything else,
 *   including null/unrecognized) → eligible only if hasEvidenceAnchor(evt)
 *
 * page_view is a hard exclusion, not folded into the Tier B anchor check,
 * per an explicit decision made on real tracking data (2026-08-16): every
 * observed case where a meaningful touchpoint occurred, the attribution
 * fields (asset_id, redirect_link_id, link_type, tracking_hostname, etc.)
 * showed up on a PAIRED semantic event (landing_page, checkout, ...), never
 * on the page_view row itself. So a page_view row carrying anchors has not
 * been observed to happen — if that assumption turns out to be wrong (a
 * tracker path that writes attribution directly onto a page_view row with
 * no semantic sibling), this exclusion would need to be revisited, since it
 * would then be silently dropping real evidence that the old anchor check
 * would have caught.
 *
 * This is still NOT a general event_type blacklist — only page_view is
 * hardcoded. Every other type (including unknown/future ones) is still
 * decided by Tier A membership or the Evidence Anchor check, not by name.
 */
function isJourneyEligibleEvidence(evt: JourneyEvent): boolean {
  if (evt.event_type === 'page_view') {
    return false;
  }
  if (evt.event_type != null && TIER_A_EVENT_TYPES.has(evt.event_type)) {
    return true;
  }
  return hasEvidenceAnchor(evt);
}

/**
 * isBeforeOrAtConversion — locked scope §13. An event timestamped after the
 * purchase cannot be evidence leading to it.
 */
function isBeforeOrAtConversion(evt: JourneyEvent, conversion: CanonicalConversionRow): boolean {
  return parseSupabaseTimestamp(evt.created_at) <= parseSupabaseTimestamp(conversion.created_at);
}

/**
 * isFirstTouchTokenVerified — Attribution Verification path 1 (locked scope
 * §12). Resolves the event's OWN redirect_link_id to its token via the
 * redirectLinks input, then compares against conversion.redirect_link_token
 * (the purchase's captured first-touch token, Stripe-only). Never compares
 * redirect_link_id values directly — different touchpoints in the same
 * funnel legitimately carry different redirect_link_ids; only the resolved
 * TOKEN is meaningful here, and only against the specific event(s) that are
 * actually the first-touch entry point.
 */
function isFirstTouchTokenVerified(
  evt:              JourneyEvent,
  conversion:       CanonicalConversionRow,
  redirectLinkById: Map<string, JourneyRedirectLinkRow>,
): boolean {
  if (!conversion.redirect_link_token) return false;
  if (!evt.redirect_link_id) return false;
  const link = redirectLinkById.get(evt.redirect_link_id);
  if (!link) return false;
  return link.token === conversion.redirect_link_token;
}

/**
 * isCampaignOrgVerified — Attribution Verification path 2 (locked scope
 * §12). Both conversion.campaign_id AND conversion.organization_id must be
 * present to attempt this path — a missing field on the CONVERSION side is
 * never treated as "matches anything."
 */
function isCampaignOrgVerified(evt: JourneyEvent, conversion: CanonicalConversionRow): boolean {
  if (!conversion.campaign_id || !conversion.organization_id) return false;
  return evt.campaign_id === conversion.campaign_id && evt.organization_id === conversion.organization_id;
}

/**
 * isAttributionVerified — the full VERIFIED test: either path is
 * sufficient (locked scope §12). Callers only reach here for events that
 * already passed §10/§11 (isJourneyEligibleEvidence).
 */
function isAttributionVerified(
  evt:              JourneyEvent,
  conversion:       CanonicalConversionRow,
  redirectLinkById: Map<string, JourneyRedirectLinkRow>,
): boolean {
  return (
    isFirstTouchTokenVerified(evt, conversion, redirectLinkById) ||
    isCampaignOrgVerified(evt, conversion)
  );
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
        attributionSummary: {
          rawSessionEvents: 0, rejectedFutureEvent: 0, rejectedNoEvidence: 0,
          ambiguous: 0, verified: 0,
        },
      },
    };
  }

  // Step 1 of 4: session boundary — unchanged from before (locked scope §4).
  // NOTE (§12): this is now known to be a persistent-client match, not a
  // bounded-session match — it is intentionally kept as the outermost,
  // widest gate; §13/§10/§11/§12 below are what narrow it down safely.
  const sessionEvents = events
    .filter(e => e.session_id === conversion.session_id)
    .slice()
    .sort((a, b) => parseSupabaseTimestamp(a.created_at) - parseSupabaseTimestamp(b.created_at));

  const redirectLinkById = new Map(redirectLinks.map(r => [r.id, r]));

  // Step 2 of 4: temporal causality (locked scope §13).
  const causallyValidEvents = sessionEvents.filter(e => isBeforeOrAtConversion(e, conversion));

  // Step 3 of 4: Journey Evidence Contract (locked scope §10/§11). Raw
  // events themselves are never mutated or discarded; this only decides
  // which events are journey-eligible in principle.
  const eligibleEvents = causallyValidEvents.filter(isJourneyEligibleEvidence);

  // Step 4 of 4: Attribution Verification (locked scope §12). Only VERIFIED
  // events become JourneyStep entries. AMBIGUOUS events are real, anchored
  // evidence with no provable link to THIS conversion — excluded from
  // `steps`, but distinct from REJECTED for diagnostic purposes below.
  const verifiedEvents  = eligibleEvents.filter(e => isAttributionVerified(e, conversion, redirectLinkById));
  const ambiguousEvents = eligibleEvents.filter(e => !isAttributionVerified(e, conversion, redirectLinkById));

  // Cross-session evidence is structurally unreachable under the current
  // schema regardless of verifiedEvents length — always flagged
  // (locked scope §5).
  const unresolvedDimensions: string[] = ['cross_session'];
  if (verifiedEvents.length === 0) {
    unresolvedDimensions.push('journey_steps');
  }

  // Additive diagnostic breakdown — does not change any existing field.
  // Lets a caller distinguish "no journey found" from "journey found but
  // most of the session's activity was correctly excluded as unrelated."
  const attributionSummary = {
    rawSessionEvents:        sessionEvents.length,
    rejectedFutureEvent:     sessionEvents.length - causallyValidEvents.length,
    rejectedNoEvidence:      causallyValidEvents.length - eligibleEvents.length,
    ambiguous:               ambiguousEvents.length,
    verified:                verifiedEvents.length,
  };

  // Composite (asset_id, campaign_id) key — see locked scope §6. asset_id
  // alone is never a valid lookup into campaign_element_assets.
  const elementTypeByCompositeKey = new Map(
    campaignElementAssets.map(cea => [`${cea.asset_id}::${cea.campaign_id}`, cea.element_type]),
  );
  const resolveElementType = (assetId: string | null, campaignId: string | null): string | null => {
    if (!assetId || !campaignId) return null;
    return elementTypeByCompositeKey.get(`${assetId}::${campaignId}`) ?? null;
  };

  const steps: JourneyStep[] = verifiedEvents.map((evt): JourneyStep => {
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
      value:                evt.value,
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
    meta: { joinedSessionIds, unresolvedDimensions, attributionSummary },
  };
}
