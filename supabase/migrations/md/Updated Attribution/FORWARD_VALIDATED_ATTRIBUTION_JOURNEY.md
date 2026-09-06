# Forward-Validated Attribution Journey — Implementation Plan

**Status:** PLANNING ONLY. No source files edited, no migrations created, no behavior changed.

**Scope note on repository coverage:** This plan is built from the files actually
inspected in this audit: `tracker.ts`, `Track.tsx`, `installationHelpers.ts`,
`pixel.ts`, `redirects.ts`, `stripe-webhook.ts`, `resolveBridgeAttribution.ts`,
`resolvePixelConversionProvenance.ts`, plus schema/index dumps for `events`,
`pixel_purchases`, `redirect_links`, `stripe_purchases`, `videos`, `assets`,
`campaign_element_assets`. Files referenced but **not** inspected —
`journeyAnalyticsEngine.ts`, `assetAnalyticsEngine.ts`, `campaignRedirectEngine.ts`,
`generateAssetRedirectLinks.ts`, `buildCampaignRedirectJobs.ts` — are flagged
inline wherever the plan depends on them. Before Phase 1 begins, these should be
read and this document corrected if they change any assumption below.

---

## 1. Problem we are solving

The current First Touch implementation (`tracker.ts`, `setAttribution()`) writes
a single value per key, once, guarded only by "does this key already exist in
localStorage":

```ts
if (redirectLinkId && !localStorage.getItem(FT_REDIRECT_LINK_ID_KEY)) {
  localStorage.setItem(FT_REDIRECT_LINK_ID_KEY, redirectLinkId);
}
```

This has no concept of when a "journey" ends. It literally implements: *"the
first VSTRK redirect this browser has ever clicked, for as long as localStorage
survives"* — not *"the first touch of the visitor's current journey."*

Concretely, this breaks in the following case, confirmed against the actual
code (no reset/expiration logic exists anywhere in `tracker.ts`, `Track.tsx`,
`installationHelpers.ts`, `redirects.ts`, `pixel.ts`, or `stripe-webhook.ts` —
verified by direct grep, not assumed):

```text
Product A:
  Video A → Video B → Video C   (no purchase)

later, same browser, localStorage never cleared:

Product B:
  Video N → Video M → Video O → Purchase
```

Product B's purchase calls `getFirstTouchRedirectLinkId()` and receives
`Redirect A` — Product A's redirect link — because nothing ever told First
Touch that Product A's journey had ended. This is not hypothetical: this exact
mechanism already feeds `stripe_purchases.redirect_link_id` /
`redirect_link_token` via the Stripe `client_reference_id` composite string
(confirmed in `stripe-webhook.ts`), so any live multi-tenant/multi-product
traffic through that path is exposed to this today.

Simply keeping First Touch fixed (i.e., "add an org-id reset boundary") was
considered and rejected: `organization_id` is not a safe universal boundary,
because cross-organization promotion is a legitimate, real pattern in VSTRK
(Org B's video can legitimately promote Org A's asset). A boundary based on
organization would incorrectly reset a real cross-org continuation.

---

## 2. New behavior

Instead of a single overwritable value, the browser maintains a **validated
journey** — an ordered array of nodes, each one added only after being proven
to connect to the previous node via an existing VSTRK database relationship
(not by simple time-adjacency or URL string matching).

```text
Video A                         journey = [A]
  ↓ (validated continuation)
Video B                         journey = [A, B]
  ↓ (validated continuation)
Video C                         journey = [A, B, C]
  ↓ (validated continuation)
Video D                         journey = [A, B, C, D]
```

If a later redirect does **not** validate as a continuation of the stored
journey:

```text
existing journey: [A, B, C]

visitor clicks an unrelated tracked redirect → resolves to Video N
        ↓
validation fails (N is not videos.asset_id-linked to C's promoted asset)
        ↓
journey RESET → [N]
```

First Touch is no longer an independently-written value — it is simply
`journey[0]`. Current/last touch is `journey[journey.length - 1]`. This
removes the current design's three (or more) independently-maintained FT_*
keys in favor of one array, derived reads for the two things people actually
want (origin, latest).

