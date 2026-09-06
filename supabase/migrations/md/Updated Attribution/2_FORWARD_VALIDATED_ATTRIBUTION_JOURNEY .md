# FORWARD-VALIDATED ATTRIBUTION JOURNEY

**Status: V1 implemented (Phases 1–6, source-oriented, superseded). V2 implemented (edge-based destination resolution, Phases 1–6 extended) and real-world tested. V2 testing exposed a cross-origin gap that V2 cannot solve; this motivated V3 (persistent server-side journey history via `events_journey`) — PROPOSED, NOT IMPLEMENTED. Phase 7 still deferred, now blocked on V3 approval + implementation, not V2.**

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

## 2. Original V1 Architecture (SUPERSEDED by V2 — see Section 8)

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

### 4A. Additional Migrations Applied (V2)

Both confirmed applied to the live database:

```sql
CREATE INDEX idx_videos_youtube_video_id
ON public.videos (youtube_video_id);
```
Additive only, supports Section 8B's destination-resolution lookup at redirect time. Does not
modify or replace `videos_pkey`, `idx_videos_asset_id`, or `idx_videos_organization_id`.

```sql
ALTER TABLE public.pixel_purchase_attributions
ADD COLUMN journey_display text;
```
Nullable, additive, no default. Supports Section 11's `journey_display` field. Existing rows
got `NULL` until a new purchase populated it.

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

## 6B. Real-World Test — V2 (Edge-Based), Multi-Hop + Cross-Origin Failure

