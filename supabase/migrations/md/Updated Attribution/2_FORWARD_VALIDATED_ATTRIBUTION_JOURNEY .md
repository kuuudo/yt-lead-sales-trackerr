# FORWARD-VALIDATED ATTRIBUTION JOURNEY

**Status: V1 implemented (Phases 1–6). V2 (edge-based) proposed, not implemented. Phase 7 deferred.**

---

## 1. Purpose

VSTRK needs persistent forward attribution across arbitrary-length content
journeys — not a write-once First Touch, but an ordered chain of validated
hops:

```
A → B
A → B → H
A → B → H → K
A → B → H → K → M
```

Cross-organization journeys are explicitly allowed. Example:

```
Org B Video B → Asset A → Org A Video A
```

`organization_id` must NEVER be used as a universal journey boundary.

Relevant entities: `videos`, `assets`, `campaign_element_assets`,
`asset_resources`, `redirect_links`, `events`, `pixel_purchases`,
`pixel_purchase_attributions`.

---

## 2. Original V1 Architecture

A visitor clicks a VSTRK redirect link. The redirect link identifies the
**source** video for that click only. The system stores a `JourneyNode`:

```ts
interface JourneyNode {
  redirect_link_id: string;
  video_id: string;
  asset_id: string | null;
}
```

Continuation is validated **asset-based**, not edge-based:

```
previous node's asset_id
  → find every videos row sharing that asset_id
  → is the newly-clicked video_id among them?
      yes → append (continuation)
      no  → reset (new journey starting at this node)
```

This is intentionally asset-membership rather than strict source→destination
equality, specifically to support cross-organization continuation (Section 1's
example) without needing to resolve one canonical "next video" up front.

Implemented in `tracker.ts`.

---

## 3. Current Implementation — Phase 1–6 Completed Changes

### `tracker.ts`

Added:
- `JOURNEY_KEY = 'yt_tracker_journey'`
- `MAX_JOURNEY_LENGTH = 20`
- `JourneyNode` interface
- `getJourney()`
- internal `setJourney()`
- `getPredictedNextVideoIds()`
- `validateJourneyContinuation()`
- `appendJourneyNode()`