---

## 3. Files that need modification

Based on files actually inspected:

### `src/lib/tracker.ts`
**Why:** This is where `setAttribution()`, the `FT_*` key constants, and all
`getFirstTouch*()` accessors currently live. This is the natural home for the
new journey state and its accessors — it's already the single source of truth
for attribution-related localStorage.
**Existing section involved:** the `FT_*` constant block (lines ~14-21 in the
version inspected) and `setAttribution()` (lines ~103-164).
**New behavior added:** replace the eight independent `FT_*` keys with a single
`JOURNEY_KEY` holding a JSON-serialized array; add the continuation-validation
call before deciding whether to append or reset.

### `src/pages/Track.tsx`
**Why:** This is the only confirmed call site of `setAttribution()` today
(Step 4 of `handleRedirect()`), and it already has every piece of data a
continuation check needs in scope: `link.asset_id`, `link.video_id`,
`link.organization_id`, resolved fresh from `redirect_links` on every redirect
hit.
**Existing section involved:** Step 4 (`setAttribution({...})` call) and Step 6
(`getFirstTouch*()` reads used to build outbound URL params and the Stripe
composite `client_reference_id`).
**New behavior added:** Step 4's call becomes `appendJourneyNode(...)` (see
Section 5); Step 6's six separate `getFirstTouch*()` calls collapse into one
`getJourney()` call, reading `journey[0]` / `journey[last]` as needed.

### `src/components/installation/installationHelpers.ts`
**Why:** This is the embedded `<script>` template shipped to customer
websites (`generateAttributionPixel()`), and it currently implements a second,
non-write-once, non-journey-aware copy of the first-touch logic
(`yt_tracker_ft_redirect_link_id`) that only carries a single ID forward via
URL param — it has no concept of a journey array at all.
**Existing section involved:** the `firstTouchRedirectLinkId` resolution block
inside the generated script string.
**New behavior added:** this file needs the most careful handling — see the
open question flagged in Section 12. At minimum, the destination-side
JSON-encoded journey (passed via a URL param from `Track.tsx`, e.g.
`vt_journey`) needs to be read, stored, and re-attached to the outbound pixel
payload without ever re-validating or re-deriving continuation client-side on
the destination domain (that would require asset/video schema access that
this embedded script does not and should not have).

### `api/pixel.ts`
**Why:** This is the current server-side consumer of
`first_touch_redirect_link_id`. It needs to instead accept and parse the full
journey array from the payload.
**Existing section involved:** the `first_touch_redirect_link_id` handling
block (`ftLink` lookup) and the final `events`/`pixel_purchases` insert calls.
**New behavior added:** parse an incoming `journey` field (JSON array), store
`journey[0]` as the first-touch reference on the row (new column — see
Section 13), and preserve the existing single-value fallback lookup logic for
payloads that arrive without a journey (old cached scripts, direct API
callers).