**Setup (extends Section 6's data with a third hop):**
- Video A (`為什麼你報價一出，客戶就消失？`): `videos.id = 66b840be-ae6c-4990-9fa3-c42fda55beb0`, `youtube_video_id = HkTaq25u55M`
- Redirect `57y8`: `id = 3d78d839-c736-4e6f-92d2-83bbb9da6fd9`, `video_id` = Video A, `asset_id = 72d2cb4d-a7a5-4046-b209-707b86b124a5`, `destination_url = youtube.com/watch?v=g4Ycr2Vo5KY`
- Video B (`Instantly ai 完整教學`): `videos.id = 19ded023-ae85-4af2-a2e9-f4b42fffc69f`, `youtube_video_id = g4Ycr2Vo5KY`, `asset_id = 72d2cb4d-...` (same asset as `57y8` promotes)
- Redirect `d3es`: `id = 8eb7c1fd-10d6-46cb-b3a9-8aa740712c22`, `video_id` = Video B, `asset_id = cd08c4ec-48dd-493d-abbf-d274a98ac467`, `destination_url = youtube.com/watch?v=Gh8G2uZu9O4`
- Video C (`我研究了 80+ 個 n8n...`): `videos.id = 3b9dbc2c-7516-4c27-8135-005f863eb4bd`, `youtube_video_id = Gh8G2uZu9O4`, `asset_id = cd08c4ec-...` (same asset as `d3es` promotes) — **this YouTube ID has 2 other `videos` rows across different orgs; `redirectAssetId` disambiguation (Section 8) correctly picked this exact row.**
- Redirect `LnMI` (in Video C's YouTube description, custom domain `go.kaksidigitals.com`): `redirect_link_id = 4e56c143-755d-4868-9ad4-26258f4d3527`, destination = newsletter opt-in.

**Part 1 result — `57y8` then `d3es`, both on `www.vstrk.com`:** Confirmed via console and the literal outbound `vt_journey` param that the browser-side journey correctly grew to two nodes:
```json
[
  {"redirect_link_id":"3d78d839-...","video_id":"66b840be-...","asset_id":"72d2cb4d-...","destination_video_id":"19ded023-..."},
  {"redirect_link_id":"8eb7c1fd-...","video_id":"19ded023-...","asset_id":"cd08c4ec-...","destination_video_id":"3b9dbc2c-..."}
]
```
This proves: (a) `destination_video_id` resolution worked correctly including the multi-row disambiguation case, (b) the fast edge-equality continuation path fired correctly for `d3es` (its `video_id` matched `57y8`'s `destination_video_id`), (c) the browser journey **`A → B → C`** was fully intact at this point.

**Part 2 result — `LnMI` clicked from Video C's description:** Checked directly via `new URLSearchParams(window.location.search).get('vt_journey')` on the newsletter page — it contained **only**:
```json
[{"redirect_link_id":"4e56c143-...","video_id":"3b9dbc2c-...","asset_id":"f28e2a0b-..."}]
```
The `A → B → C` history was gone. The resulting `pixel_purchase_attributions` row confirmed this downstream: `journey_snapshot = NULL`, `journey_display = NULL`, `match_method = redirect_link_id` (fallback), with `first_touch_redirect_link_id` pointing at `LnMI`'s own id — not `57y8`'s.

**Root cause, confirmed from the `events` table's `tracking_hostname` column:** `57y8` and `d3es` both executed `Track.tsx` on `www.vstrk.com`. `LnMI` executed on `go.kaksidigitals.com` — a **different origin**. `getJourney()`/`appendJourneyNode()` in `tracker.ts` read/write `localStorage` only, and `localStorage` is browser-scoped per-origin. On `go.kaksidigitals.com`, `getJourney()` correctly returned `[]` (there was nothing there to return), so `appendJourneyNode()` correctly took its "journey empty, starting fresh" branch — **this was not a bug in the continuation-matching logic; the comparison never had a previous node to run against.**

A second, independent reason this specific hop could never have worked even with a same-origin fix: `vt_journey` was appended to the *YouTube watch-page URL* by `Track.tsx`, but `LnMI` is a **separate, static link sitting in that video's description** — YouTube does not propagate query parameters from its own watch-page URL into other links rendered on the same page. `Track.tsx` also has no code path that reads an *incoming* `vt_journey` from `window.location.search` at all (only `installationHelpers.ts`'s destination-side pixel script does that).

**Conclusion:** V2's browser-side edge model is proven correct end-to-end when all hops share an origin. It has no mechanism — and per Section 8B, no possible deterministic mechanism — for surviving a hop through content VSTRK doesn't control (a YouTube description). This is the motivating discovery for V3 (Section 19).

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

## 8. V2 — Edge-Based Forward Journey (IMPLEMENTED, tested — see Section 6B)

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

### 8A. Actual Implemented Shape

```ts
interface JourneyNode {
  redirect_link_id: string;
  video_id: string;                    // source — unchanged, authoritative per redirect_links.video_id
  asset_id: string | null;             // unchanged — still feeds the fallback path
  destination_video_id: string | null; // NEW — set only when destination resolved unambiguously; null otherwise
}
```

New function `resolveDestinationVideoId(destinationUrl, redirectAssetId)` in `tracker.ts`, reusing
`platformParser.ts`'s existing `detectPlatform()`/`extractPostId()` unchanged (only `platform === 'youtube'`
is handled currently; anything else returns `null` and falls through to the asset-based fallback, per
Section 9's hybrid model).

`validateJourneyContinuation()` is now a two-tier check:
- **Primary (fast, no DB call):** `lastNode.destination_video_id !== null && newNode.video_id === lastNode.destination_video_id` → continuation.
- **Fallback (unchanged):** if `destination_video_id` is `null`, the original asset-membership check
  (`getPredictedNextVideoIds`) runs exactly as in V1.

`Track.tsx` calls `resolveDestinationVideoId(link.destination_url, link.asset_id)` at click time,
before calling `appendJourneyNode()`, and passes the result in as `destination_video_id`.

### 8B. Destination Resolution — RESOLVED (was Section 10's open question)

Confirmed via direct schema/data inspection:
- `videos.youtube_video_id` is `text`, nullable, **no unique constraint** (only `videos_pkey`,
  `idx_videos_asset_id`, `idx_videos_organization_id` existed before V2).
- The same `youtube_video_id` legitimately backs **multiple** `videos` rows across different
  orgs/campaigns/assets. Confirmed with real data — e.g. `Gh8G2uZu9O4` had 3 distinct `videos.id`
  rows across 2 organizations. This is normal, not rare.

**Approved and implemented disambiguation rule**, using `redirect_links.asset_id` (the asset that
redirect promotes/points to — confirmed distinct from the source video's own `videos.asset_id`,
hence named `redirectAssetId` in code, not `sourceAssetId`):

1. Query `videos WHERE youtube_video_id = extractedId`.
2. **0 rows** → not a tracked VSTRK video destination; return `null`. Existing Campaign Element
   Asset / Asset Resource attribution handles it, untouched.
3. **1 row** → resolve immediately.
4. **2+ rows** → filter to rows where `videos.asset_id === redirectAssetId`.
   - Exactly 1 match → resolve that row.
   - 0 or 2+ matches → remain ambiguous, return `null` (falls back to asset-membership check, not guessed).

Additive index (already applied to the live database — see Section 4A):
```sql
CREATE INDEX idx_videos_youtube_video_id ON public.videos (youtube_video_id);
```

Real-world proof this works: Section 6B's Video C had 3 `videos` rows sharing `youtube_video_id = Gh8G2uZu9O4`;
the correct row was resolved via the `redirect_links.asset_id` match.

---

## 9. Hybrid Fallback Model — Required, Not Optional (IMPLEMENTED as specified below)

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
- If destination is **not a video at all** → `resolveDestinationVideoId` returns `null`
  (platform isn't `youtube`, or `extractPostId` fails) — falls to the asset-based check exactly
  like the ambiguous-multi-row case. No separate rule was needed; this is the same `null` path
  as Section 8B's "0 rows" and "2+ ambiguous" cases.

---

## 10. Destination Resolution — RESOLVED, see Section 8B for the implemented rule

This section is kept for historical record of the open questions as they stood before investigation.
See Section 8B for the actual confirmed schema facts and the approved/implemented resolution rule.

Before V2 implementation, needed to inspect:

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

## 11. Human-Readable Attribution Data — IMPLEMENTED (as `journey_display`, not `journey_tokens`/`journey_summary`)

The machine-readable journey remains `journey_snapshot` (JSONB), unchanged. **No
`content_a`/`content_b`/`content_c` or `stop_1`/`stop_2`/`stop_3` columns —
journeys support arbitrary N-hop length, exactly as required.**

**Actual implemented field name: `journey_display`** (the two names proposed here originally,
`journey_tokens`/`journey_summary`, were superseded during implementation discussion — `journey_display`
was the name actually approved and migrated). Format: token chain only, e.g. `57y8 → d3es` — the
"video title" variant (`journey_summary`) was discussed as optional and never built.

Built in `api/pixel.ts`, **at purchase time, not redirect time** (deliberately, to keep the
redirect path lightweight): `parsedJourney`'s `redirect_link_id`s are looked up against
`redirect_links` for their `token`s, joined with ` → `. Left `null` on any lookup problem or when
no journey is present — never blocks the purchase/attribution write.

**Known limitation surfaced by Section 6B's test:** this only works when `journey_snapshot` itself
was successfully populated in the request. When the cross-origin gap (Section 6B) causes `journey`
to arrive empty, `journey_display` is correctly left `null` too — this is the same underlying gap,
not a separate bug in the display-field logic. See Section 19 for the proposed fix (`events_journey`).

These remain proposed/optional and were never built: a `journey_summary` variant using video titles
instead of tokens. **The canonical machine-readable data remains `journey_snapshot`.** `journey_display`
lives in `pixel_purchase_attributions`, not `pixel_purchases` (Section 12).

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

**Phases 1–6 originally represented V1 (source-oriented). They were subsequently EXTENDED, not
replaced, to implement V2 (edge-based destination resolution, Section 8) under the same phase
numbers** — `destination_video_id`, `resolveDestinationVideoId`, the two-tier continuation check,
and `journey_display` were all added within Phases 1–6's existing files/scope.

**V2 is implemented and real-world tested (Section 6B).** The test proved the edge model itself
works correctly across same-origin hops, and also proved a real architectural boundary: journeys
cannot deterministically survive a hop through a static YouTube description link to a different
origin. This is NOT a bug in Phases 1–6 — it's a limit of what client-side localStorage can ever
carry across an origin VSTRK doesn't control.

- **Phase 7 — STILL NOT STARTED.** Originally deferred pending V2. V2 is now done, but Phase 7 is
  now blocked on a *new* decision instead: whether to approve and implement V3 (Section 19,
  persistent server-side journey history via `events_journey`), which is the proposed answer to
  Section 6B's discovered gap. Do not remove legacy `FT_*` code or fallback code until V3 has been
  approved, implemented, and real-world tested — the same "don't clean up until proven" rule that
  applied to V2 now applies to V3.

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

## 17. Pending Decisions — V2 (ALL RESOLVED; kept for historical record)

1. ~~Whether `JourneyNode`'s shape changes to include a destination-side field~~ — RESOLVED:
   yes, `destination_video_id` added (Section 8A).
2. ~~The exact destination-resolution mechanism~~ — RESOLVED (Section 8B): `youtube_video_id`
   lookup + `redirect_links.asset_id` disambiguation for multi-row cases.
3. ~~The exact rule for non-video destinations~~ — RESOLVED (Section 9): same `null` path as
   ambiguous/unresolvable, falls to asset-membership.
4. ~~Whether multiple `videos` rows can share one `youtube_video_id` across organizations~~ —
   RESOLVED: confirmed yes, real data, disambiguated via `redirectAssetId` (Section 8B).
5. ~~Whether `journey_tokens`/`journey_summary` are approved~~ — RESOLVED: `journey_display`
   (tokens only) implemented; `journey_summary` (titles) never built.
6. ~~Whether either human-readable field requires a migration~~ — RESOLVED: yes, applied
   (Section 4A).

## 17B. Pending Decisions — V3 (Require Explicit Approval Before Implementation)

See Section 19 for full context on each.

1. Whether `events_journey` rows are written synchronously (awaited, before redirect) to
   capture the exact `events.id`, accepting added redirect-path latency — versus some other
   mechanism not yet identified. **Not yet decided.**
2. Whether `redirect_link_id` (already flowing through the existing pixel payload) is sufficient
   as the deterministic key for `pixel_purchases`/`api/pixel.ts` to look up the matching
   `events_journey` row, or whether a new column is genuinely needed. **Leaning yes, not
   confirmed.**
3. Exact `events_journey` schema — column list, JSONB shapes for `journey_snapshot` and
   `event_ids`. Draft proposed in Section 19; not finalized.
4. Confirmation that no deterministic mechanism exists to carry a journey across a static
   YouTube-description hop to a different origin (Section 19, Tier 3) — accepted as an
   architectural boundary, not something further engineering should try to solve
   probabilistically (no IP/user-agent/timing/fingerprinting matching, ever).

---

## 19. V3 — Persistent Server-Side Journey History (PROPOSED, NOT IMPLEMENTED)

Motivated entirely by Section 6B's discovery: the browser-side journey (V2, Section 8) is proven
correct, but has no mechanism to survive a hop through content VSTRK doesn't control (a static
YouTube description link, different origin). V3 does not replace the browser journey — it adds a
persistent, server-side record alongside it.

### 19A. Principle

Browser localStorage (V2, unchanged)
↓
A → B → C (proven working, Section 6B Part 1)
↓
persistent server-side snapshot (V3, new)


### 19B. New table: `events_journey`

Not an edge log — each row is a **self-contained snapshot of the full journey as it existed at
that click**, not just the newest edge. E.g.:

row 1 (57y8): journey_snapshot = [A→B], event_ids = [EVENT_A]
row 2 (d3es): journey_snapshot = [A→B, B→C], event_ids = [EVENT_A, EVENT_B]


This avoids ever needing to walk backward through previous rows to reconstruct a chain — a single
row read is the complete answer. Accepted tradeoff: intentional duplication of earlier nodes in
later rows' snapshots — trivial cost given the existing `MAX_JOURNEY_LENGTH = 20` cap.

Draft schema (NOT finalized — pending 17B):

events_journey
id uuid, pk
journey_id uuid -- correlation/grouping only, see 19D — NOT the reconstruction mechanism
event_ids jsonb -- ordered array of events.id, exact — never timestamp-matched
journey_snapshot jsonb -- complete JourneyNode[] as of this click
redirect_link_id uuid -- this click's redirect
created_at timestamptz

No separate join table for `event_ids` unless a concrete query need proves one necessary.

### 19C. Exact `events.id` capture — no timestamp matching

`redirects.ts`'s `logRedirectEvent()` currently does a bare `.insert()` — the inserted row's `id`
is discarded. For V3, this needs `.select('id')` and to return that id to the caller, instead of
`void`.

Second required change: `Track.tsx` currently calls `logRedirectEvent` **fire-and-forget, after**
`window.location.href` is set. If `events_journey.event_ids` needs the real inserted id, that call
must move to **before** redirect (awaited). This is a genuine latency tradeoff against the
repeated "keep the redirect path fast" requirement — pending decision 17B-1, not yet resolved.

### 19D. `journey_id` — demoted to correlation/grouping only

Unlike the earlier (superseded) proposal that treated `journey_id` as the primary reconstruction
key via "find the previous row with this `journey_id`," V3 does not use it that way. The actual
historical evidence is `journey_snapshot` + `event_ids` on a single row. `journey_id` only helps
(a) `Track.tsx` recognize "this click continues that journey" when a same-origin/Tier-2 carry
succeeds, so it can build on the previous snapshot, and (b) let a human visually group rows.
Deleting `journey_id` would not break snapshot-per-row correctness — it is not load-bearing.

Continuity tiers for `journey_id` (same tiers apply to the V2 browser journey itself):
- **Tier 1 — same-origin localStorage.** Deterministic. Covers `57y8 → d3es` (Section 6B Part 1).
- **Tier 2 — controlled URL propagation** (`vt_journey_id`, same pattern as existing `vt_journey`).
  Only helps when VSTRK controls the very next page — does not help across a YouTube description.
- **Tier 3 — YouTube description boundary. No deterministic mechanism exists or is being pursued.**
  A static description link cannot receive a per-viewer identifier from the page it's rendered on.
  IP, user-agent, timing, or "most recent compatible journey" matching are explicitly rejected as
  solutions — they would misattribute different concurrent visitors. When no deterministic id is
  recoverable, the click legitimately starts a new `journey_id`. **This is an architectural
  boundary, not a bug** — see Section 6B.

### 19E. The earlier journey is never lost or mutated at the Tier 3 boundary

If `A → B → C` was already recorded (as row 2's `journey_snapshot` in `events_journey`), it remains
intact and untouched. `LnMI` (no deterministic id available) starts a new `journey_id` with its own
snapshot `[C → Newsletter]`. The system must never mutate the earlier row merely because a later
cross-origin click couldn't be deterministically connected to it.

### 19F. Purchase-time retrieval

Proposed: `api/pixel.ts` looks up `events_journey` by `redirect_link_id` (already present in the
existing pixel payload as `vt_rlid`/`redirect_link_id` — no new column needed on `pixel_purchases`,
pending decision 17B-2) rather than trusting a client-supplied `vt_journey` blob. If found, that
row's `journey_snapshot`/rebuilt `journey_display` is the deterministic answer — no scanning, no
"most recent," no guessing. If the conversion's `redirect_link_id` isn't in `events_journey` (e.g.
the Tier 3 gap swallowed the fuller history), the existing `first_touch_redirect_link_id`/legacy
fallback applies exactly as today — not a heuristic substitute.

This would also fix Section 6B's specific bug as a side effect, since it no longer depends on
anything surviving in the browser by purchase time.

### 19G. Explicitly separate from the existing evidence-gathering resolvers

`resolveBridgeAttribution.ts` and `resolvePixelConversionProvenance.ts` remain untouched,
deliberately probabilistic, offline/reconciliation tools — not fused into `events_journey`'s
deterministic data. If a *probable* fuller path across a Tier 3 gap is ever wanted for human
inspection, that is exactly what those existing tools are for; V3 does not blend that in.

### 19H. Table boundaries, restated

events = normal event stream (unchanged)
events_journey = persistent journey snapshots / event relationships (NEW, proposed)
pixel_purchases = conversion facts (unchanged)
pixel_purchase_attributions = attribution result connecting a conversion to its journey (unchanged shape)

No `token_1`/`token_2`/`stop_1`/`stop_2` columns anywhere. The journey is represented as an ordered
collection (JSONB array), not as fixed columns.

---

## 20. Architecture Evolution / Superseded Decisions

A concise record of how this design changed, since it changed more than once during debugging:

1. **V1 (source-only `JourneyNode`, asset-membership continuation)** — implemented, superseded by V2.
   Superseded because it never resolved a destination at click time, only reactively one click later.
2. **V2 (edge-based, `destination_video_id` + two-tier continuation)** — implemented, real-world
   tested, proven correct for same-origin hops (Section 6B). Not superseded — V3 adds to it, does
   not replace it. Exposed the Tier 3 cross-origin gap it cannot itself solve.
3. **An intermediate proposal — "`journey_id` + individual edge rows, reconstructed by walking
   backward through matching `journey_id`s"** — was discussed and explicitly SUPERSEDED before
   implementation. Rejected because backward reconstruction from edge rows was considered less
   direct than snapshot-per-row, and because early versions of that proposal risked non-deterministic
   membership ("most recent compatible edge") — explicitly disallowed.
4. **V3 (current proposal) — snapshot-per-row `events_journey`, `event_ids` for exact deterministic
   linkage to `events`, `journey_id` demoted to correlation-only** — NOT YET IMPLEMENTED. This
   is the current source of truth for what Phase 7 is waiting on.

**Do not read Sections 2–7 (V1) as current design.** They are retained for historical/testing
context only, clearly superseded by Section 8 (V2, implemented) and Section 19 (V3, proposed).

---

## 21. Rules for Future Claude Sessions

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