`appendJourneyNode()` behavior:
- empty journey → start a new journey with the new node
- same `redirect_link_id` as the last node → no-op (duplicate click)
- otherwise validate continuation (see Section 2's algorithm)
- invalid continuation → reset to `[newNode]`
- journey capped at `MAX_JOURNEY_LENGTH` (20); node 0 (First Touch) is
  always preserved when trimming

**`JourneyNode` currently stores source-side data only — it does NOT store
a destination video.** This is the central fact behind the V2 proposal
(Section 9–10).

Old `FT_*` localStorage constants and `setAttribution()` were intentionally
retained. `setAttribution()` still handles current-touch attribution/session
behavior unrelated to the journey mechanism and was never meant to be
removed as part of this feature.

### `Track.tsx`

- Imports `getJourney()` and `appendJourneyNode()` from `tracker.ts`
- Still calls `setAttribution()` (current-touch keys, unchanged)
- Calls `appendJourneyNode()` after the redirect link is resolved
- Reads `journey[0]` for first-touch info where needed; when `journey[0]`
  is not the current click, performs a `redirect_links` lookup to recover
  `organization_id` / `tracking_hostname` / `token` for that original node
- Propagates the journey to the destination via `vt_journey` on the
  redirect URL

**Real-world test observation:** the first VSTRK hop successfully created
and propagated a journey containing Video A (see Section 7).

### `installationHelpers.ts`

The destination-side tracking script now:
- reads `vt_journey` from the URL
- parses it when present and valid
- falls back to `localStorage['yt_tracker_journey']` if the URL param is
  absent
- persists the journey back to localStorage
- includes `journey` (stringified) in the pixel POST payload

Existing legacy attribution parameters (`first_touch_redirect_link_id`,
etc.) were intentionally preserved for backward compatibility / fallback.
**This is the current Phase 4 implementation, not a finished V2 design.**

### `api/pixel.ts`

Now:
- accepts `journey` in the request body (string or array)
- parses it defensively (`parsedJourney`), tolerating parse failure
- derives `journeyFirstTouchRedirectLinkId = parsedJourney[0]?.redirect_link_id`
- computes `effectiveFirstTouchRedirectLinkId = journeyFirstTouchRedirectLinkId ?? first_touch_redirect_link_id ?? null` and uses it for the existing
  `redirect_links` first-touch-context lookup (org/promotion/asset/tracking
  hostname only — never overrides `resolvedVideoId`/`resolvedCampaignId`)
- captures the inserted `pixel_purchases` row's `id` via `.select('id').maybeSingle()`
- writes one row to `pixel_purchase_attributions` per purchase, via
  `upsert(..., { onConflict: 'pixel_purchase_id' })`, using:
  - `match_method: 'forward_journey'` — valid journey present
  - `match_method: 'redirect_link_id'` — no journey, legacy
    `first_touch_redirect_link_id` present
  - `match_method: 'unresolved'` — nothing resolvable

The duplicate-`conversion_id` early-return behavior (the `23505` /
idempotency check on `pixel_purchases`) is unchanged.

**`pixel_purchases` itself was NOT redesigned to contain journey data.**

---

## 4. Database Migration (Already Applied)

```sql
CREATE TABLE public.pixel_purchase_attributions (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pixel_purchase_id             uuid NOT NULL UNIQUE
                                REFERENCES public.pixel_purchases (id)
                                ON DELETE CASCADE,
  first_touch_redirect_link_id  uuid
                                REFERENCES public.redirect_links (id)
                                ON DELETE SET NULL,
  journey_snapshot              jsonb,
  match_method                  text NOT NULL,
  resolution_status             text NOT NULL,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pixel_purchase_attributions_match_method_check
    CHECK (match_method IN (
      'forward_journey', 'redirect_link_id', 'bridge_token',
      'session_provenance', 'url_match', 'unresolved'
    )),
  CONSTRAINT pixel_purchase_attributions_resolution_status_check
    CHECK (resolution_status IN ('resolved', 'ambiguous', 'unresolved'))
);
```

Key properties:
- `pixel_purchase_id` is `UNIQUE NOT NULL` + FK to `pixel_purchases.id`,
  `ON DELETE CASCADE` — guarantees one attribution row per purchase.
- `first_touch_redirect_link_id` FK's to `redirect_links.id`,
  `ON DELETE SET NULL` — losing a redirect link doesn't destroy the
  attribution record.
- `journey_snapshot` is `jsonb`, nullable — stores the full validated
  `JourneyNode[]` verbatim. **Intentionally schema-flexible: already
  supports arbitrary N-hop journeys with no changes needed.**
- `match_method` / `resolution_status` are `text` + `CHECK`, not native
  Postgres enums (matches this schema's existing convention of plain
  string status fields, e.g. `link_type`, `event_type`).
- RLS is enabled with **no client-facing policies** — writes happen only
  via the service-role key in `api/pixel.ts`.
- **No `content_a`/`content_b`/`content_c` columns exist or are proposed.**

---

## 5. Fallback Architecture (Decision Already Made)

The old heavy attribution resolvers (`resolveBridgeAttribution.ts`,
`resolvePixelConversionProvenance.ts`) are **NOT called inline** during the
purchase pixel request. They remain untouched and are treated as
fallback/reconciliation/evidence-gathering tools for a future offline/admin
pass — not the real-time journey engine. (`resolvePixelConversionProvenance.ts`
explicitly documents that it "never picks a winner" and requires inputs —
full session event arrays, caller-supplied candidate bridge event IDs — that
don't exist in the pixel request path.)

Current lightweight fallback hierarchy in `api/pixel.ts`, in order:

1. **Valid forward journey** → `match_method = 'forward_journey'`,
   `resolution_status = 'resolved'`
2. **No valid journey, but legacy `first_touch_redirect_link_id` present**
   → `match_method = 'redirect_link_id'`, `resolution_status = 'resolved'`
3. **Nothing resolvable** → `match_method = 'unresolved'`,
   `resolution_status = 'unresolved'`

---

## 6. Real-World Test

**Setup:**
- Video A: `videos.id = 19ded023-ae85-4af2-a2e9-f4b42fffc69f`,
  `youtube_video_id = g4Ycr2Vo5KY`
- Redirect link `d3es`: `id = 8eb7c1fd-10d6-46cb-b3a9-8aa740712c22`,
  `video_id = 19ded023-...` (Video A), `destination_url =
  https://www.youtube.com/watch?v=Gh8G2uZu9O4`, `asset_id =
  cd08c4ec-48dd-493d-abbf-d274a98ac467`

**Flow tested:** YouTube Video A description → VSTRK link
`https://www.vstrk.com/d3es` clicked.

**Result:** Redirect token resolved correctly; source Video A resolved
correctly; `setAttribution()` and `syncSession()` ran; localStorage
populated; the destination URL correctly included:

```json
vt_journey=[{"redirect_link_id":"8eb7c1fd-...","video_id":"19ded023-...","asset_id":"cd08c4ec-..."}]
```

**What this proved:** the transport/persistence pipeline (Track.tsx →
`vt_journey` → installationHelpers.ts → pixel payload) works correctly for
the current source-oriented journey model.

**What it exposed:** the system did **not** immediately resolve and store
`Video A → Video B`, even though `redirect_links.destination_url` already
identifies the destination. This is the origin of the V2 proposal below.

---

## 7. Architecture Gap Discovered

**Current model:** click → record current click's **source** as a
`JourneyNode` → wait for the *next* VSTRK click → validate that click's
source against the *previous* node's asset membership.

**Gap:** a single redirect link already encodes an edge
(`source video → destination_url`). The current model discards the
destination side entirely and only reconstructs continuation reactively,
one click later, via asset membership — never via direct edge equality.

---

## 8. Proposed V2 — Edge-Based Forward Journey

**NOT IMPLEMENTED. Proposed only, pending approval.**

Every VSTRK redirect click represents an edge:

```
SOURCE VIDEO → DESTINATION VIDEO
```

Example: `d3es` → Video A → Video B. Another link `Ebid` → Video G → Video H.

At click time, resolve **both sides** of the edge immediately (not just the
source, as V1 does).

Continuation rule:

```
compare: previous edge's destination video  vs.  current edge's source video

if previous.destination === current.source:
    continuation → A → B → H

if previous.destination !== current.source:
    previous journey is overwritten → new journey starts at G → H
```

**V1 vs. V2, explicitly:**

| | V1 (current) | V2 (proposed) |
|---|---|---|
| What's captured per click | source only | source + destination (edge) |
| Continuation test | asset-membership (previous node's asset_id → matching videos rows → is next video_id among them) | edge-equality (previous destination === current source) |

---

## 9. Hybrid Fallback Model — Required, Not Optional

**V2 must NOT be documented or implemented as "delete the asset model."**
The current asset-based logic exists for concrete, already-locked reasons:

- cross-organization relationships (Section 1's example)
- possible multiple `videos` rows for the same underlying YouTube content
  (flagged in `resolveBridgeAttribution.ts`'s own header: "an asset can map
  to more than one video row... does NOT assume asset_id → single video")
- destination URLs may not always cleanly map to one `videos.id`
- not every redirect link points to another video at all (many
  `RedirectLinkType` values — `checkout`, `purchase_thankyou`,
  `newsletter`, `sales_call`, `lead_magnet`, etc. — have non-video
  destinations)

**Proposed hybrid behavior:**

- If `destination_url` can be **reliably** resolved to exactly one VSTRK
  video → use the explicit source → destination edge test.
- If destination **cannot** be reliably/unambiguously resolved → fall back
  to the existing asset-based continuation test.
- If destination is **not a video at all** → handle per an explicit rule
  that still needs approval (not yet decided — see Section 12).

---

## 10. Destination Resolution — Open Question, Not Yet Approved

Before any V2 implementation, need to inspect:

- `videos` table schema — does `youtube_video_id` exist? Is it unique?
- Whether multiple `videos` rows (different orgs) can share the same
  `youtube_video_id`
- `platformParser.ts` and any existing URL-parsing utilities — may already
  extract a YouTube video ID from a URL
- How `redirect_links.destination_url` is structured across different
  `RedirectLinkType` values

Potential resolution path (NOT approved):
```
destination_url → extract YouTube video ID → lookup videos.youtube_video_id
  → resolve one or more videos rows
```

**Do not assume `youtube_video_id → one videos.id`.** The multi-row case is
explicitly called out as important and unresolved.

**Open questions requiring investigation before design can be finalized:**
- What happens if the destination YouTube video does not exist in `videos`
  at all? (Under V1 this is a non-issue — nothing can click *from* an
  unregistered video, so the journey just naturally stops, discovered
  reactively. Under V2, this becomes an explicit case requiring a rule:
  treat as journey-terminal? Store a node with `destination_video_id: null`?)
- What happens for cross-organization journeys under the edge model, given
  the multi-row-per-content possibility above?

---

## 11. Human-Readable Attribution Data — New, Proposed Requirement

The machine-readable journey remains `journey_snapshot` (JSONB). **No
`content_a`/`content_b`/`content_c` or `stop_1`/`stop_2`/`stop_3` columns —
journeys must support arbitrary N-hop length.**

New proposed (not implemented) convenience fields, so a human can read a
journey directly in Supabase without decoding JSON:

- **`journey_tokens`** — e.g. `Y4iw → Ebid → 92kd`, where each token is one
  redirect link representing one edge (`Y4iw` = A→B, `Ebid` = B→H, so
  `Y4iw → Ebid` = A→B→H).
- **`journey_summary`** — e.g. `Video A → Video B → Video H`.

These are proposed inspection/convenience fields only. **The canonical
machine-readable data remains `journey_snapshot`.** If approved, these
belong in `pixel_purchase_attributions`, not `pixel_purchases` (Section 12).

---

## 12. `pixel_purchases` vs. `pixel_purchase_attributions`

This split is locked and unaffected by V2:

- **`pixel_purchases`** = conversion/purchase facts.
- **`pixel_purchase_attributions`** = attribution/journey facts.

The journey must NOT be moved into `pixel_purchases`. Any approved
human-readable fields (Section 11) belong in `pixel_purchase_attributions`.

---

## 13. Phase Status

- **Phase 1** — implemented (journey primitives in `tracker.ts`)
- **Phase 2** — implemented (continuation validation)
- **Phase 3** — implemented (`appendJourneyNode` orchestration)
- **Phase 4** — implemented (journey propagation: Track.tsx → vt_journey →
  installationHelpers.ts → pixel payload)
- **Phase 5** — implemented (`api/pixel.ts` journey parsing + attribution
  snapshot write)
- **Phase 6** — implemented (lightweight fallback hierarchy, no inline
  heavy-resolver calls)

**Phases 1–6 represent the current V1 source-oriented forward journey
implementation. They are NOT proof that the final V2 edge-based
architecture is complete** — the real-world test (Section 6) proved the
transport pipeline works, but also exposed the V1/V2 gap (Section 7).

- **Phase 7 — DEFERRED.** Reason: real-world testing exposed the
  edge-vs-source architecture gap. Do not remove legacy `FT_*` code or
  fallback code until V2 has been implemented and real-world tested.

---

## 14. Proposed V2 Implementation Roadmap (NOT APPROVED FOR IMPLEMENTATION)

- **V2 Step 1** — Inspect `videos` schema and `platformParser.ts`; confirm
  destination resolution reliability and multi-row cardinality.
- **V2 Step 2** — Design the `JourneyNode`/journey representation to
  support source + destination (this changes the currently-locked
  `{redirect_link_id, video_id, asset_id}` shape — requires explicit
  approval, not a routine refactor).
- **V2 Step 3** — Implement destination resolution at redirect click time.
- **V2 Step 4** — Implement edge-based continuation
  (`previous.destination === current.source`).
- **V2 Step 5** — Keep asset-based logic as fallback for
  ambiguous/unresolvable cases (hybrid model, Section 9).
- **V2 Step 6** — Continue propagating the journey through the existing
  pipeline: Track.tsx → vt_journey → installationHelpers.ts → pixel payload
  → api/pixel.ts → `pixel_purchase_attributions`.
- **V2 Step 7** — Add human-readable `journey_tokens` and, if approved,
  `journey_summary` (Section 11).
- **V2 Step 8** — Real-world test.
- **V2 Step 9** — Only after successful testing, revisit Phase 7 cleanup.

---

## 15. Files Likely to Change in V2

**Likely:**
- `tracker.ts`
- `Track.tsx`
- `installationHelpers.ts`

**Possibly:**
- `platformParser.ts`
- other existing URL-parsing utility (not yet identified/confirmed)

**Likely minimal/no semantic change:**
- `api/pixel.ts` (already treats `journey` as an opaque array; the upstream
  shape may grow, but the parsing/upsert logic doesn't inspect how nodes
  were validated)

**Database:**
- Potentially a small migration **only if** human-readable columns
  (Section 11) are approved. **Do not assume a migration is required**
  until that design is finalized.

---

## 16. Files / Systems That Must NOT Be Changed Without Explicit Approval

- `pixel_purchases` schema
- `stripe-webhook.ts`
- Stripe `client_reference_id` architecture
- `redirects.ts` — unless investigation proves a change is genuinely
  necessary, in which case stop and explain before changing it
- Existing heavy fallback resolver files (`resolveBridgeAttribution.ts`,
  `resolvePixelConversionProvenance.ts`)

**Stripe is explicitly out of scope for V2 attribution work — it is a
separate future audit, not part of this feature.**

---

## 17. Pending Decisions (Require Explicit Approval Before Implementation)

1. Whether `JourneyNode`'s shape changes to include a destination-side
   field (breaks the currently-locked minimal shape).
2. The exact destination-resolution mechanism (`destination_url` →
   YouTube video ID → `videos.youtube_video_id` lookup) and how it handles
   zero-match and multi-match cases.
3. The exact rule for what happens when a redirect's destination is not a
   video at all (most `RedirectLinkType` values).
4. Whether multiple `videos` rows can share one `youtube_video_id` across
   organizations, and if so, how the edge model disambiguates "which row is
   B."
5. Whether `journey_tokens` / `journey_summary` human-readable fields are
   approved, and their exact format.
6. Whether either human-readable field requires a migration.

---

## 18. Rules for Future Claude Sessions

**NO FUTURE SESSION SHOULD START MODIFYING CODE IMMEDIATELY.**

Before V2 implementation:
1. Read this document in full.
2. Inspect the actual current files (do not assume this document's
   descriptions are still current — verify against real code).
3. Confirm the proposed architecture against the actual schema (`videos`,
   `platformParser.ts`, etc.).
4. Report exact files and logical edits, and the pending decisions above
   that block them.
5. Wait for explicit approval before writing any code.
6. Make small, surgical Ctrl+F/caveman-style edits only.
7. Do not dump entire files.
8. Do not perform unrelated refactors.
9. Do not perform Phase 7 cleanup until V2 is implemented and
   real-world tested.