### `api/stripe-webhook.ts`
**Why:** Currently decodes First Touch from positions 3/4 of the composite
`client_reference_id` string. This format is a fixed-position, `__`-delimited
string — it cannot cleanly carry a variable-length array without a format
change.
**Existing section involved:** the `client_reference_id` parsing block
(`parts[3]`, `parts[4]`).
**New behavior added:** flagged as **not in scope for this phase** — see
Section 10. Per your own instruction in a prior message ("treat Stripe as a
separate unresolved path"), this file's format should not be touched until the
pixel path is proven. Left unchanged in Phase 1–5 below.

### `src/lib/redirects.ts`
**Why:** This is where `redirect_links` rows are created (`createRedirectLink`)
and where `bridge_token` is generated. It is **not** expected to need behavior
changes for this feature — the continuation check reads existing
`redirect_links`/`videos` data, it does not need new writes here. Listed for
completeness because it's the source-of-truth schema for the FK relationship
this feature depends on (`redirect_links.asset_id` → `videos.asset_id`).
**Existing section involved:** none requiring edits.
**New behavior added:** none anticipated. Flagged for review only in case
`bridge_token` generation logic needs to interact with journey state — current
analysis says no.

### Not yet located — needs inspection before Phase 2
- Whatever file(s) implement `videos.asset_id` lookups today (candidate:
  `services/asset/getAssetIdentity.ts`, `resolveAssetType.ts`, per the file
  tree — not inspected in this audit). The continuation check needs a single
  "given asset_id X, return video row(s) where `videos.asset_id = X`" query;
  if existing code already exposes this, it should be reused rather than
  duplicated.
- `services/attribution/resolvePixelConversionProvenance.ts` and
  `resolveBridgeAttribution.ts` do not need changes for the forward-journey
  feature itself, but their role changes (see Section 11) — they become
  fallback-only, invoked less often. No code change required in Phase 1–5,
  but their invocation *site* (wherever `pixel_purchase_attributions` resolution
  is triggered — not yet built, per your own earlier scoping) needs to check
  "does this purchase have a usable forward journey?" before falling back to
  them.

---

## 4. Existing functions — reuse decision

| Function | Location | Decision |
|---|---|---|
| `setAttribution()` | `tracker.ts` | **Replace.** Its single-key-per-field write-once model is exactly the mechanism being removed. Superseded by `appendJourneyNode()`. |
| `getFirstTouchVideoId()`, `getFirstTouchCampaignId()`, `getFirstTouchOrganizationId()`, `getFirstTouchTrackingHostname()`, `getFirstTouchRedirectLinkId()`, `getFirstTouchRedirectLinkToken()` | `tracker.ts` | **Deprecate, replace with derived reads.** All six become `getJourney()[0].<field>` in the four call sites that currently use them (all in `Track.tsx`). Keep the six function *names* as thin wrappers around `getJourney()` only if avoiding call-site churn is preferred — otherwise remove them outright. Recommend removing them: six wrapper functions returning the same derived value adds indirection without benefit once `getJourney()` exists. |
| `getVideoId()`, `getCampaignId()`, `getPromotionId()`, `getAssetId()` (current-touch, non-FT) | `tracker.ts` | **Unchanged.** These serve a different, still-valid purpose (current touchpoint for pricing/thank-you-pixel resolution) and are untouched by this feature. |
| `getSessionId()` | `tracker.ts` | **Unchanged.** Session ID remains a separate concern; journey nodes do not replace or duplicate session tracking. |
| `resolveRedirectToken()`, `buildRedirectUrl()`, `logRedirectEvent()` | `redirects.ts` | **Unchanged.** These already return/consume everything the continuation check needs (`video_id`, `asset_id`, `organization_id` on the resolved `RedirectLink`). No signature changes required. |
| `resolveBridgeAttribution()`, `resolvePixelConversionProvenance()` | `services/attribution/` | **Unchanged in code, changed in role.** Remain exactly as implemented; become the fallback path invoked only when a purchase arrives with no usable forward journey (see Section 11). |

---

## 5. New functions needed

Kept intentionally minimal — four functions, not the full six suggested in the
brainstorm (`resetJourney()` is folded into `appendJourneyNode()`'s internal
logic rather than exposed separately, since a reset is never something a
caller decides to do independently of an append attempt).

### `getJourney(): JourneyNode[]`
- **Purpose:** Read and parse the current journey array from localStorage.
- **Inputs:** none.
- **Outputs:** `JourneyNode[]` (empty array if none stored or JSON parse fails).
- **Lives in:** `tracker.ts`.

### `appendJourneyNode(node: JourneyNode): void`
- **Purpose:** The single entry point for extending or resetting the journey.
  Internally calls `validateJourneyContinuation()`; on success, pushes `node`
  onto the existing array; on failure (or empty existing journey), replaces
  the stored journey with `[node]`. This is the direct replacement for
  `setAttribution()`.
- **Inputs:** `node: JourneyNode` (see Section 6 for shape).
- **Outputs:** none (writes to localStorage).
- **Lives in:** `tracker.ts`.

### `validateJourneyContinuation(lastNode: JourneyNode | null, newNode: JourneyNode): Promise<boolean>`
- **Purpose:** The core continuation check. Given the current last node (or
  `null` if journey is empty) and the incoming candidate node, determines
  whether `newNode` is a legitimate continuation via the
  `redirect_links.asset_id → videos.asset_id` relationship.
- **Inputs:** `lastNode: JourneyNode | null`, `newNode: JourneyNode`.
- **Outputs:** `Promise<boolean>`.
- **Lives in:** `tracker.ts`, or a new `journeyContinuity.ts` if `tracker.ts`
  is judged too large already (not assessed in this audit — file line count
  should be checked before deciding).
- **Note:** this is the one new function requiring a Supabase query
  (`videos` lookup by `asset_id`), making it the only async addition to what
  is otherwise a synchronous localStorage read/write API. `Track.tsx`'s
  `handleRedirect()` is already `async`, so this doesn't change the call
  site's control flow shape.

### `getPredictedNextVideoIds(promotedAssetId: string | null): Promise<string[]>`
- **Purpose:** Isolated helper used by `validateJourneyContinuation()` —
  given an asset ID, return every `videos.id` where `videos.asset_id` matches.
  Separated out specifically so it can be swapped for an existing
  service-layer function if one is found during the "not yet located" file
  search in Section 3, without touching the validation logic itself.
- **Inputs:** `promotedAssetId: string | null`.
- **Outputs:** `Promise<string[]>` (empty array if `promotedAssetId` is null
  or no match).
- **Lives in:** `tracker.ts` initially; relocate if a suitable existing
  function is found.

`getJourney()`/`appendJourneyNode()` together fully replace `resetJourney()`
as a separate concept — there is no code path where resetting without
attempting an append makes sense, so a dedicated reset function would be an
unused surface.

---

## 6. Journey state shape

```ts
interface JourneyNode {
  redirect_link_id: string;
  video_id: string;
  asset_id: string | null;
}
```

**Fields deliberately excluded, and why:**
- `campaign_id`, `promotion_id`, `organization_id`, `tracking_hostname`,
  `redirect_link_token` — all of these are already recoverable by joining
  `redirect_link_id` back to `redirect_links` server-side, at the point
  they're actually needed (e.g., in `api/pixel.ts`, which already performs
  this exact lookup for `first_touch_redirect_link_id` today). Storing them
  redundantly in every node multiplies localStorage payload size with data
  the server can derive in one query. The one exception worth flagging:
  `redirect_link_token` specifically is used today in the Stripe composite
  `client_reference_id` (`finalFirstTouchRedirectLinkToken`) — if the Stripe
  path is later adapted to consume the journey (out of scope per Section 10),
  it may need `journey[0].redirect_link_token` directly rather than requiring
  a server round-trip mid-checkout-redirect. Flagged, not resolved, here.

**Maximum journey length:** the previously suggested 15–20 nodes is
reasonable as a ceiling but should be treated as a safety cap, not a design
target — realistic funnels in the data reviewed (doc 13 test traces) were
2–4 hops. Recommend capping at 20 and dropping the *oldest* non-first node
if exceeded (i.e., always keep `journey[0]` for First Touch integrity, trim
from the middle/most-recent end if the array somehow grows unbounded — this
should not happen in normal use and hitting the cap should be logged as
anomalous).

---

## 7. Continuation algorithm

```text
appendJourneyNode(newNode)
        ↓
existingJourney = getJourney()
lastNode = existingJourney[existingJourney.length - 1] ?? null
        ↓
IF lastNode IS null:
    → journey was empty. Start fresh: [newNode]. STOP.
        ↓
IF lastNode IS NOT null:
    validateJourneyContinuation(lastNode, newNode):
        ↓
        IF lastNode.asset_id IS NULL:
            → cannot determine what lastNode promoted. NO MATCH.
            → (this is a deliberate fail-closed choice, not a gap —
               see Section 12)
        ↓
        ELSE:
            predictedVideoIds = getPredictedNextVideoIds(lastNode.asset_id)
                (queries: SELECT id FROM videos WHERE asset_id = lastNode.asset_id)
            ↓
            IF predictedVideoIds is empty:
                → the promoted asset has no known video (e.g. it's a
                  Resource Asset or Campaign Element Asset, not a Video
                  Asset — no videos.asset_id row exists for those types
                  per the asset-type taxonomy). NO MATCH.
            ↓
            IF newNode.video_id IN predictedVideoIds:
                → MATCH. Append newNode.
            ↓
            ELSE:
                → NO MATCH. Reset: journey = [newNode].
```

**Explicit case-by-case behavior:**

| Case | Behavior |
|---|---|
| `asset_id IS NULL` (on the *previous* node) | Cannot validate — treated as NO MATCH, journey resets. This means a hop through a non-promoted, non-asset-linked redirect always breaks the chain going forward, even if the *next* hop would have been a real continuation. Flagged as a real limitation in Section 12, not silently patched over. |
| `videos.asset_id IS NULL` for all candidates | Same as "predictedVideoIds is empty" above — NO MATCH, reset. |
| Multiple videos match an asset | `predictedVideoIds` naturally handles this as a set — `newNode.video_id IN predictedVideoIds` is satisfied by any match, no special-casing needed. This is expected and correct: one asset (e.g. a lead magnet) can legitimately be promoted by several different videos. |
| Redirect cannot be resolved / invalid token | `Track.tsx` already handles this upstream (`setError(true)`, early return) — `appendJourneyNode()` is never called if the redirect itself fails to resolve. No new handling needed. |
| Journey is empty (first-ever redirect for this browser) | Handled explicitly above: `lastNode === null` → start `[newNode]` with no validation attempt (nothing to validate against). |
| `localStorage` missing/blocked | `getJourney()` returns `[]` (same as "empty" case) if read fails; `appendJourneyNode()`'s write is wrapped in try/catch matching the existing pattern already used in `Track.tsx` around `setAttribution()` today (private browsing / storage quota tolerance). |

---

## 8. Cross-organization behavior

No special-case code is needed for `Org B → Asset A → Org A` because the
algorithm never reads or compares `organization_id` at any point — the match
is purely `redirect_links.asset_id → videos.asset_id → videos.id`. Org B's
Video B promoting Asset A, followed by a redirect resolving to Org A's
Video A (which has `videos.asset_id = Asset A`), validates as a continuation
automatically, with zero additional logic. This is a direct consequence of
the algorithm design in Section 7, not an added exception.

---

## 9. Direct YouTube viewing behavior

Confirmed by re-reading `Track.tsx`: `appendJourneyNode()` (replacing
`setAttribution()`) is only ever reachable through `handleRedirect()`, which
only runs when the React Router `token` param resolves — i.e., only when a
`vstrk.com/:token` (or verified custom tracking domain) URL is actually
loaded. A visitor watching a video directly on youtube.com never executes
any VSTRK client code, so the journey in localStorage is untouched. No new
guard is needed for this case; it's already true of the current
`setAttribution()` call site and remains true for its replacement.

---

## 10. Purchase behavior

**Pixel path (`api/pixel.ts`):** the payload gains a new field, `journey`
(JSON-stringified `JourneyNode[]`, mirroring how `first_touch_redirect_link_id`
is sent today). `pixel.ts` parses it and uses `journey[0]` wherever
`first_touch_redirect_link_id` is used today (the `ftLink` lookup block).
The rest of `journey` (intermediate nodes) is **not** used for real-time
resolution in Phase 1–5 — it exists so the fallback snapshot table (below)
can store it as-is without a second round of backward reconstruction.

**Does `pixel_purchases` need modification?** Recommend **no** — keep it as
a raw event-facing table, consistent with the "additive only, don't touch
existing tables" constraint already established for this feature area in
earlier planning. The journey data belongs in the attribution/snapshot table
instead.

**Does `pixel_purchase_attributions` (not yet built) still apply, and what's
its role now?** Yes, but its role changes from *resolver* to *snapshotter*
for the common case:

```text
NEW pixel_purchase arrives with journey field populated
        ↓
journey is non-empty and well-formed
        ↓
SNAPSHOT: store journey as-is into pixel_purchase_attributions
        (match_method = 'forward_journey', resolution_status = 'resolved')
        ↓
DONE — no backward query needed
```

```text
NEW pixel_purchase arrives with journey field EMPTY or missing
  (cleared localStorage, blocked storage, private browsing, pre-upgrade
   cached tracking script, tracking script never executed for some hop)
        ↓
FALLBACK: existing backward-resolution hierarchy runs
  (redirect_link_id → bridge_token → session-provenance → URL,
   as already scoped in prior planning)
        ↓
match_method reflects whichever fallback tier actually resolved it
resolution_status = resolved / ambiguous / unresolved, as already designed
```

**Stripe path:** explicitly out of scope for this plan, per your own
instruction to treat Stripe as a separate, not-yet-investigated path. The
`client_reference_id` composite format is not touched. `stripe_purchases`
continues receiving only `journey[0]`-equivalent data (i.e., unchanged
behavior) until Stripe is separately audited.

---

## 11. What this feature eliminates (and what it doesn't)

**Eliminates, for the common case:** the need to run the backward
reconstruction hierarchy (session-provenance matching, bridge_token lookups,
URL matching) for every purchase. When a well-formed forward journey arrives
with the purchase, the expensive part of the originally-planned resolver is
skipped entirely.

**Does NOT eliminate:** the backward-resolution logic itself, or
`pixel_purchase_attributions` as a concept, or `resolveBridgeAttribution()` /
`resolvePixelConversionProvenance()` as functions. These remain exactly as
designed, demoted to fallback-only status. Claiming they can be deleted would
not be supported by the actual constraint identified earlier in this
investigation: localStorage is not authoritative (cleared storage, different
device, blocked storage, private browsing, or a hop where the tracking script
never executed all produce a purchase with no usable forward journey,
regardless of how correct the forward-validation algorithm is).

---

## 12. What this feature does NOT solve

Stated plainly, not minimized:

- **`localStorage` cleared / different device / private browsing:** journey
  is empty at purchase time → falls back to backward resolution, with all of
  that mechanism's existing limitations (ambiguity from non-visitor-specific
  signals, as already documented in prior planning).
- **Tracking script missing on some hop** (e.g., a hop through a page where
  the pixel script failed to load or execute): the journey simply doesn't
  record that hop. If the *next* hop after the missing one still resolves
  through `Track.tsx`, its `validateJourneyContinuation()` check will compare
  against whatever the *last successfully recorded* node was — which may now
  be several real hops behind the visitor's actual position. If that gap
  breaks the asset-chain match, the journey resets, silently under-attributing
  rather than over-attributing. This is the same fail-closed direction as the
  `asset_id IS NULL` case in Section 7 — the algorithm never guesses to keep
  a chain alive, it only confirms.
- **Destination video not asset-ified** (`videos.asset_id IS NULL`): as
  detailed in Section 7, this always breaks continuation at that specific
  hop. This is an operational dependency on content being published as Video
  Assets, not a code gap — no algorithm change fixes this; only ensuring
  content is asset-ified before promotion does.
- **A hop through a non-VSTRK, non-tracked link** (e.g., a raw hyperlink
  embedded in a video description instead of a `vstrk.com/:token` redirect):
  invisible to this mechanism entirely, same as today.

None of these are made worse by this feature relative to today's single-value
First Touch — they represent the same class of "no data available" cases
that the fallback path already has to handle. This feature does not claim to
solve them; it makes the *provable* cases provable, and leaves the rest to
the existing fallback.

---

## 13. Migration/database impact

**Client-side (localStorage):** no migration — this is purely a change to
what's stored in the browser under existing key names (or one renamed key,
`JOURNEY_KEY` replacing the eight `FT_*` keys). No server schema involved.

**Server-side:** **Yes, a migration is required**, but a small, additive one:

- `api/pixel.ts` needs somewhere to persist `journey[0]` (or the full array)
  per the design in Section 10. If `pixel_purchase_attributions` does not
  yet exist (confirmed: it does not, per prior schema dumps), this table
  needs to be created as already scoped in earlier planning, with one
  addition: a `journey` JSONB column (or `first_touch_redirect_link_id` +
  a separate `journey_snapshot` JSONB column, if the full path is worth
  keeping for future analytics beyond just the origin — recommend the
  latter, since discarding the intermediate nodes throws away exactly the
  data this feature was built to capture).
- No changes to `events`, `pixel_purchases`, `redirect_links`, or
  `stripe_purchases` are required by this feature.

Exact DDL is intentionally not included here — per your instruction, this
document is planning only.

---

## 14. Implementation order

```text
Phase 1 — Journey state helpers (tracker.ts)
  getJourney(), appendJourneyNode() skeleton (no validation yet —
  temporarily always appends), JourneyNode type. Ships behind no
  behavior change yet if appendJourneyNode() is not yet wired to
  Track.tsx.

Phase 2 — Continuation validation
  validateJourneyContinuation(), getPredictedNextVideoIds().
  Wire into appendJourneyNode() from Phase 1. This is the highest-risk
  phase — see Section 17.

Phase 3 — Track.tsx integration
  Replace setAttribution() call with appendJourneyNode(). Replace the
  six getFirstTouch*() reads in Step 6 with getJourney()[0] /
  getJourney()[last]. Verify outbound URL param building still works
  (vt_oid, vt_th, vt_first_touch_redirect_link_id derivations).

Phase 4 — Destination propagation (installationHelpers.ts)
  Add journey read/carry-forward to the embedded script. Requires the
  open design question in Section 3 / 12 to be resolved first (does the
  destination script re-validate, or just carry the array through
  untouched?). Recommend: carry through untouched, no re-validation
  client-side on destination domain — see risk note in Section 17.

Phase 5 — Purchase pixel + server (api/pixel.ts)
  Accept `journey` field, parse, use journey[0] in place of today's
  first_touch_redirect_link_id lookup, write to
  pixel_purchase_attributions per Section 10/13 (requires migration
  from Section 13 to land first).

Phase 6 — Fallback wiring
  Confirm the trigger point for pixel_purchase_attributions creation
  checks "is journey present and well-formed?" before invoking the
  existing backward-resolution hierarchy. No changes to
  resolveBridgeAttribution.ts / resolvePixelConversionProvenance.ts
  themselves.

Phase 7 — Cleanup
  Remove the six deprecated getFirstTouch*() wrapper functions and the
  eight FT_* key constants from tracker.ts, once Phase 3 confirms no
  other call sites depend on them (grep confirms today's only caller is
  Track.tsx — recheck at cleanup time in case other work landed in the
  interim).
```

Stripe webhook changes are explicitly **not** a phase in this plan — separate
effort, per Section 10.

---

## 15. Testing plan

**Test A — Simple chain:** `A → B → C`, each hop's promoted asset correctly
resolves to the next video via `videos.asset_id`. Expected: `journey = [A, B, C]`,
`first_touch = A`, `current_touch = C`.

**Test B — Unrelated second journey:** `A → B → C` (no purchase), then later
same browser hits unrelated `N` with no asset-chain link to `C`. Expected:
`journey = [N]`. `A, B, C` no longer present or referenced.

**Test C — Cross-org continuation:** Org B's Video B promotes Asset A; a
subsequent redirect resolves to Org A's Video A, where
`videos.asset_id = Asset A`. Expected: `journey = [B, A]` (single continuous
journey), despite the organization change.

**Test D — Direct YouTube viewing:** visitor watches a video directly, no
VSTRK redirect clicked. Expected: no localStorage journey key written or
modified; confirm via inspecting localStorage before/after.

**Test E — Video without `asset_id`:** promoted asset has no
`videos.asset_id` match (e.g., it's a Campaign Element Asset or Resource
Asset, not a Video Asset). Expected: `getPredictedNextVideoIds()` returns
`[]`, next hop always resets the journey rather than silently guessing a
match. Explicitly verify the reset happens rather than an exception being
thrown or the old journey being incorrectly preserved.

**Test F — Cleared localStorage:** simulate empty/missing journey at
purchase time. Expected: `journey` field on the pixel payload is empty/
absent; server-side falls back to the existing backward-resolution hierarchy;
`pixel_purchase_attributions.match_method` reflects a fallback tier, not
`forward_journey`.

**Test G — Repeated click on the same redirect:** visitor clicks the exact
same `vstrk.com/:token` link twice in a row (e.g., double-click, or clicks
"back" and re-clicks). Expected: `newNode.video_id` will typically equal
`lastNode.video_id` in this case — decide explicitly whether this should
append a duplicate node (`[A, A]`) or be treated as a no-op. **Recommend
no-op** (skip append if `newNode.redirect_link_id === lastNode.redirect_link_id`),
since a duplicate node adds no attribution information and inflates the
array toward the length cap for no benefit. This specific rule is not yet
covered by the Section 7 algorithm and should be added as an early
short-circuit check inside `appendJourneyNode()`.

---

## 16. Before/after architecture diagram

```text
CURRENT:

  redirect
     ↓
  setAttribution() — write-once, single value per FT_* key,
  no continuation awareness
     ↓
  purchase
     ↓
  backward resolver required for every purchase
  (session-provenance / bridge_token / URL matching)


NEW:

  redirect
     ↓
  validateJourneyContinuation() — checks redirect_links.asset_id
  → videos.asset_id against the last stored node
     ↓
  appendJourneyNode() — extend if valid, reset to [newNode] if not
     ↓
  (repeat for each subsequent tracked redirect)
     ↓
  purchase — journey array sent with payload
     ↓
  IF journey present & well-formed:
      snapshot directly into pixel_purchase_attributions
  ELSE:
      fall back to backward resolver (unchanged, demoted to
      exception-path only)
```

---

## 17. Risk assessment

**Overall: MEDIUM.**

This is a contained tracking-layer change — it touches `tracker.ts`,
`Track.tsx`, `installationHelpers.ts`, and `api/pixel.ts`, all of which are
already the exact files this entire audit has been focused on. It does not
touch unrelated application areas (no changes anticipated to Analytics
engines, campaign/promotion CRUD, asset management, or auth). That argues for
LOW.

What pushes it to MEDIUM rather than LOW:

1. **`validateJourneyContinuation()` introduces a new synchronous-feeling but
   actually async Supabase query into the client-side redirect hot path**
   (`Track.tsx`'s `handleRedirect()`). This function is already doing two
   parallel Supabase calls (`resolveRedirectToken` + `redirect_links` fetch);
   adding a third sequential call (querying `videos` by `asset_id`) adds
   latency to every tracked redirect, which is user-facing (the visitor is
   sitting on a spinner during this). Should be measured, not assumed
   negligible.

2. **`installationHelpers.ts` (Phase 4) is the highest-uncertainty file.**
   It's a script template shipped to and executed on *customer-owned*
   third-party domains, with no Supabase access and no ability to run the
   asset/video validation query itself. The plan above resolves this by
   having the destination script carry the array through untouched, trusting
   the validation that already happened server-side (via `Track.tsx`) at the
   moment the redirect was generated — but this means the destination-side
   write-once problem identified earlier in this audit (the embedded script
   can still be made to overwrite/corrupt the carried array if not
   implemented carefully) is not automatically fixed by this feature; it
   needs its own explicit write-once-equivalent guard for the journey array,
   analogous to the fix already identified for the old single-value
   `yt_tracker_ft_redirect_link_id` key.

3. **Migration dependency ordering** (Section 13/14): Phase 5 cannot ship
   without the `pixel_purchase_attributions` table existing first, which
   means this feature and the previously-scoped persistent-attribution table
   work are no longer independent — they need to land together or in the
   correct sequence, not as two unrelated efforts.

None of these are reasons to avoid the approach — they're the specific
places where "medium" review attention is warranted before Phase 2 and
Phase 4 are implemented.
