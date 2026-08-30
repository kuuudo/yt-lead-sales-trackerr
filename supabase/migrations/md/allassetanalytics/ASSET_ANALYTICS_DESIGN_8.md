# ASSET ANALYTICS — SOURCE OF TRUTH

Status: **Table Structure = LOCKED · Attribution (Type 1/2/3) = LOCKED · Row grain = LOCKED · Archive architecture = LOCKED · Organization boundary = LOCKED · Orchestration = IMPLEMENTED + REAL-DATA VERIFIED · AllAssetsAnalytics = CONNECTED TO REAL DATA · Identity enrichment (Phase 1) = IMPLEMENTED, NOT real-data verified · Campaign filter (Phase 2) = IMPLEMENTED, NOT real-data verified · Promotion filter (Phase 2) = INTERIM IMPLEMENTATION ONLY — correctness UNPROVEN, suspected wrong for multi-Promotion assets, DO NOT SIGN OFF · Asset source (My/Shared/Assigned) filter = NOT STARTED, investigation only · Asset grouping/merged display = NOT STARTED, presentation-layer only · Revenue Truth / double-counting model = NOT STARTED · Cross-org promoting-video RLS gap (sponsor viewer saw "Untitled video" / Content Owner "—") = FIXED & DB-VERIFIED 2026-08-29, new `videos` SELECT policy added, no application code changed · `redirect_links.promotion_id IS NULL` historical data = FORENSICALLY CLASSIFIED (28 zero-candidate / 46 one-candidate / 35 multi-candidate), 35-row set TEMPORARILY diagnostic-backfilled (NOT asserted as historical truth, rollback list retained) to confirm NULL is a contributing cause of Promotion Analytics symptoms · 46-row one-candidate set = DELIBERATELY NOT backfilled — decision changed from "maybe safe fallback" to "do not backtrack historical data at all" · Strategy as of 2026-08-30 = STOP historical backfill entirely → FIX FORWARD (guarantee correct `promotion_id` on all newly-created redirect_links, per asset category) → TEST MATRIX (see new section below) before any further historical-data decision · `Track New Content → Select Shared Asset → createRedirectLink()` invariant verification = NOT STARTED, this is the next investigation target**

Investigation frozen. Orchestration verified. Real rows render in AllAssetsAnalytics. Next phase is UI/data-quality verification — not architecture.

This doc is the durable source of truth for Asset Analytics architecture. Investigation is frozen. Future sessions must treat the architecture rules below as settled and must not re-investigate Type 1/2/3, row identity, attribution, Resource behavior, redirect `allowDuplicate`, or archive placement unless new code directly contradicts this document.

## SOURCE OF TRUTH — REUSABLE ANALYTICS ARCHITECTURE (DO NOT RE-INVESTIGATE)

### 1. Canonical asset types (LOCKED)

| Type | Name | Source | Provenance | Archive derivation |
|------|------|--------|------------|--------------------|
| **Type 1** | Campaign Element Asset | `campaign_element_assets` | Own campaign (element's campaign) | Campaign-derived + personal |
| **Type 2** | Video Asset | `videos.asset_id → assets.id` | Own campaign (video's campaign) | Video-derived + campaign-derived (Library-gated) + personal |
| **Type 3** | Resource Asset | `asset_resources` | Optional / lazy ("ONLY PROMOTE ASSET" system campaign via `ensureResourcePromotionCampaign`); never invent a real campaign relationship | Personal only — never derive campaign/video archive |

### 2. Canonical row grain (LOCKED)

- One analytics row = one `(video_id, asset_id)` pair.
- Multiple `link_type`s for the same pair collapse into one row (`linkTypes[]`).
- Own-campaign rows (`asset_id IS NULL`) and asset-promotion rows (`asset_id IS NOT NULL`) are separate and must never be merged.
- Supported by `buildAssetAnalyticsRows.ts`, `assetAnalyticsEngine.computeRelationships()`, and `redirect_links` schema.

### 3. Attribution architecture (LOCKED)

```
buildAssetAnalyticsRows()          → pure identity: (video_id, asset_id) + linkTypes
assetAnalyticsEngine.ts            → metrics (AssetMetrics: clicks, sessions, conversions, revenue, rpc)
└─ computeRelationships()        → per-(asset_id, promotingSourceId=video_id) metrics
getAssetAnalyticsRows.ts           → IMPLEMENTED orchestration: join identity + relationships + archive
AllAssetsAnalytics useAssetAnalyticsRows → UI boundary adapter → table
```

- Clicks: `events.asset_id` + `event_type` ∈ `CLICK_EVENT_MAP`, filterable by `(video_id, asset_id)`.
- Revenue: `stripe_purchases` / pixel → `redirect_links` → `link_type` → `mapLinkTypeToRevenueType()`.
- Same mechanism for Type 1, Type 2, and Type 3. No per-type special-casing required.
- Do **not** modify `analyticsEngine.ts` or invent a second attribution model.

### 4. Resource Asset rules (LOCKED at code level)

- `RESOURCE_TYPE_TO_LINK_TYPE` maps `resource_type` → `link_type` (consultation, landing_page, newsletter, sales_call, checkout; unknown → `landing_page`).
- Resource assets use the **same** `createRedirectLink(..., allowDuplicate=true, {assetId, ...})` path as Type 1/2.
- Resource assets are **not** inherently click-only. Revenue appears when the mapped `link_type` is revenue-bearing.
- Redirects are created only when the resource is selected for promotion (not at import).
- Live-data volume of Resource revenue is still recommended to sample, but the mechanism is locked.

### 5. Redirect generation (LOCKED)

- All asset-tagged paths (Resource / Campaign Element / Video Asset, Shared or My/Assigned) pass `allowDuplicate = true` unconditionally.
- Asset-specific `redirect_links` rows are always inserted; they never reuse an existing non-asset redirect.
- Provenance campaign on the redirect is the **asset's** campaign, never the new video's selected campaign.

### 6. Archive architecture (LOCKED)

- Resolvers are **read-only, additive, viewer-scoped**:
  - `getAssetArchiveContext` / `getAssetArchiveContextsForViewer`
  - `getVideoArchiveContext` / `getVideoArchiveContextsForViewer`
  - `getCampaignArchiveContext`
- They never mutate `events`, `redirect_links`, `stripe_purchases`, or `pixel_purchases`. Historical attribution is preserved.
- `isArchived` + reasons come from the resolvers (personal / video-derived / campaign-derived as applicable per type).
- `archive_ui_visibility` answers only Level 1 vs Level 2 (presentation). It is **not** the source of truth for `isArchived`.
- Archive filtering / visibility decisions belong at the **orchestration or UI layer**, never inside `buildAssetAnalyticsRows` or `assetAnalyticsEngine`.
- Reuse the same pattern already used by AssetPicker / listAssetsForAssignmentPicker / etc.

### UI Display / Identity Resolution — CANONICAL PATTERN (added Phase 1)

This section exists so future chart/table surfaces don't reinvent thumbnail
or title resolution the way AllAssetsAnalytics originally did.

**Canonical source functions** — all from `lib/videoFormatters.ts`:

| Function | Used for | Reference call site |
|---|---|---|
| `resolveThumbnail(video)` | Promoting video / content thumbnail | `InDepthAnalytics.tsx` (Content identity cell), now also `AllAssetsAnalytics.tsx` |
| `renderContentIdentity(video)` | Promoting video / content title | Same as above |
| `resolveAssetThumbnail({thumbnail_url, resource_type, platform})` | Type 3 (Resource) asset thumbnail | `AssetPicker.tsx` (`fromMyRow`), `PromotedAssetPicker.tsx`, now also `AllAssetsAnalytics.tsx` |
| `resolveElementThumbnail(elementType)` | Type 1 (Campaign Element) asset thumbnail | Same three files |
| Type 2 (video asset) thumbnail | raw `thumbnail_url` passthrough, no resolver | Same three files — this is intentional, not a gap |

**The 3-way asset-thumbnail branch (LOCKED pattern, do not reinvent):**

if (asset_type === 'campaign_element') → resolveElementThumbnail(element_type)
else if (asset_type === 'resource') → resolveAssetThumbnail({thumbnail_url, resource_type, platform})
else (asset_type === 'video') → raw thumbnail_url

This exact branch lives in `AssetPicker.tsx`'s `fromMyRow()`, is duplicated (intentionally, per that file's own convention) in `PromotedAssetPicker.tsx`, and was ported into `AllAssetsAnalytics.tsx`'s `useAssetAnalyticsRows` identity-enrichment block in Phase 1 (2026-08-28 pass).

**Known embed-shape trap (fixed in Phase 1, keep this in mind for any new query):**
Supabase/PostgREST embeds (`asset_resources(...)`, `campaign_element_assets(...)`, `videos(...)` joined off `assets`) can come back as either an array or a single object depending on the relationship's cardinality metadata. `AllAssetsAnalytics.tsx` originally normalized this for `videos` and `campaign_element_assets` but not `asset_resources`, which silently broke every Type 3 title/thumbnail. Any new surface doing its own embed query on `assets` must normalize **every** embedded relation the same way:

const x = Array.isArray(row.some_embed) ? row.some_embed[0] : row.some_embed;


**Do NOT create a second thumbnail/title resolution system.** If a new surface needs asset or video identity, reuse the functions in the table above. If they don't cover a new case, extend `videoFormatters.ts` itself — don't hand-roll a parallel version inside the new page, which is exactly the mistake this section documents fixing.

**Files that currently implement this pattern correctly** (reference these, not memory of them): `AssetPicker.tsx`, `PromotedAssetPicker.tsx`, `InDepthAnalytics.tsx`, and as of Phase 1, `AllAssetsAnalytics.tsx`.

### Archive integration status (precise)

| Concern | Status |
|---------|--------|
| Resolvers exist and are correct | LOCKED |
| Orchestration calls `getAssetArchiveContextsForViewer` and attaches context | **IMPLEMENTED** |
| AllAssetsAnalytics hides/shows by Level 1/2 | **OPEN** (context available; product UX not wired) |
| Attribution tables mutated by archive | **Never** — verified by resolver design |

UI visibility decision belongs in page/orchestration consumer, same pattern as AssetPicker (`!isArchived` or level rules) — not inside engines.


### 7. Organization boundary (LOCKED)

- Organization is a hard data boundary.
- Scoping must happen in the data-fetch / orchestration layer before (or as the first step of) row construction.
- Engines may defensively re-check; they must not be the primary place org filtering is invented.

### 8. Implementation status (VERIFIED)

| Piece | Status |
|-------|--------|
| `buildAssetAnalyticsRows.ts` | LOCKED — identity only |
| `assetAnalyticsEngine.ts` + `computeRelationships()` | LOCKED — metrics + per-video relationships |
| `getAssetAnalyticsRows.ts` | IMPLEMENTED — orchestration |
| Real-data verification | PASS (83 identities, 13 matched, 70 unmatched expected) |
| `AllAssetsAnalytics.tsx` → orchestration | CONNECTED |
| Campaign / Promotion dropdown data | STILL STUB |
| Archive UI filtering (Level 1/2 hide) | Context attached; product filter not wired |
| Full 14-column funnel breakdown per pair | AssetMetrics is 5-field; table maps revenue/clicks, other funnel cols 0 |

Pipeline (live):
redirect_links (org-scoped, asset_id IS NOT NULL)
↓  [identity layer]
buildAssetAnalyticsRows()
→ AssetAnalyticsRowIdentity[]  (video_id, asset_id, linkTypes[], campaignIds, promotionIds)
↓
distinct asset_ids
↓  [metrics layer — in memory, shared event/purchase bags]
computeAssetAnalytics(assetId) for each asset
→ keep .relationships[]  (NOT discarded like getAssetAnalyticsBatch)
↓  [orchestration join]
for each identity: relationship where promotingSourceId === video_id
→ metrics or zeros if unmatched
↓  [archive layer — additive only]
getAssetArchiveContextsForViewer({ id, assetType }[], viewerId)
→ isArchived, level, reasons, isHiddenByViewer
↓  [UI adapter]
useAssetAnalyticsRows in AllAssetsAnalytics.tsx
→ titles/thumbnails enrichment + map to table row shape
↓
AllAssetsAnalytics table shell
**Data at each boundary**
| Boundary | What moves |
|----------|------------|
| DB → identity | `redirect_links` rows only |
| Identity → metrics | distinct `asset_id`s + pre-fetched events/purchases/provenance |
| Metrics → join | `AssetRelationshipRow[]` keyed by `promotingSourceId` |
| Join → archive | `asset_id`s + `asset_type`s + `viewerId` |
| Archive → UI | full table rows with optional zero metrics |



## INVESTIGATE ONCE — REUSE EVERYWHERE

Future sessions **must not** re-investigate:

1. Type 1 / 2 / 3 definitions and provenance  
2. Row grain `(video_id, asset_id)` and multi-`link_type` collapse  
3. Identity vs metrics separation  
4. `computeRelationships` + join on `promotingSourceId === video_id`  
5. Organization hard boundary at fetch/orchestration  
6. Archive resolvers read-only / additive; filter at orchestration or UI  
7. Resource = same redirect/attribution path; `resource_type → link_type`; not click-only by rule  
8. `allowDuplicate = true` on asset-tagged redirects  
9. Unmatched identities = expected zero-activity links; keep with zero metrics  
10. Orchestration file `getAssetAnalyticsRows.ts` as the batch join for this grain  

| Surface | Reuse |
|---------|--------|
| AllAssetsAnalytics | Full orchestration + UI adapter |
| Single Asset Analytics | `computeAssetAnalytics` + archive; relationships if multi-video |
| Top Assets / ranking widgets | Batch metrics pattern; ranking is presentation |
| Asset charts | Same primitives; do not new-attribution |
| InDepthAnalytics archive | Video + campaign resolvers only; different grain |
| Promotion analytics | Separate grain; do not invent asset rules there |

**FUTURE SESSION RULE**

1. Read this document first.  
2. Treat LOCKED items as LOCKED.  
3. Never re-investigate Type 1/2/3 / archive / attribution / row grain without **new contradictory evidence**.  
4. Reuse engines and resolvers; do not create parallel ones.  
5. Only investigate items in **NEXT INVESTIGATION QUEUE**.  
6. Update this document when a new architectural fact is proven.

### Known limitation (accepted)
- Pixel conversion events do not carry `asset_id`; they rely on the session-id bridge. Cross-session stitching is a pre-existing, documented limitation of the whole pipeline (see `journeyAnalyticsEngine.ts`). It affects asset rows the same way it affects video rows.

This doc is the working companion to `AllAssetsAnalytics.tsx`. Per the working agreement: we're building the chart first and letting real numbers surface the architecture questions, rather than resolving all 28 forensic-report sections up front. §2 (Type 1 & Type 2 attribution) and the row-grain in §1 are now **confirmed from the actual implementation and real query results** — everything under §4 "Reminders" is still a verbatim carry-forward from the original session brief and **has not been investigated or decided.** This doc's job is to make sure none of it gets lost while we move fast on the UI shell.

### 10. Unmatched identities (LOCKED — EXPECTED)

- **Identity** = promotional link exists (`redirect_links` with `asset_id`).
- **Relationship** = measurable activity in the selected date range (`events` / purchases for that `promotingSourceId`).
- If a link exists but there is no in-window activity for that video under that asset → **no relationship row**.
- Orchestration **keeps** the identity and attaches **zero metrics**.
- `unmatchedIdentityCount` measures this gap; it is **not** a join failure by default.
- AllAssetsAnalytics **must show** these rows (zero performance is valid). Do not drop them in orchestration.
- Reopen only if spot-check finds events/purchases for a pair that should have matched and did not.

Verified sample (one org, default date window): 83 identities, 13 matched, 70 unmatched, 0 duplicate pairs.

### 11. Real-data verification results (CHECKPOINT)

| Check | Result |
|-------|--------|
| Organization boundary | PASS |
| Row identity `(video_id, asset_id)` | PASS |
| Type 1 campaign_element | PASS |
| Type 2 video | PASS |
| Type 3 resource | PASS |
| Multi-link_type → one row | PASS |
| Metric attribution via `promotingSourceId === video_id` | PASS |
| Archive context attached | PASS |
| Historical attribution preserved | PASS |
| Duplicate rows | 0 |
| Overall | **READY** for UI/data-quality phase |

Counts observed: 83 rows / identities, 18 assets, 118 redirect_links, 13 matched relationships.


---

## 1. What's actually built right now

`AllAssetsAnalytics.tsx` — table shell + filter shell + **live data via orchestration**.

- **Row grain — LOCKED + VERIFIED**: one row = one `(video_id, asset_id)` pair.
- **TWO identity columns**: Asset (sticky) + Content (promoting video).
- **Asset Type badge**: maps engine `asset_type` (`campaign_element` | `video` | `resource`) → UI tags (`campaign_element` | `promotional_video` | `resource` | `content_video`).
- **Asset Clicks**: wired from `AssetMetrics.clicks` (0 for unmatched).
- **14 metric columns**: still from `TABLE_COLUMNS` / `COLUMN_LABELS`. **Adapter maps** `AssetMetrics.revenue` → `total_revenue` (and clicks if column exists); other funnel columns remain 0 until a richer per-pair breakdown exists (OPEN product decision, not a join bug).
- **Data source**: `useAssetAnalyticsRows({ dateRange, customRange, activeSource })` calls `getAssetAnalyticsRows` — **IMPLEMENTED + VERIFIED**. Zero-metric / unmatched rows are **kept**.
- **Filters**: Date + source drive fetch. Asset-type + platform filter client-side on returned rows. **Campaign / Promotion option hooks still return `[]` (STUB).** Scope tabs still reserved.
- **Archive**: context attached on each orchestration row; **UI Level 1/2 visibility filtering not product-wired yet (OPEN).**



## 2. Attribution mechanism — CONFIRMED for Type 1 & Type 2

### 2a. Background — why `processVideoMetrics()` can't be reused as-is

`processVideoMetrics()` in `analyticsEngine.ts` attributes revenue by:

```
stripePurchases.filter(p => p.video_id === videoId)
```

i.e. **`video_id` only.** That's correct for InDepthAnalytics (one row = one video, full stop) but not for the `(video_id, asset_id)` row grain here: if Video B promotes both Asset A and Asset H, a purchase resolved only by `video_id = Video B` can't tell you which of the two asset-relationships it came through. This is unchanged and still true — `analyticsEngine.ts` is explicitly NOT being modified (per the architecture lock) and this file does not attempt to.

### 2b. The actual mechanism — confirmed from `campaignElementAnalyticsEngine.ts` + real query results

The fix isn't a new attribution model. It's the same `redirect_links` join `campaignElementAnalyticsEngine.ts` already uses for Campaign Element assets, generalized:

- **Clicks**: `events.asset_id` is a direct column, matched against `events.event_type` via `CLICK_EVENT_MAP` (`landing_page`, `lead_magnet`, `newsletter`/`newsletter_click`, `sales_call`, `consultation`/`consultation_booking`). Real query results confirm `events` also carries `video_id`, `redirect_link_id`, `campaign_id`, `promotion_id`, and `organization_id` on the same row — so clicks can be filtered by `(video_id, asset_id)` together directly on `events`, no join required.
- **Revenue/purchases**: `stripe_purchases.redirect_link_id` (token as fallback) → resolves to one `redirect_links` row → that row's `link_type` → `mapLinkTypeToRevenueType()`. `redirect_links` carries both `video_id` and `asset_id` on that same row, so a purchase can be attributed to the exact `(video_id, asset_id)` pair that produced it, not just the asset or just the video.

This mechanism is **generic over `link_type`**, not specific to Campaign Element assets — `CLICK_EVENT_MAP` and `mapLinkTypeToRevenueType()` don't know or care what `assets.asset_type` the `asset_id` points to. That's what makes Type 1 and Type 2 the same mechanism (see §2c/§2d below) rather than two separate ones.

### 2c. Type 1 — Campaign Element Asset (confirmed)

Example: `Video A → Asset A (campaign_element, consultation)`.

- Consultation Page Clicks: `events` WHERE `asset_id = Asset A` AND `video_id = Video A` AND `event_type IN ('consultation', 'consultation_booking')`.
- Consultation Purchases + Consultation Revenue: `stripe_purchases` → `redirect_link_id`/token → `redirect_links` row WHERE `asset_id = Asset A` AND `video_id = Video A` → `link_type = 'consultation'` → `mapLinkTypeToRevenueType()` → `consultation_revenue` sum + `consultation_thankyou` count.
- All other funnel KPI columns (Landing Page Clicks, Newsletter Clicks, Direct Offer Sales, etc.) stay `0` for this row — Asset A's redirect links only exist for the `consultation` step, so there is nothing to attribute to those columns.
- **This generalizes to every Campaign Element subtype** (sales_call, direct purchase/landing_page, newsletter, lead_magnet) — same `CLICK_EVENT_MAP` / `mapLinkTypeToRevenueType()` lookup, different `link_type` string. No per-subtype special-casing needed.

### 2d. Type 2 — Video Library Asset (confirmed)

Example: `Asset B` = Video B turned into an asset; Video B's originating campaign has a full funnel (landing page, sales call, consultation, newsletter, direct purchase). `Video A → Asset B`.

Same exact mechanism as 2c — `redirect_links.asset_id` and `.link_type` don't distinguish whether the asset behind `asset_id` is a `campaign_element` row or a `videos`-turned-asset row. If redirect links exist for `(Video A, Asset B)` across multiple `link_type`s, each one resolves through the identical click/revenue path above, independently, and all 13 metric columns can populate for that single `(Video A, Asset B)` row — not just one.

**Conclusion: Type 1 and Type 2 do NOT need two separate analytics mechanisms.** Same engine logic, keyed the same way, differing only in which `link_type` rows happen to exist for that asset.

### 2e. Aggregation requirement — the one real code gap (not yet implemented)

`campaignElementAnalyticsEngine.ts` currently aggregates by `asset_id` only:

- `CampaignElementEventRow` = `{ event_type, asset_id }` — no `video_id`.
- `CampaignElementRedirectLinkRow` = `{ id, token, link_type, asset_id }` — no `video_id`.

Both need `video_id` added, and the internal accumulator (currently `Map<assetId, Acc>`) needs to key on the `(video_id, asset_id)` composite, not `asset_id` alone. This is a data-shape gap in one file, not a missing capability — `redirect_links` and `events` already carry the `video_id` column needed to do this. **Not implementing this yet per your instruction — flagging exactly what changes when we do.**

## 3. Type 3 — Resource Asset (NOW LOCKED at code level)

Code path fully traced in `generateAssetRedirectLinks.ts` + `createAssetResource.ts`:

- Redirects are created only when the resource is selected for promotion (not at import).
- `RESOURCE_TYPE_TO_LINK_TYPE` maps resource_type → link_type; unknown → `landing_page`.
- Same `createRedirectLink(..., allowDuplicate=true, {assetId, ...})` as Type 1/2.
- Therefore Resource assets participate in the identical click + revenue attribution path.
- They are **not** click-only. Revenue appears when the mapped link_type is revenue-bearing (consultation, checkout, etc.).
- Provenance campaign is optional/lazy (`ensureResourcePromotionCampaign`); never invent a real campaign relationship.
- Archive: personal only.

Still recommended (but not blocking architecture): broader live-data sample of Resource events/purchases.

## 4. Reminders — every open question from the original brief, unresolved

Carried forward verbatim in spirit (condensed). Nothing below has been touched, except the boundary question folded into §2 above has been removed from this list.

**Revenue truth**
- Total Revenue = sum of campaign revenues — verify against actual code, not assumed.
- Video revenue + Asset revenue + Promotion revenue must NOT be summed as three independent dollars for the same purchase. Need an explicit model separating Economic Revenue / Attribution Revenue / Contribution-Credit / Reporting Scope.
- Dashboard.tsx vs Analytics.tsx revenue discrepancy — not yet traced.

**Boundaries**
- What makes a video belong in InDepthAnalytics vs. Promotion Analytics vs. both, once it's promoting an asset? (Question 3)
- ~~Does `redirect_links.asset_id IS NOT NULL` + `video_id = X` reliably mean "Video X promotes Asset Y"?~~ — **CONFIRMED, see §2.** Yes; no `videos.promoting_asset` column needed, it's fully derivable from `redirect_links`.
- Filter scope rules (All/My/Shared/Assigned, per-asset-type, Campaign, Promotion) — not yet checked against real data boundaries.

**Scenario models — none yet designed**
- Original video → becomes asset → reassigned → new promoting video (the Video A/Asset A/Web Mood/Video B scenario). Needs an explicit non-double-counting model.
- Campaign Element Asset assigned downstream (e.g. a Sales Call element) — whether it reuses the same table with only Call Booking columns populated, or needs its own shape.
- Direct-import / Resource asset (Asset V) — simple case (Video C → Asset V → destination) vs. complex chains (Video H → Video L → Asset L → Asset V → …). You want AllAssetsAnalytics to stay simple and push complex chains to a future dedicated view — not yet evaluated for safety.

**Ownership**
- Top Marketers currently appears to scope by `promotions.organization_id`, which conflates "every promotion in the org this marketer appears in" with "promotions this account owner specifically assigned to this marketer." Needs the real ownership chain: promotion creator → assignment → collaborator → marketer.
- Top Promotions — same ownership-boundary concern.
- Top Assets — unclear whether it ranks owned / assigned / promoted / campaign-scoped assets, or a mixture.
- Marketer Analytics — needs to confirm it's scoped to (current account owner + promotions assigned to this marketer), not just "marketer ID appears somewhere in the org."

**Engine ownership**
- `analyticsEngine.ts` is the trusted base (confirmed reused directly for this table's 14 columns). Whether `promotionAnalyticsEngine.ts` / `assetAnalyticsEngine.ts` / `campaignElementAnalyticsEngine.ts` already consume the same revenue primitive, or diverge, is unchecked.
- No `revenueBoundary.ts` (or equivalent) exists yet — intentionally not created until the above is understood.

## 5. Status by category

| Category | State |
|----------|--------|
| Architecture (types, grain, attribution, archive rules, org boundary) | **LOCKED** |
| Orchestration `getAssetAnalyticsRows` | **IMPLEMENTED + VERIFIED** |
| AllAssetsAnalytics data connection | **IMPLEMENTED** |
| Real-data verification (83 rows sample) | **VERIFIED PASS** |
| UI identity enrichment (titles/thumbs) | **OPEN (P1)** |
| Campaign / Promotion filter options | **STUB / NOT STARTED** |
| Archive Level 1/2 UI filtering | **OPEN** |
| Full 14-column funnel per pair | **OPEN** (5-field AssetMetrics by design today) |
| Revenue-truth across surfaces | **NOT STARTED** |
| Scale optimization | **OPTIONAL / P3** |

## 6. Next phase (not architecture)

P0 metric spot-checks → P1 identity enrichment UI → P2 filters/archive UX → P3 scale/revenue-truth.  
See **NEXT INVESTIGATION QUEUE** at end of this document.

---

## LAST CONVERSATION SUMMARY / CONTINUATION PROMPT

CURRENT STATE (2026-08-28 checkpoint):
- Architecture LOCKED in SOURCE OF TRUTH + CODE MAP + RISK AUDIT.
- Orchestration implemented and real-data verified (83 identities, 13 matched, 70 unmatched **expected**, 0 duplicates).
- AllAssetsAnalytics renders real rows.
- Unmatched = link exists, no in-window activity — keep with zeros.
- Engines frozen unless contradictory evidence.
- Next work = P0/P1 queue only — **not** re-investigation of types/grain/attribution/archive.

START PROMPT FOR FUTURE CLAUDE (copy-paste):

Read ASSET_ANALYTICS_DESIGN 2.md first.
Treat LOCKED / VERIFIED as source of truth.
Do NOT re-investigate Type 1/2/3, row grain, attribution, archive resolvers,
organization boundary, allowDuplicate, or unmatched-identity semantics
unless new code or real data contradicts this document.
Identify which primitives to reuse (buildAssetAnalyticsRows, assetAnalyticsEngine,
getAssetAnalyticsRows, archive resolvers) before writing anything new.
Only request files relevant to the current NEXT INVESTIGATION QUEUE item.
Do not ask to resend the entire analytics architecture.


---

## CODE MAP — Asset Analytics pipeline (file-by-file)

### Identity layer

| | |
|--|--|
| **File** | `lib/buildAssetAnalyticsRows.ts` |
| **Purpose** | Answer: which `(video_id, asset_id)` promotional relationships **exist**? |
| **Input** | `RedirectLinkAttributionRow[]` already scoped to **one** `organization_id` |
| **Output** | `{ assetAnalyticsRows, ownCampaignRows, unclassified }` — multi-`link_type` collapsed into one identity with `linkTypes[]` |
| **Called by** | `getAssetAnalyticsRows` |
| **Must stay here** | Grouping / collapse / own vs asset split |
| **Must NOT add** | Metrics, archive, viewer, org fetch, UI |
| **Status** | LOCKED |
| **Reuse** | Any asset×video analytics surface |

### Metrics / attribution layer

| | |
|--|--|
| **File** | `lib/assetAnalyticsEngine.ts` |
| **Key APIs** | `computeAssetAnalytics(input)` (sync), internal `computeRelationships`, `classifyAsset`, `scopeToAsset` |
| **Purpose** | Asset-scoped clicks/sessions/conversions/revenue/rpc + per-promoting-video `relationships[]` |
| **Input** | Full `AssetAnalyticsEngineInput` (events, purchases, redirectLinks, provenance rows, org, assetType, date, source) |
| **Output** | `AssetAnalyticsResult` including `relationships: { assetId, promotingSourceId, metrics, ... }[]` |
| **Called by** | `getAssetAnalyticsRows`, `getAssetAnalyticsBatch`, single-asset services |
| **Must stay here** | Metric math, relationship bucketing by `event.video_id` / purchase video |
| **Must NOT add** | UI, archive filtering, multi-asset orchestration, identity grouping |
| **Status** | LOCKED (frozen unless proven bug) |
| **Note** | `AssetMetrics` is **5 fields**, not 14 funnel columns |

| | |
|--|--|
| **File** | `services/asset/getAssetAnalyticsBatch.ts` |
| **Purpose** | Batch fetch + per-asset **top-level** metrics for rankings (Top Assets) |
| **Output** | `Map<assetId, AssetMetrics>` — **discards relationships** |
| **Status** | IMPLEMENTED for ranking; **not** sufficient alone for AllAssets table grain |
| **Reuse** | Top Assets / ranking widgets |

| | |
|--|--|
| **File** | `lib/analyticsEngine.ts` |
| **Purpose** | Shared `TABLE_COLUMNS`, `COLUMN_LABELS`, `CLICK_EVENT_MAP`, date bounds, video-level helpers |
| **Must NOT** | Be forked for a second asset attribution model |
| **Status** | LOCKED as column/click vocabulary source |

| | |
|--|--|
| **File** | `lib/campaignElementAnalyticsEngine.ts` |
| **Relevance** | Historical Type 1 path; aggregates by `asset_id` only (§2e gap). **AllAssets path uses `assetAnalyticsEngine` + relationships instead.** |
| **Status** | Not required for current AllAssets grain; do not “fix” via this file unless product chooses |

### Orchestration layer

| | |
|--|--|
| **File** | `services/asset/getAssetAnalyticsRows.ts` |
| **Purpose** | Canonical **(video, asset)** table pipeline: org fetch → identity → metrics w/ relationships → join → archive → rows |
| **Input** | `{ organizationId, viewerId, dateRange, customRange?, activeSource?, assetIds? }` |
| **Output** | `{ rows: AssetAnalyticsTableRow[], assetIds, unmatchedIdentityCount, debug }` |
| **Steps** | (1) org-scoped redirect_links asset_id NOT NULL (2) buildAssetAnalyticsRows (3) distinct assets + types (4) batch-shaped event/purchase fetch (5) computeAssetAnalytics keep relationships (6) join `promotingSourceId === video_id` (7) archive contexts (8) zeros if unmatched |
| **Called by** | `AllAssetsAnalytics` `useAssetAnalyticsRows` |
| **Must stay here** | Join, unmatched policy, calling archive |
| **Must NOT** | Reimplement metric formulas or identity grouping |
| **Status** | **IMPLEMENTED + REAL-DATA VERIFIED** |
| **Reuse** | AllAssets-like tables; adapt output shape at UI boundary |

### Redirect creation (setup, not analytics)

| | |
|--|--|
| **File** | `services/asset/generateAssetRedirectLinks.ts` |
| **Purpose** | After video save, create asset-tagged redirects for selected assets |
| **Key behavior** | `createRedirectLink(..., allowDuplicate=true, { assetId, promotionId, trackingDomainId })` for Type 1/2/3; Resource uses `RESOURCE_TYPE_TO_LINK_TYPE` |
| **Status** | LOCKED |
| **Analytics note** | Explains why asset-specific links exist; analytics **reads** `redirect_links`, does not create them |

| | |
|--|--|
| **File** | `lib/redirects.ts` → `createRedirectLink` |
| **Purpose** | Shared insert/dedupe primitive; asset path forces duplicate allow |
| **Status** | LOCKED |

### Archive layer

| | |
|--|--|
| **File** | `services/asset/getAssetArchiveContext.ts` |
| **APIs** | `getAssetArchiveContext`, `getAssetArchiveContextsForViewer(assets: {id, assetType}[], viewerId)` |
| **Returns** | `isArchived`, `reasons[]`, `isHiddenByViewer`, `level` (`normal` \| `level1` \| `level2`) |
| **Provenance** | Type1 campaign; Type2 video+campaign if Library-visible; Type3 **personal only** |
| **Status** | LOCKED read-only resolvers; **wiring into orchestration = IMPLEMENTED**; **AllAssets UI filter = OPEN** |

| | |
|--|--|
| **Files** | `services/video/getVideoArchiveContext.ts`, `services/campaign/getCampaignArchiveContext.ts`, per-entity `archiveUiVisibility` helpers |
| **Purpose** | Same contract for video/campaign; Level from `archive_ui_visibility` only |
| **Reuse** | InDepthAnalytics archive (video grain); do not invent Resource campaign archive |

### UI layer

| | |
|--|--|
| **File** | `pages/AllAssetsAnalytics.tsx` |
| **Hook** | `useAssetAnalyticsRows` — boundary adapter (org resolve, call orchestration, enrich titles/thumbs, map metrics to table columns) |
| **Status** | Data **CONNECTED**; identity enrichment quality **OPEN (P1)**; Campaign/Promotion options **STUB** |
| **Must NOT** | Contain attribution math or archive reason derivation |

| | |
|--|--|
| **File** | `pages/AssetAnalytics.tsx` / `pages/InDepthAnalytics.tsx` |
| **Note** | Different grains (single asset / video). Reuse engine + archive resolvers; **do not** copy AllAssets row grain blindly. InDepth archive wiring still largely OPEN. |

## DO NOT REDISCOVER

Future work on InDepthAnalytics, AllAssetsAnalytics, Top Assets, Marketer Analytics, or any new analytics surface **must** treat the rules in "SOURCE OF TRUTH / ARCHITECTURE RULES" and the Confidence table as settled.

Re-opening any of the following without new contradictory evidence is waste:
- Row grain
- Three asset types + provenance rules
- Attribution mechanism (including Resource)
- allowDuplicate behavior on asset redirects
- Archive resolver contracts and placement of filtering
- Organization hard boundary
- Engine vs orchestration responsibilities

If a new question arises, first check whether it is already answered above. Only then open a new investigation.

## RISK AUDIT (post real-data render)

Classify only; do not claim bugs without evidence.

### A. Identity / display — **D. NEEDS UI VERIFICATION / C. SPOT CHECK**

Observed risk: missing/wrong asset or content title/thumbnail; type badge mapping (`video` → UI `promotional_video`).

| Possible cause | Layer |
|----------------|--------|
| Enrichment query incomplete | UI adapter in `AllAssetsAnalytics` |
| PostgREST embed shape (array vs object) | same |
| Wrong id used for display map | same |
| True null titles in DB | data |

**Not** classified as attribution failure. Inspect tomorrow: enrichment block in `useAssetAnalyticsRows`, sample 5 rows’ `asset_id`/`video_id` vs Supabase titles.

### B. Metrics — **C. NEEDS REAL-DATA SPOT CHECK**

| Risk | Note |
|------|------|
| 5-field `AssetMetrics` vs 14 table columns | Expected: only revenue/clicks mapped; other funnel cols 0 |
| Zero-metric rows | Expected unmatched |
| Date window | Identities all-time links; metrics date-bounded |
| RPC | `revenue/clicks`; spot-check formula |
| Duplicate attribution | Grain prevents double count across videos; economic double-count across surfaces still OPEN (§4) |

### C. Attribution edge cases — **C / E**

| Case | Status |
|------|--------|
| `event.video_id` null → `__none__` bucket | Known; won’t match concrete video identity |
| `redirect_links.video_id` vs `events.video_id` diverge | Spot-check only if unmatched has events |
| Pixel no `asset_id` / cross-session | Accepted pipeline limitation |
| Org boundary | PASS at verification |

### D. Archive — **A LOCKED rules / D UI behavior open**

LOCKED: resolvers read-only; Resource no campaign/video provenance; history preserved.  
OPEN: Level 1/2 visibility filtering in AllAssetsAnalytics not product-wired yet.

### E. Filters — **D**

Date drives fetch. Asset-type + platform filter client-side. Campaign/Promotion dropdowns still `[]`. Archive visibility filter not applied.

### F. Performance — **E FUTURE**

Bottleneck: per distinct `asset_id`, in-memory `computeAssetAnalytics` over shared bags (same pattern as batch). Monitor at hundreds/thousands of assets; do not optimize until measured.

---

## NEXT INVESTIGATION QUEUE

### P0 — before calling production-ready
1. **Spot-check 3–5 matched rows** metrics vs raw events/purchases for same `(video_id, asset_id)` and date range.  
2. **Spot-check 2–3 unmatched** pairs: confirm no in-window events with both ids (else reopen join).  

### P1 — UI / data quality (user already noticed)
3. ~~Asset thumbnail / title correctness~~ — **IMPLEMENTED Phase 1** (see "UI Display / Identity Resolution" above). Pending real-data verification.
4. ~~Content (video) thumbnail / title / platform~~ — **IMPLEMENTED Phase 1**. Pending real-data verification.
5. Identity maps use correct `asset_id` and `video_id` — unchanged by Phase 1, still needs a real-data spot check
6. Asset type badge vs `assets.asset_type` — unchanged by Phase 1, not investigated 

For each P1: Question = does UI show the same title/thumb as Assets/Videos for that id? Inspect = enrichment in `AllAssetsAnalytics` + `listAssetsByOrganization` patterns. PASS = match. FAIL = wrong id or bad embed. Code changes allowed only in UI adapter, not engines.

### P2
7. ~~Campaign / Promotion filter data + ownership boundary~~ — Campaign **IMPLEMENTED Phase 2** (real `campaigns` query, same as InDepthAnalytics). Promotion **IMPLEMENTED Phase 2 with a deliberately conservative scope** — options are derived only from `promotion_id`s already present in already-org-scoped rows, NOT from an independent ownership-boundary query. The actual ownership boundary question (promotion creator → assignment → collaborator → marketer, per §3 above) is still OPEN and was NOT decided by this pass — do not treat the Phase 2 Promotion filter as having resolved that question, it only avoids making it worse.
8. Archive Level 1/2 visibility in this table  
9. Richer funnel columns vs 5-field AssetMetrics (product decision)

### P3
10. Scale / batching if asset count grows  
11. Revenue-truth / cross-surface double-counting model  

---

## ASSET ANALYTICS CHECKPOINT — 2026-08-28

- Forensic investigation complete; architecture LOCKED in this doc
- Orchestration implemented (`getAssetAnalyticsRows.ts`)
- Real-data verification PASS (prior session — 83 identities, 13 matched, 70 unmatched, 0 duplicates)
- AllAssetsAnalytics connected to real Supabase data
- Engines frozen unless evidence shows a bug
- This session (same day, follow-up pass): implemented Identity enrichment
  (Phase 1) and Campaign/Promotion filters (Phase 2) as code changes to
  `AllAssetsAnalytics.tsx` only. Neither has been tested against real
  data. Promotion filter correctness is actively suspected wrong, not
  just unverified — see below.

---

## SESSION LOG — 2026-08-28 (Identity + Filter implementation pass)

This session did NOT re-investigate frozen architecture. It implemented
(not verified) Identity enrichment (Phase 1) and Campaign/Promotion
filters (Phase 2) in `AllAssetsAnalytics.tsx`, and surfaced several new
open questions during that work.

### LOCKED / VERIFIED
Nothing new was verified this session. Everything under "SOURCE OF TRUTH"
earlier in this document remains the only LOCKED/VERIFIED content. Do not
add to that category without new real-data evidence.

### IMPLEMENTED BUT NOT VERIFIED

**A1. Identity enrichment (Phase 1)** — `AllAssetsAnalytics.tsx`'s
`useAssetAnalyticsRows` identity-enrichment block was rewritten to reuse
existing canonical helpers instead of its own bespoke display logic:

| Helper | Source file | Reused from |
|---|---|---|
| `resolveThumbnail(video)` | `lib/videoFormatters.ts` | `InDepthAnalytics.tsx` |
| `renderContentIdentity(video)` | `lib/videoFormatters.ts` | `InDepthAnalytics.tsx` |
| `resolveAssetThumbnail({thumbnail_url, resource_type, platform})` | `lib/videoFormatters.ts` | `AssetPicker.tsx` (`fromMyRow`), `PromotedAssetPicker.tsx` |
| `resolveElementThumbnail(elementType)` | `lib/videoFormatters.ts` | `AssetPicker.tsx`, `PromotedAssetPicker.tsx` |

Implementation follows the same 3-way branch already used in
`AssetPicker.tsx`'s `fromMyRow()`:

campaign_element → resolveElementThumbnail(element_type)
resource → resolveAssetThumbnail({thumbnail_url, resource_type, platform})
video → raw thumbnail_url passthrough (no resolver — matches AssetPicker)

Also fixed in the same pass: `asset_resources`'s PostgREST embed was
never normalized for array-vs-object shape (unlike `videos` /
`campaign_element_assets` in the same query), which likely silently
broke every Type 3 (Resource) title/thumbnail before this pass.

**Remaining uncertainty — NOT verified against real data:**
- `campaign_element_assets.element_type` column name is a guess (inferred
  from the `CampaignElementType` TS type name, not schema).
- `asset_resources.resource_type` column name is a lower-risk guess but
  likewise unconfirmed against schema.
- `resolveThumbnail` / `renderContentIdentity`'s exact field dependencies
  on the `videos` row are unknown — implementation defensively selects
  `*` rather than a narrow column list, but this hasn't been confirmed
  sufficient.
- **No asset type's thumbnail has been confirmed correct against real
  rendered UI.** Treat Identity as unverified for Type 1, Type 2, Type 3,
  Shared assets, and Assigned assets equally — see Open Investigation B.

**A2. Campaign filter (Phase 2)** — previously `useCampaignOptions()` was
a stub returning `[]`, and `selectedCampaignId` existed but was never
consumed by any filter. Now: campaigns are fetched with the exact same
query `InDepthAnalytics.tsx` already uses
(`supabase.from('campaigns').select('*').eq('user_id', user?.id)`), and
`selectedCampaignId` is applied via `row.campaign_id === selectedCampaignId`
(row-level `campaign_id` was already being populated, just never read).
**Not yet verified against real data.**

**A3. Promotion filter (Phase 2) — INTERIM IMPLEMENTATION, NOT a locked
architecture.** Previously `usePromotionOptions()` was a stub returning
`[]`. Now: promotion **options** are derived only from `promotion_id`s
already present in the already-org-scoped analytics `rows` (never an
independent query with a guessed ownership scope), and
`selectedPromotionId` is applied via `row.promotion_id === selectedPromotionId`
(same row-level field, `r.promotionIds?.[0]`, that already existed).

This was a deliberate choice to avoid inventing an ownership boundary
(§3 "Ownership" above), **NOT** a claim that the Promotion↔Asset↔Video
relationship is correctly modeled. See Open Investigation E — this filter
is currently believed capable of showing INCORRECT results whenever a
single Asset belongs to more than one Promotion.

### OPEN INVESTIGATION (new this session)

**B. Asset thumbnail still not confirmed correct, per-type.** Even after
the Phase 1 identity pass, some asset types may still fail to display a
thumbnail correctly. Do NOT assume Phase 1 fixed this — untested. Next
session must inspect actual canonical thumbnail behavior separately for:
Type 1 (campaign element), Type 2 (video), Type 3 (resource), Shared
assets, Assigned assets. Do not assume all five share one thumbnail
source — trace each one. Goal: every asset shown in `AllAssetsAnalytics`
uses the same identity/title/thumbnail semantics already established in
`AssetPicker.tsx`, `PromotedAssetPicker.tsx`, `InDepthAnalytics.tsx`. Do
not invent a new identity system to close this item.

**C. Asset source / access filter (My / Shared / Assigned) — not
started.** Product wants `AllAssetsAnalytics` to distinguish asset
relationship state: My (owned), Shared, Assigned. Labels and query NOT
decided. Before implementing, trace how the app already defines these
three states — likely relevant: `AssetPicker.tsx`, `PromotedAssetPicker.tsx`,
`listAssetsByOrganization.ts`, `listSharedAssetsForCollaborator.ts`,
`getAssignedAssetSummaryForOwner.ts`, `getAssetSharingInfo.ts`. Identify
the canonical relationship before writing any new query. Investigation
item only, not cleared for implementation.

**D. Asset grouping / merged row display — presentation-layer only, not
started.** Product wants an optional grouping where rows sharing the same
`asset_id` visually collapse the Asset cell (shown once) while each
promoting video still lists underneath, with a clear visual signal they
share the same asset (not an accidental blank cell) — e.g. merged cell
span, grouped row treatment, a "N videos promote this asset" indicator.
**Must be presentation-layer only** — must NOT collapse, merge, or mutate
the underlying `(video_id, asset_id)` row grain, which remains LOCKED
per §2 above. Not implemented; visual approach not decided.

**E. CRITICAL — Promotion filter correctness is unproven and may be
WRONG, not just incomplete.** A single Asset can belong to multiple
Promotions:

Asset A + Promotion 1 + Video A
Asset A + Promotion 2 + Video B

Selecting Promotion 1 must show ONLY `Asset A + Video A`, never
`Asset A + Video B`. The current Phase 2 implementation filters on
`row.promotion_id`, populated as `r.promotionIds?.[0]` — **the first
promotion id found for that row, with no guarantee it's the promotion
that actually produced that specific video/asset relationship.** Flagged
as a likely-wrong assumption, not confirmed either way.

Next session must trace where the canonical Promotion ↔ Asset ↔ Video
relationship actually lives (likely somewhere in `redirect_links` /
`buildAssetAnalyticsRows.ts`'s `promotionIds` construction — needs
tracing, not guessing) and determine whether `promotion_id` on today's
row is sufficient, or whether the row grain needs an additional
dimension. **Do not invent an ownership boundary. Do not assume
`asset_id` alone is sufficient. Do not assume the first `promotion_id`
on a row is correct. Do not mark the current Promotion filter as final
until this is proven** — see Section G below.

**F. `+ Track New Content` — Asset/Promotion association flow, untraced.**
Related to E. When tracking new content: if the selected Asset belongs to
multiple Promotions, does the flow force a Promotion selection, and does
the resulting tracked content/redirect correctly preserve which Promotion
it belongs to (so analytics can later recover the right relationship)?
Next session must trace: where Asset is selected in that flow, whether
Promotion selection already exists there, how a selected Promotion is
stored, how the Video/Content record associates with it, and how
analytics later recovers that relationship. **Investigation only —
`+ Track New Content` was NOT modified this session and must not be
modified until this is traced.**

### FUTURE UX (does not affect current analytics architecture)
- Asset grouping visual treatment (see D) — deferred until row-grain
  safety is confirmed.
- Mobile filter drawer/button (Phase 5, unstarted) — portrait first,
  landscape explicitly deferred, no architecture impact.

---

## G. PROMOTION FILTER SAFETY RULE — DO NOT SIGN OFF

**Promotion filtering in `AllAssetsAnalytics` is NOT SAFE TO SIGN OFF as
correct**, despite being wired end-to-end (dropdown → state → row
filter). The dropdown works mechanically; whether it filters to the
*correct* rows is unproven and suspected wrong in the multi-Promotion-
per-Asset case (see E).

Before this can be marked verified, prove the full chain:

Selected Promotion
→ correct Promotion↔Asset↔Video relationship (traced, not assumed)
→ correct Asset
→ correct Video/Content rows

without ever including a row belonging to a different Promotion on the
same Asset. This is a higher bar than "the dropdown shows promotion names
and the count changes when you pick one" — that much already works today
and is **not** sufficient evidence of correctness.

---

## NEXT INVESTIGATION QUEUE (supersedes the queue earlier in this document)

### P0
1. Real-data spot-check: 3–5 matched rows against raw events/purchases; 2–3 unmatched rows.
2. Verify Pixel / Stripe metrics against raw data.

### P1 — Identity
3. Complete Asset + Content title/thumbnail verification for all asset types (Type 1/2/3).
4. DONE (2026-08-28) — see "LESSON — Asset thumbnail 'missing else branch' regression" above. Fixed: restored missing `else` branch (Type 2/video), added `platform` consistently through Map/Identity/render for onError fallback.
5. Verify Shared / Assigned asset identity behavior specifically (not yet traced at all).

### P1 — Promotion relationship correctness
6. Trace canonical Promotion ↔ Asset ↔ Video relationship in the data model.
7. Determine whether current `promotion_id` on analytics rows (`r.promotionIds?.[0]`) is sufficient, or wrong.
8. Trace `+ Track New Content` Asset + Promotion selection flow (see Open Investigation F).
9. Verify selecting a Promotion returns ONLY rows genuinely belonging to it.
10. Verify the multiple-Promotion / same-Asset case explicitly, with a real example.

### P1 — Filters
11. Campaign filter real-data verification.
12. Promotion filter real-data verification — **only after items 6–10 above are resolved**, not before.
13. Define Shared / Assigned asset filters, after tracing canonical source (see Open Investigation C).
14. Verify Platform filter against real data.
15. Verify Pixel / Stripe filter behavior against real data.

### P2 — Presentation
16. Asset grouping / merged visual presentation (see Open Investigation D).
17. Make grouped assets visually obvious to users (not an accidental blank cell).
18. Mobile filter drawer/button.
19. Test portrait mobile first.
20. Decide later whether landscape is actually necessary.

### P2 — Archive
21. Apply the existing LOCKED archive contract (`getAssetArchiveContextsForViewer`) to `AllAssetsAnalytics`.
22. Apply the same to `InDepthAnalytics`.
23. Do not redesign archive architecture — reuse the resolver contract as-is, same pattern as `AssetPicker.tsx` / `PromotedAssetPicker.tsx`.

---

## LESSON — Asset thumbnail "missing else branch" regression (2026-08-28)

We spent significant time debugging the Asset thumbnail UI assuming the
thumbnail RESOLVER was the problem. It wasn't. The real bug was one level
up: a prior patch merged the Resource branch and the Type 2/video branch
into a single `if`, deleting the `else` that separated them. Result:
`thumbnailUrl` stayed `null` for every video-type Asset — the resolver
never even ran for that type. Separately, adding a `platform` field to
the display object and to `AssetIdentity` without updating both types
caused two TypeScript errors at the same time, which looked related to
the thumbnail bug but was a second, independent mistake stacked on top.

Three distinct questions had to be separated before the fix was obvious:
  1. Does the code actually reach the thumbnail resolver? (No — branch bug)
  2. What thumbnail URL does the resolver return? (N/A while #1 was broken)
  3. Does the returned URL actually load in the browser? (Separate,
     upstream-data question — a dead YouTube `hqdefault.jpg` is not a
     code bug at all)

A blank/broken `<img>` in the browser must NOT be assumed to be a
resolver or database problem. Trace the actual branch being executed
first. The Content column (`PromotingVideoIdentity`, which already had
`platform` and a platform-aware `onError` fallback) was the known-good
reference that made the asymmetry with `AssetIdentity` obvious.

FUTURE RULES:
- Before touching thumbnail architecture, trace:
  `DB data → enrichment → branch selection → resolver → display object
  → <img src> → onError`.
- Never patch one branch of an `if / else if / else` without confirming
  the whole structure still closes correctly afterward.
- When adding a field like `platform` (or `created_at`), update it at
  every layer in one pass: DB select → Map type → Map `.set()` call →
  Identity interface → row-construction object → render. A partial
  update is what causes the paired TS-error class of bug.

## NEXT CLAUDE SESSION — STARTING POINT

Read this document first, in full, before touching anything.

Treat everything under "SOURCE OF TRUTH — REUSABLE ANALYTICS ARCHITECTURE"
above as LOCKED. Treat everything under "IMPLEMENTED BUT NOT VERIFIED" in
this session log as **existing but unproven** — don't re-derive it from
scratch, but don't treat it as correct either.

**Start with Promotion relationship correctness (Open Investigation E,
queue items 6–10), not the frozen architecture and not a re-investigation
of Identity from zero.** Promotion is flagged CRITICAL because the
current implementation may be actively wrong (showing rows from the
wrong Promotion), not merely incomplete — that's a higher-priority defect
class than an unstyled dropdown.

After Promotion relationship correctness, continue remaining Identity
verification (queue items 3–5), then the rest of the P1 queue in order.
Do not start P2 Presentation or Archive work until P0 and P1 are
resolved, per the existing phase-gate discipline this project has been
using (Identity → test → Filters → test → Metrics verification → Archive
→ test → Mobile → test).

Do not implement Promotion filtering "final" fixes, Asset grouping, or
Shared/Assigned filters without first completing the corresponding
investigation item above. Do not modify `+ Track New Content` without
first tracing it per item F/8.



Following i havent update to assetanalytic design yet, like its here, but its not in the right place,  we need to put it in the right place 

# ASSET_ANALYTICS_DESIGN 5 — Update: Navigation, Date Range, Recently Added & Content Owner

## 1. Asset / Video Navigation

### Asset → AssetDetail

**Confirmed route:**

```text
/assets/{asset_id}
```

From `Assets.tsx`, every asset row ultimately uses the real `asset_id` as its navigation ID:

* "My" assets → `linkId = row.id`
* "Shared" assets → `linkId = row.asset_id`

Therefore, `AllAssetsAnalytics.tsx` should navigate directly to:

```tsx
navigate(`/assets/${row.asset.id}`)
```

### Video → VideoDetail

**Confirmed route:**

```text
/videos/{video_id}
```

`Videos.tsx` already uses:

```tsx
<Link to={`/videos/${v.id}`}>
```

Therefore, `AllAssetsAnalytics.tsx` should navigate using:

```tsx
navigate(`/videos/${row.promoting_video.id}`)
```

### Implementation

`AllAssetsAnalytics.tsx` already imports `useNavigate()`, so no additional router import is required.

Make the **Asset** cell clickable:

```tsx
<div
  className="flex items-center gap-3 cursor-pointer"
  onClick={() => navigate(`/assets/${row.asset.id}`)}
>
```

Make the **Content / Video** cell clickable:

```tsx
<div
  className="flex items-center gap-3 cursor-pointer"
  onClick={() => navigate(`/videos/${row.promoting_video.id}`)}
>
```

### Design intent

The analytics table should behave as a navigation surface:

* Clicking an Asset → Asset Detail
* Clicking the promoting Content / Video → Video Detail

No new navigation architecture is needed.

---

# 2. Date Range — Investigation Result

## Status: Wiring appears correct; engine/cache still needs verification

`AllAssetsAnalytics.tsx` and `getAssetAnalyticsRows.ts` correctly pass the selected date range through the analytics pipeline.

Current flow:

```text
Date Range UI
    ↓
dateRange / customRange
    ↓
getAssetAnalyticsRows()
    ↓
getDateBounds()
    ↓
startIso / endIso
    ↓
Events query
    .gte(...)
    .lte(...)
    ↓
Purchase filtering
    inDateWindow(...)
```

Both event data and Stripe / pixel purchase data appear to respect the selected date window.

Therefore, **do not patch `AllAssetsAnalytics.tsx` or `getAssetAnalyticsRows.ts` yet.**

### Remaining investigation

There are two remaining likely causes if the date selector still produces incorrect results:

#### Candidate A — `getDateBounds()`

Located in:

```text
assetAnalyticsEngine.ts
```

Need to inspect the actual function implementation and verify that:

```text
dateRange → correct start date
dateRange → correct end date
```

are being calculated for every supported range.

Potential bug example:

```text
UI changes date range
        ↓
getDateBounds()
        ↓
always returns the same date window
```

#### Candidate B — caching

Potential cache files include:

```text
assetsPageCache.ts
pageCache.ts
```

Need to verify whether `getAssetAnalyticsRows()` is called through a cache whose key does **not** include the selected date range.

Potential bug:

```text
First request:
campaign=A + dateRange=30d
        ↓
cache stores result

User changes to:
campaign=A + dateRange=7d
        ↓
same cache key
        ↓
old 30d result returned
```

### Required next investigation

Inspect only:

1. `getDateBounds()` from `assetAnalyticsEngine.ts`
2. Whether `getAssetAnalyticsRows()` is wrapped by any caching layer
3. Whether the cache key includes the date range

Do not change the date-range implementation until this is confirmed.

---

# 3. Recently Added Sort

## Goal

# 3. Recently Added Sort

## Goal

Add a new sorting option:

```text
Recently Added
```

**Important:** In the Asset Analytics table, rows are represented at the **Asset × Promoting Video** grain.

Therefore, `Recently Added` should sort by the **promoting video's creation timestamp**:

```text
videos.created_at
```

rather than:

```text
assets.created_at
```

This means the sort answers:

> "Which promoting content was added most recently?"

rather than:

> "Which underlying asset was added most recently?"

This distinction is important because the same Asset can be promoted by multiple Videos.

Example:

```text
Asset A
├── Video 1 — created January
└── Video 2 — created August

Asset B
└── Video 3 — created March
```

With `Recently Added` descending, the expected order is:

```text
Asset A — Video 2 — August
Asset B — Video 3 — March
Asset A — Video 1 — January
```

The row grain remains unchanged. **Do not aggregate the rows by Asset.**

---

## Required Data Flow

The `created_at` value must travel through the promoting-video enrichment pipeline:

```text
videos.created_at
        ↓
videosRes
        ↓
videoDisplay Map
        ↓
PromotingVideoIdentity
        ↓
row.promoting_video.created_at
        ↓
Recently Added sorting
```

No new database query is required because the existing `videosRes` query already uses:

```tsx
select('*')
```

Therefore `v.created_at` is already available in memory.

---

## Patch A — Add `created_at` to `PromotingVideoIdentity`

Existing:

```tsx
interface PromotingVideoIdentity {
  id:             string;
  title:          React.ReactNode | undefined;
  thumbnail_url?: string;
  platform?:      string | null;
}
```

Change to:

```tsx
interface PromotingVideoIdentity {
  id:             string;
  title:          React.ReactNode | undefined;
  thumbnail_url?: string;
  platform?:      string | null;
  created_at?:    string | null;
}
```

---

## Patch B — Preserve `created_at` in `videoDisplay`

Existing:

```tsx
const videoDisplay = new Map<string, { title: React.ReactNode; thumbnail_url?: string; platform?: string | null }>();

for (const v of videosRes.data ?? []) {
  videoDisplay.set(v.id, {
    // Canonical helpers, same call signature InDepthAnalytics uses
    // (resolveThumbnail(row.video) / renderContentIdentity(row.video)).
    title: renderContentIdentity(v),
    thumbnail_url: resolveThumbnail(v),
    platform: v.platform ?? null,
  });
}
```

Change to:

```tsx
const videoDisplay = new Map<string, {
  title: React.ReactNode;
  thumbnail_url?: string;
  platform?: string | null;
  created_at?: string | null;
}>();

for (const v of videosRes.data ?? []) {
  videoDisplay.set(v.id, {
    // Canonical helpers, same call signature InDepthAnalytics uses
    // (resolveThumbnail(row.video) / renderContentIdentity(row.video)).
    title: renderContentIdentity(v),
    thumbnail_url: resolveThumbnail(v),
    platform: v.platform ?? null,
    created_at: v.created_at ?? null,
  });
}
```

No additional query is needed.

---

## Patch C — Pass `created_at` into the row

Existing:

```tsx
promoting_video: {
  id: r.video_id,
  title: v?.title ?? undefined,
  thumbnail_url: v?.thumbnail_url ?? undefined,
  platform: v?.platform ?? null,
},
```

Change to:

```tsx
promoting_video: {
  id: r.video_id,
  title: v?.title ?? undefined,
  thumbnail_url: v?.thumbnail_url ?? undefined,
  platform: v?.platform ?? null,
  created_at: v?.created_at ?? null,
},
```

This completes the data flow:

```text
videos.created_at
    ↓
videoDisplay
    ↓
promoting_video
    ↓
row.promoting_video.created_at
```

---

## Patch D — Keep the existing sort key

The existing shortcut:

```tsx
{ label: 'Recently Added', key: 'asset_created_at' }
```

can remain unchanged.

The key is already used by the sort system. Its implementation simply changes from using the Asset timestamp to the Promoting Video timestamp.

Therefore **do not rename the sort key** unless there is a separate reason to do so.

---

## Patch E — Fix the date-aware comparator

Existing:

```tsx
if (key === 'asset_created_at') {
  return [...promotionFilteredRows].sort((a, b) => {
    const at = a.asset.created_at ? new Date(a.asset.created_at).getTime() : 0;
    const bt = b.asset.created_at ? new Date(b.asset.created_at).getTime() : 0;
    if (at === bt) return 0;
    return at > bt ? dir : -dir;
  });
}
```

Change to:

```tsx
if (key === 'asset_created_at') {
  return [...promotionFilteredRows].sort((a, b) => {
    const at = a.promoting_video.created_at
      ? new Date(a.promoting_video.created_at).getTime()
      : 0;
    const bt = b.promoting_video.created_at
      ? new Date(b.promoting_video.created_at).getTime()
      : 0;

    if (at === bt) return 0;
    return at > bt ? dir : -dir;
  });
}
```

The normal metric sorting branch remains untouched.

---

## Expected behavior

When:

```text
Recently Added
```

is selected:

### Descending

Newest promoting videos first:

```text
August video
June video
March video
January video
```

### Ascending

Oldest promoting videos first:

```text
January video
March video
June video
August video
```

Rows without `videos.created_at` use timestamp `0` and therefore fall to the oldest end when sorting descending.

---

## Important distinction

Do **not** add `assets.created_at` to this particular Recently Added pipeline unless another feature specifically needs the Asset's own creation date.

There are now two different concepts:

```text
Asset created_at
    = when the reusable Asset entered the asset library

Video created_at
    = when the promoting Content/Video was created
```

For this Asset Analytics table's `Recently Added` shortcut, use:

```text
videos.created_at
```

because the table's row grain is:

```text
Asset × Promoting Video
```

and not simply:

```text
Asset
```

---

# 4. Content Owner

## Status: Do NOT implement yet — ownership model confirmed, display source still needs investigation

The current investigation found that `Videos.tsx` writes:

```tsx
user_id: user.id
```

when saving videos.

This provides evidence that:

```text
videos.user_id = content creator / owner
```

However, this is currently confirmed only from the **write path**.

We have not yet confirmed:

1. How the existing UI displays a user's name from `user_id`
2. Which table/profile contains the display name
3. Whether the application already has a reusable user/member lookup
4. Which existing page should be treated as the canonical implementation

---

# 5. Asset Owner vs Content Owner

The existing architecture already distinguishes:

```text
Asset Ownership
        ≠
Shared Access
```

Therefore, the new analytics concept should preserve that distinction.

For the Asset Analytics table:

### Asset Owner

Who owns the Asset itself.

### Content Owner

Who owns / created the promoting Video or Content.

These should **not** automatically be treated as the same person.

Example:

```text
Asset A
Owner: Sam

Video 1
Content Owner: Sam

Video 2
Content Owner: Alex
```

Both videos can promote the same Asset while having different Content Owners.

Therefore, **Content Owner must come from the promoting content/video**, not from the Asset ownership field.

---

# 6. Current AllAssetsAnalytics Scope

Current investigation suggests that `getAssetAnalyticsRows.ts` is scoped primarily by:

```text
organization_id
```

and does not currently apply a:

```text
user_id
```

owner filter.

This suggests that All Assets Analytics may currently include assets/content belonging to multiple members of the organization.

However, this should be treated as **pending confirmation**, not yet a locked requirement.

Before implementing the Content Owner filter, confirm the existing member/user display pattern.

---

# 7. Required Investigation Before Content Owner Implementation

Find an existing page that already converts a `user_id` into a displayable member/user name.

Likely candidates:

```text
pages/operator/Members.tsx
```

or:

```text
AssignmentDetail.tsx
```

The important thing to extract is only the relevant query/join pattern:

```text
user_id
   ↓
member/profile/user table
   ↓
display name / email
```

Once confirmed, reuse the same canonical pattern in Asset Analytics rather than creating a new user lookup architecture.

---

# 8. Implementation Order

Do these in this order:

### Step 1 — Navigation

Implement:

```text
Asset → /assets/{asset_id}
Video → /videos/{video_id}
```

This is fully confirmed and safe to implement.

### Step 2 — Recently Added

Implement:

```text
assets.created_at
        ↓
asset row
        ↓
Recently Added sort
```

This is fully traced and ready to patch.

### Step 3 — Date Range

Investigate:

```text
getDateBounds()
```

and:

```text
cache key / caching wrapper
```

Do not modify the date-range UI until the actual failure point is identified.

### Step 4 — Content Owner

First identify the existing:

```text
user_id → member/profile → display name
```

pattern.

Then design:

```text
Content Owner column
+
Content Owner filter
```

Only after the canonical member lookup is confirmed.

---

# 9. Current Status Summary

| Item                         | Status                      | Action                   |
| ---------------------------- | --------------------------- | ------------------------ |
| Asset → AssetDetail          | ✅ Confirmed                 | Implement                |
| Video → VideoDetail          | ✅ Confirmed                 | Implement                |
| Date Range wiring            | ✅ Appears correct           | Investigate engine/cache |
| `getDateBounds()`            | ⚠️ Not yet inspected        | Inspect                  |
| Analytics caching            | ⚠️ Not yet confirmed        | Inspect                  |
| Recently Added               | ✅ Fully designed            | Implement                |
| `assets.created_at`          | ✅ Confirmed available       | Add to pipeline          |
| Asset Owner vs Shared Access | ✅ Existing architecture     | Preserve                 |
| Content Owner source         | ⚠️ Partially confirmed      | Investigate              |
| Content Owner filter         | ⏸️ Pending                  | Do not implement yet     |
| Multi-member analytics scope | ⚠️ Likely organization-wide | Confirm before changing  |

## Core principle

**Do not invent new architecture where the existing application already has a pattern.**

For navigation, reuse the existing routes.

For dates, trace the existing analytics pipeline before changing it.

For Recently Added, reuse the existing sort system and add a date-specific branch.

For Content Owner, reuse the application's existing `user_id → member/profile → display name` pattern.

This keeps `AllAssetsAnalytics` consistent with the rest of the VSTRK application instead of creating isolated implementations.

---

# 10. SESSION UPDATE — 2026-08-28 — Content Marketer filter, duplicate Total Revenue, sortable Asset Clicks / Total Revenue

Supersedes the "pending" status on Content Owner filter in §9 above. Content Owner
column, Content Owner filter (renamed in UI to **Content Marketer**), and a second
Total Revenue ($) column were implemented and verified in this and the immediately
preceding session. This section is the current source of truth for all of it.

## 10.1 Current table column order (LOCKED)

```
Asset | Type | Promoting Content | Content Owner | Asset Clicks | Total Revenue ($) |
Landing Page Clicks | Direct Purchases | Lead Magnet Clicks | Newsletter Clicks |
Newsletter Opt-ins | Call Booking Clicks | Call Bookings Confirmed |
Consultation Page Clicks | Consultation Purchases | Direct Offer Sales ($) |
Estimated Call Revenue ($) | Consultation Revenue ($) | Total Revenue ($) |
Revenue Per Click ($)
```

There are intentionally **two** `Total Revenue ($)` columns: one pulled forward
next to Asset Clicks (presentation only), one in its original position among the
detailed engine metrics. See §10.5.

## 10.2 Recently Added (FINAL — do not redefine)

**Recently Added = promoting content `videos.created_at`, descending by newest
content first.** It is NOT `assets.created_at`.

Product reason: the user wants to identify the newest content currently
promoting an asset, so the promoting video's creation date is the meaningful
"Recently Added" dimension, not when the asset itself was created.

Recently Added — and every other sort key — runs on `sortedRows`, which is
derived from `contentOwnerFilteredRows`, i.e. it always sorts the fully-filtered
set. Filters are never applied after sort.

## 10.3 Content Owner column (LOCKED)

Resolution path:

```
videos.user_id → profiles.id → profiles.full_name ?? profiles.email
```

Content Owner means **the person who created/owns the promoting content** — not
the Asset owner. This is deliberate: an asset can be promoted by another
member's video, and the table needs to say whose content is doing the
promoting, not who owns the asset. There is no Asset Owner column/filter and
none is planned.

Both an id and a display name are threaded through every layer, not just the
name (see §10.7 lesson):

- `videoDisplay` map: `content_owner_id` (raw `v.user_id`) + `content_owner_name`
  (`full_name?.trim() || email`, else `null`)
- `PromotingVideoIdentity` interface: same two fields
- row mapper `promoting_video` object: same two fields

Cell renders `content_owner_name ?? '—'`.

## 10.4 Content Marketer filter (LOCKED)

- UI label: **Content Marketer**
- Underlying identity: `row.promoting_video.content_owner_id` (i.e.
  `videos.user_id`) — filtering is done by id, never by display name, so two
  people sharing a name can't collide and a later name change can't silently
  break the filter.
- Display fallback for the dropdown options list: `full_name ?? email ??
  'Unknown'`.
- It filters the **promoting content** rows (rows whose promoting video was
  made by the selected person) — it is not an Asset Owner filter.
- Options (`contentOwners`) are derived client-side from `rows` already on
  screen, deduped by id — the same conservative, non-widening approach
  `usePromotionOptions()` already uses. If the underlying row scope is
  narrower than expected, the marketer list is narrower too, not wrong (see
  §10.8 open item).

Filter pipeline (current, real, traced from code — not assumed):

```
base rows → Type → Platform → Campaign → Promotion → Content Marketer → Sort
```

(An earlier instruction described the order as Campaign → Promotion →
Platform; the real code has Type → Platform → Campaign → Promotion. Order
doesn't change the result since every step is an independent AND-combined
equality/inclusion filter — documented here so the next session doesn't
"fix" it back to a wrong order.)

Recently Added / any metric sort always runs last, on `contentOwnerFilteredRows`.

## 10.5 Duplicate Total Revenue ($) column (LOCKED)

There are intentionally TWO `Total Revenue ($)` columns:

- one immediately after Asset Clicks (presentation duplicate)
- the original, in its existing position among the detailed engine metrics

Both read the exact same value, `row.metrics.total_revenue` — there is no
second revenue calculation, and the duplicate header's label is pulled from
`COLUMN_LABELS['total_revenue']` rather than a hardcoded string, so it's
guaranteed to say exactly what the original column says.

**Both Total Revenue headers are sortable**, and both use `handleSort('total_revenue')`
— the same sort key, the same `sortConfig` state, the same existing sort
mechanism used by every other engine column. Clicking either header sorts the
table by Total Revenue; there is no second sort system and no duplicate sort
state.

This was a deliberate reversal of an earlier decision. The duplicate column had
initially been left non-sortable/non-clickable (static style) to avoid two
controls fighting over `sortConfig` — but since both columns read the same key
and drive the same `sortConfig`, there was never actually a conflict risk, so
it was made sortable to match the user's requirement.

## 10.6 Asset Clicks column (LOCKED)

Asset Clicks is now sortable via the same `handleSort` / `sortConfig`
mechanism as every other column — `handleSort('asset_clicks')` on click,
`ArrowUpDown` icon reflecting `sortConfig.key === 'asset_clicks'`.

Important implementation detail for the next session: **`asset_clicks` is not
a `MetricType` key and does not live in `row.metrics`.** It's a sibling field,
`row.asset_clicks: number | null`, sourced from `r.metrics.clicks` in the row
mapper. The generic sort branch in `sortedRows` (`Number(a.metrics[key] ??
0)`) would silently treat it as `undefined`/`0` for every row. `sortedRows`
therefore has a dedicated `if (key === 'asset_clicks')` branch — same pattern
as the existing `asset_created_at` branch — reading `a.asset_clicks` /
`b.asset_clicks` directly. Do not delete this branch or fold it into the
generic one without re-adding the field to `row.metrics`.

## 10.7 Regression lessons

Preserve the existing thumbnail "missing else branch" regression lesson
(§ "LESSON — Asset thumbnail 'missing else branch' regression (2026-08-28)"
above) — unchanged, still applies.

New lesson from this session:

> When a metric already exists in the analytics engine, presentation changes
> must reuse the existing metric key rather than introducing duplicate
> calculation logic. If the same metric appears twice in the table, both
> columns should read the same underlying metric and can share the same sort
> key.

Related lesson (Content Owner / Content Marketer): when a UI needs to *filter*
by an identity that's also *displayed* as a name, thread the id through every
layer alongside the name from the start (map → interface → row object). Adding
the id later means re-touching all three layers a second time; adding it
upfront costs nothing extra and avoids a second propagation pass.

## 10.8 Status table update (supersedes §9 rows below)

| Item                    | Status      | Action    |
| ----------------------- | ----------- | --------- |
| Content Owner column    | ✅ Implemented & verified | — |
| Content Owner filter (UI: "Content Marketer") | ✅ Implemented & verified | — |
| Duplicate Total Revenue ($) column | ✅ Implemented & verified | — |
| Asset Clicks sortable | ✅ Implemented this session | — |
| Total Revenue (both columns) sortable | ✅ Implemented this session | — |
| Cross-member scope (does another member's promoting video show up under my asset?) | ⚠️ Still not proven from code | Get `services/asset/getAssetAnalyticsRows.ts` and confirm `viewerId` is never used in a `.eq()`/`.in()` filter on the video/redirect_link side |

## 10.9 Next queue (unchanged carry-forward)

Mobile filter UX (P2 items 15–18) is next: collapse the mobile filter panel
behind a **Filters** button that reveals Date Range, Campaign, Promotion,
Platform, and Content Marketer; keep desktop layout unchanged; trace existing
responsive/modal patterns in the app before building anything new. Chart
mobile treatment is inspect-first, no redesign unless a real problem is
demonstrated. See the handoff prompt for full detail — not duplicated here to
avoid drift between two copies of the same instructions.

md
---

## Session Addendum — Promotion ↔ Asset ↔ Content Investigation (this session)

### CONFIRMED

- Asset ↔ Video: `videos.asset_id → assets.id` (Type 2 only). Unchanged, not in question.
- Video ↔ Promotion (Mechanism B, currently used by AllAssetsAnalytics /
  buildAssetAnalyticsRows / getAssetAnalyticsRows / journeyAnalyticsEngine):
  `videos.id → redirect_links.video_id → redirect_links.promotion_id`
- Promotion ↔ Asset pool (Mechanism A, currently used by getPromotionAnalytics.ts
  and getTopPromotionsAnalytics.ts, called "locked" in both):
  `promotions.assignment_id → assignment_assets.assignment_id → assignment_assets.asset_id`
- These two mechanisms are NOT proven to always agree. AllAssetsAnalytics and
  the individual/top Promotion Analytics surfaces do not currently share one
  attribution path. This is not resolved by this session.
- `assignment_assets` is dual-purpose: (1) authorization/revoke boundary
  (addPromotionAsset.ts, assignment_asset_access_states), (2) the asset pool
  used by Mechanism A. One asset can legitimately sit under multiple
  assignment_assets rows (multiple assignments → potentially multiple
  promotions for the same asset).
- Promotion display name: `promotions` has no title column.
  Canonical name = `promotions.assignment_id → assignments.title`,
  fallback `promotions.campaign_id → campaigns.campaign_name`.
  `promotions.promotion_name` does NOT exist / is not used anywhere else in
  the codebase — AllAssetsAnalytics.tsx was the only place referencing it,
  and that's why the Promotion filter was rendering the raw promotion id.
  Fixed this session (usePromotionOptions).

### OPEN INVESTIGATION — NOT CLOSED

**Why can `redirect_links.asset_id` be populated while `redirect_links.promotion_id`
is NULL?**

Real examples on file:

redirect_link A: promotion_id = 6264..., asset_id = d99e..., video_id = 31244...
redirect_link B: promotion_id = NULL, asset_id = 83423..., video_id = 31244...


We do NOT know why B has no promotion_id. The correct question is not
"promotion_id is NULL so fall back to assignment_assets" — that has not been
earned. The actual investigation, still open:

1. Which flow/function created redirect_link B?
2. What context did that flow have at creation time (was a promotion even
   selected/known at that point)?
3. Why did asset_id get populated but promotion_id did not — was promotion_id
   optional-by-design there, or is it a bug/legacy gap?
4. At creation time, which assignment(s) did asset `83423...` belong to?
5. At creation time, who/what did video `31244...` belong to?
6. Given 1–5, is there a UNIQUE promotion derivable for redirect_link B, or is
   it genuinely ambiguous (asset in >1 assignment/promotion)?

This requires locating the actual `+ Track New Content` / redirect_link
creation code, which is not among the files traced so far. Until that's
found and read, no fallback logic (assignment_assets-based inference or
otherwise) should be added to resolve NULL promotion_id cases.

### THIS SESSION'S DECISION

- Added a Promotion column to AllAssetsAnalytics (hidden by default), reading
  `row.promotion_id` exactly as getAssetAnalyticsRows already produces it
  (Mechanism B — no new relationship, no new fallback).
- Fixed the Promotion filter dropdown to resolve names via
  `assignments.title` / `campaigns.campaign_name` instead of the
  non-existent `promotions.promotion_name`.
- Explicitly NOT claiming this column represents the single correct
  Promotion for every (video_id, asset_id) row. When `promotion_id` is NULL,
  or when an asset sits under multiple assignments, this column may be
  incomplete or ambiguous — that's expected until the Open Investigation
  above is closed.

  ---

## Session Addendum (2026-08-29) — redirect_links.promotion_id NULL semantics

### CONFIRMED
- generateAssetRedirectLinks.ts (the real creation code) never resolves or
  guesses promotion_id — it only passes through selected.promotionContext,
  which is documented as existing ONLY for Shared assets. My and Assigned
  assets intentionally produce promotion_id = NULL by design.
- redirect_links.asset_id represents the ASSET BEING PROMOTED, which can
  differ from the promoting video's own Type-2 asset_id. Both fields
  co-existing with different values is expected, not an anomaly.
- "Shared" is defined elsewhere in the codebase (resolvePromotionContextForAsset.ts)
  as asset.organization_id != viewer.organization_id — cross-org, not just
  "not owned by me."

### OPEN
- The Picker/Videos.tsx code that actually classifies an asset as
  My vs. Assigned vs. Shared for a given viewer has not been traced —
  not in file set yet. Needed before:
  - labeling NULL promotion_id rows in the UI (can't yet distinguish
    My from Assigned),
  - building the All/My/Shared/Assigned/Archived asset filter.
- Whether a Shared asset with zero resolvable promotions can still reach
  redirect_link creation with promotion_id = NULL — not confirmed.
- Marketplace's "My Assigned Marketers' Promotions" / "All Promotions"
  scopes are NOT in Marketplace.tsx (only "My Promotions" tab via
  listMyPromotions()). Likely lives in TopPromotions.tsx / TopMarketers.tsx
  — not yet uploaded/traced.

### DECISION
- Do not add a "My Asset" label yet — the underlying My-vs-Assigned split
  is not distinguishable with current data in AllAssetsAnalytics. Promotion
  cell continues to show the resolved name or "—" for NULL, no relabeling
  until the Picker/Videos.tsx trace closes this gap.
- Promotion column text truncated to max-w-[190px] (matches Asset/Content
  columns) with full name on hover via title attribute.
  ---

## Session Addendum (2026-08-29, cont'd 3) — Promotion column source, My/Assigned/Shared model, Patch 1 status

### CONFIRMED

**1. Promotion column**
- AllAssetsAnalytics has a Promotion column.
- Canonical display-name source: `promotions.assignment_id → assignments.title`,
  fallback `promotions.campaign_id → campaigns.campaign_name`.
- `promotions.promotion_name` does not exist and is not used — confirmed
  previous session, unchanged.
- The Promotion column does not introduce a new promotion relationship; it
  reads the existing `promotion_id` exactly as `getAssetAnalyticsRows.ts`
  already produces it (Mechanism B, per the original Promotion ↔ Asset ↔
  Content investigation addendum above).

**2. redirect_links.promotion_id NULL semantics**
- `generateAssetRedirectLinks.ts` is confirmed pass-through only:
  `selected.promotionContext?.promotionId ?? null` — it never resolves or
  guesses a promotion.
- Track New Content (`Videos.tsx`, `categorizeAsset()` call site, hardcoded
  `isAssignedOut: false`) does not distinguish My from Assigned when
  deciding whether to resolve a `promotionContext` — only the org boundary
  (shared vs not) matters for that decision. Both My and Assigned assets
  are same-org → no `promotionContext` → `redirect_links.promotion_id = NULL`
  by design. This is not a bug.
- Shared assets are the case where a `promotionContext` (and therefore a
  populated `promotion_id`) is expected.
- A NULL `promotion_id` on a Shared asset remains unresolved/invalid — do
  NOT fall back to `assignment_assets`, do NOT guess a promotion for it.
  Keep showing `—`.

**3. My / Assigned / Shared asset model**
- `My = asset.organization_id === viewer organizationId`
- `Shared = asset.organization_id !== viewer organizationId`
- `Assigned` = annotation from `getAssignedAssetSummaryForOwner(viewerId)`,
  applied as a filter over My rows (`mine.filter(r => r.isAssigned)`) —
  confirmed both from `PromotedAssetPicker.tsx`'s comment ("Assigned remains
  an ANNOTATION on My rows, never a third asset source") and its runtime
  code.
- Assigned is NOT mutually exclusive with My. A single asset can be both My
  and Assigned at once. Do not implement `My OR Assigned` as exclusive
  categories.
- This model mirrors `Assets.tsx` / `PromotedAssetPicker.tsx` and is a
  separate system from Marketplace's Promotion-scope tabs (My Promotions
  etc.) — do not conflate the two.
- `getAssignedAssetSummaryForOwner`: named export, call-site-confirmed
  (not source-file-confirmed — the file itself was never uploaded/read)
  import path `./getAssignedAssetSummaryForOwner` (sibling of
  `getAssetArchiveContext.ts` in `services/asset/`), signature
  `getAssignedAssetSummaryForOwner(userId: string) => Promise<AssignedAssetSummary[]>`,
  where each element has at least `.assetId: string` and
  `.collaboratorCount: number | null`. Accepted as sufficient call-site
  evidence to proceed; not fully source-confirmed.

**4. Patch 1 (data layer, getAssetAnalyticsRows.ts) — implementation status**
Already completed:
- Promotion name resolution fix (assignments.title / campaigns.campaign_name).
- Promotion column (UI).
- Promotion column visibility toggle — now defaults to visible, no longer
  hidden by default.
- PATCH 1B: `getAssignedAssetSummaryForOwner(viewerId)` added into the
  existing `Promise.all([...])` alongside videos/resources/campaign-element
  fetches (no extra round-trip); `assignedAssetIds` Set built from it.
- PATCH 1C: `AssetAnalyticsTableRow` type carries two new raw facts —
  `assetOrganizationId: string` and `isAssigned: boolean` — and `rows.push`
  populates both. These are raw facts only, not UI labels; classification
  into My/Assigned/Shared is left to `AllAssetsAnalytics.tsx`.

Found and NOT yet fixed:
- PATCH 1A was specified but never actually applied to the uploaded file.
  `assetOrgIdById` is referenced (in the `rows.push` line added by 1C) but
  never declared — this is the exact cause of the `TS2304: Cannot find
  name 'assetOrgIdById'` error. The fix (declare
  `const assetOrgIdById = new Map<string, string>()` alongside the existing
  `assetTypeById` map, and populate it from `assetsData`'s already-fetched
  `organization_id`) has been specified with exact Ctrl+F anchors but not
  yet applied to the real repo file.

**5. Shared-asset org-scoping investigation (resolved as likely-not-a-blocker)**
- Earlier claim that `getAssetAnalyticsRows.ts`'s
  `redirect_links.organization_id = organizationId` filter blocks cross-org
  Shared assets was walked back as too hasty.
- `redirect_links.organization_id` is evidenced (from
  `getPromotionAnalytics.ts` and `generateAssetRedirectLinks.ts`'s
  video-asset branch) to represent the promoter's org, not the promoted
  asset's org — meaning Shared-asset rows likely already pass this filter
  from the viewer's own org context. The subsequent `assets` lookup has no
  org filter at all, so a cross-org asset row would come back fine too.
- This is LIKELY, not fully proven — `createRedirectLink()` (in
  `lib/redirects.ts`) has not been read, so a branch that copies the
  asset's own org instead cannot be ruled out.
- Decision: do not chase `lib/redirects.ts` right now. Do NOT modify
  `redirect_links.organization_id`, `createRedirectLink()`, or the base
  analytics query scope for this task. Proceed on the current architecture
  and revisit only if the Shared filter tab turns up empty in real testing.

### OPEN

- `getAssignedAssetSummaryForOwner.ts` itself still not read from source —
  return shape beyond `assetId`/`collaboratorCount`, extra params, and
  error behavior are unconfirmed (call-site evidence only, accepted as
  sufficient).
- Whether `redirect_links.organization_id` can ever hold the asset's org
  instead of the promoter's org (some untraced branch of
  `createRedirectLink()`) — unconfirmed, deliberately not chased this
  session.
- `categorizeAsset()`'s own internal branching logic
  (`services/redirect/getPromotedAssetDisplay.ts`) has still not been read
  — its org-boundary behavior is inferred from the `Videos.tsx` call site
  only, not from the function body.
- `Assets.tsx` itself has still not been uploaded/read — the My/Assigned/
  Shared model is trusted via `PromotedAssetPicker.tsx`'s self-consistent
  mirror of it, not independently verified against the original.

### DECISION / NEXT STEPS (only remaining implementation work)

1. Apply PATCH 1A: declare and populate `assetOrgIdById` in
   `getAssetAnalyticsRows.ts` (exact anchor already specified above)
   — resolves the current `TS2304` build error. Nothing else in Patch 1
   needs touching.
2. In `AllAssetsAnalytics.tsx`, derive classification from the two raw
   facts already on each row:
   - `isMyAsset = row.assetOrganizationId === organizationId`
   - `isSharedAsset = row.assetOrganizationId !== organizationId`
   - `isAssignedAsset = row.isAssigned` (only meaningful when `isMyAsset`)
3. Add the asset filter `All / My / Shared / Assigned` in
   `AllAssetsAnalytics.tsx`, reusing the existing `useState` + `useMemo`
   filter pattern already in that file (same mechanism as
   `selectedPromotionId` / `campaignFilteredRows` etc.) — no new
   filtering system.
4. Update the Promotion column cell to branch on
   `isMyAsset` / `isAssignedAsset` / `isSharedAsset` × `promotion_id`:
   - My + NULL → "My Asset"
   - Assigned + NULL → "Assigned Asset"
   - Shared + promotion_id → resolved promotion name (unchanged)
   - Shared + NULL → "—" (unchanged, still unresolved)

Explicitly deferred / out of scope for the above:
- No Archived filter — separate future task, do not mix in.
- No changes to `redirect_links.organization_id` or `createRedirectLink()`.
- No `assignment_assets` → promotion fallback logic.
- No re-investigation of anything already CONFIRMED above.

---

## ADDENDUM — 2026-08-29 / 2026-08-30: Cross-org video RLS fix, NULL promotion_id forensic investigation, strategy change

This addendum is source-of-truth for everything below. It supersedes any
in-progress speculation from earlier sections on these two specific topics
(cross-org video visibility, `promotion_id IS NULL`). Do not re-investigate
either without new contradicting evidence.

### A. Problem 1 — Sponsor/owner viewer saw "Untitled video" / Content Owner "—" — CLOSED

**Symptom:** A sponsor org (asset owner) viewing a legitimate cross-org
analytics row (their own asset, promoted by a collaborator in a different
org, via a redirect_link correctly scoped to the sponsor's own
`organization_id`) saw `Content = Untitled video`, `Content Owner = —`. The
collaborator viewing the same row saw correct data. `Promotion` column was
already correct (it resolves from `promotions`/`assignments`, which the
sponsor legitimately owns/reads).

**Root cause (confirmed from source + DB, not RLS-by-assumption):**
`AllAssetsAnalytics.tsx`'s Content/Content Owner display comes from a
separate, unscoped query — `supabase.from('videos').select('*').in('id',
videoIds)` — with **no application-level org filter**. This is a different
query from `getAssetAnalyticsRows.ts`'s own `videos` fetch (`select('id,
asset_id, campaign_id')`, scoped by `asset_id`, used only to feed the
metrics engine — irrelevant to Content/Content Owner display).

Confirmed via `pg_policies` that, before the fix, `videos` had only:
- `Users can view videos in their organization` (`organization_id ∈`
  viewer's `organization_members`)
- `Assignment collaborators can view assigned videos` (via
  `assignment_assets.asset_id = videos.asset_id` + `assignment_collaborators.user_id
  = auth.uid()`) — this direction only helps a **collaborator** see a video
  assigned to them; it does not help a **sponsor** see a promoting video
  that lives in a collaborator's org.

Neither policy covered "sponsor org can see a video that is legitimately
promoting one of the sponsor's own assets." This was a genuine
authorization gap, not an application bug — confirmed by a live DB query
showing the video row existed with full metadata (`video_title`, `user_id`,
etc.) but was invisible to the sponsor's authenticated session.

**Initial candidate policy (REJECTED before being applied):**
```sql
CREATE POLICY "Asset owners can view promoting videos via redirect_links"
ON public.videos FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM redirect_links rl
    WHERE rl.video_id = videos.id
      AND rl.organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
  )
);
```
Rejected because `redirect_links` is a historical/tracking record, not a
live-authorization source (`redirect_links.promotion_id` is a write-time
snapshot, never updated after insert — see Section B). This policy would
have kept a video visible to a sponsor forever, even after the underlying
assignment/collaboration was revoked — inconsistent with this codebase's
existing revocation discipline (`assignment_collaborators.status='active'`
as the read-time gate, same pattern `listSharedAssetsForCollaborator.ts`
already uses).

**Final policy — APPLIED and DB-verified against the real test row
(video `93771302-27dd-4468-abbd-56f452b26e61`, asset
`686ed2df-cb5a-4c09-b84e-3fd5b5777ece`, promotion
`b75d2b38-8a46-4944-a7e4-15862cfae3a2`):**
```sql
CREATE POLICY "Sponsor orgs can view promoting videos for active promotions"
ON public.videos FOR SELECT USING (
  EXISTS (
    SELECT 1
    FROM redirect_links rl
    JOIN promotion_assets pa
      ON pa.asset_id = rl.asset_id AND pa.promotion_id = rl.promotion_id
    JOIN promotions p ON p.id = rl.promotion_id
    JOIN assignment_collaborators ac
      ON ac.id = p.assignment_collaborator_id AND ac.status = 'active'
    JOIN assets a ON a.id = rl.asset_id
    WHERE rl.video_id = videos.id
      AND a.organization_id IN (
        SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
      )
  )
);
```
Authorization semantics: sponsor org can read a promoting video's metadata
**only while** the promotion is currently active (gated on
`assignment_collaborators.status = 'active'`) and the asset is currently
owned by that sponsor org (`assets.organization_id`, not a stale
`redirect_links.organization_id` snapshot). Revoking the collaborator
immediately removes visibility. Requires `rl.promotion_id IS NOT NULL` to
match — this is intentional: legacy NULL-promotion redirect_links cannot
prove current authorization and are correctly excluded from this policy
(see Section B — they remain a separate, unresolved problem, not silently
patched over by this RLS change).

**Impact / verification:** Purely a DB-layer (RLS) change. Zero application
code touched. Verified live: sponsor viewer's row changed from `Untitled
video` / `—` to the correct YouTube title and content owner; collaborator
view unchanged; row also began sorting correctly under "Recently Added"
(this was never a separate sorting bug — the row was always timestamped
correctly, it just couldn't resolve its own video's data).

**Status: CLOSED.** Do not reopen without new contradicting production
evidence. Do not touch this policy, `AllAssetsAnalytics.tsx`'s video fetch,
or `getAssetAnalyticsRows.ts` on the basis of this problem again.

### B. Problem 2 — `redirect_links.promotion_id IS NULL` — investigation frozen, historical-repair strategy REVERSED

**Confirmed root cause of NULL (from source, not speculation):**
- `redirect_links.promotion_id` is a **write-time snapshot only**. It is
  set exactly once, at `createRedirectLink()` insert time
  (`lib/redirects.ts`), from whatever `promotionId` the caller passes in.
  It is never backfilled or recomputed after insert.
- The caller is `generateAssetRedirectLinks.ts`, which — per its own
  architecture lock comments — **never resolves a promotion itself**. It
  only passes through `selected.promotionContext?.promotionId ?? null`,
  where `selected.promotionContext` must already have been attached
  *before* this function runs, by whichever UI component calls
  `resolvePromotionContextForAsset()` (most likely `Videos.tsx`'s
  `handleSave()`, per `generateAssetRedirectLinks.ts`'s own header — **this
  UI caller file has still not been uploaded/read this session**).
- `resolvePromotionContextForAsset.ts` (confirmed from source) returns an
  **array** of candidate promotions (0, 1, or many) for a given asset. It
  is explicitly scoped to Shared assets only — its own docstring: *"For
  My/Assigned assets this will naturally return \[\] ... callers must not
  treat an empty result as invalid for those categories."* This means: for
  **My/Assigned assets, `promotion_id = NULL` is correct, expected
  behavior by design — it is not a bug and should never be "fixed."** Only
  a **Shared asset** (asset's org ≠ viewer's org) with `promotion_id =
  NULL` is a potentially real problem.
- Whatever logic collapses `resolvePromotionContextForAsset()`'s array down
  to the single `promotionContext` actually attached to a selection (i.e.,
  what happens when the array has 2+ candidates) lives entirely in the
  still-unread UI caller file. This is the actual undetermined piece: **we
  do not yet know whether the current app has a working disambiguation UI
  for the 2+-candidate case, or silently drops to NULL.** This is the
  single most important open question for Problem 2 and is unresolved.

**Historical forensic classification (DB-confirmed counts, 2026-08-29):**
Among `redirect_links` where `promotion_id IS NULL AND asset_id IS NOT
NULL`, classified by candidate count (candidate = `promotion_assets` match
+ `assignment_collaborators.status='active'` + `promotion.created_at <=
redirect_link.created_at`):
- **28 rows — 0 candidates.** No plausible promotion at all. Left NULL, not
  touched.
- **46 rows — exactly 1 candidate.** *Initially* considered a candidate for
  safe fallback repair. **This assumption was later reversed — see below.**
  Left NULL, not touched.
- **35 rows — 2+ candidates.** Genuinely ambiguous. A concrete real example:
  asset `83423ee8-9452-4517-bf89-4076468b760e` had **5** distinct active
  promotions, all created before the redirect_link's `created_at`, all with
  active collaborators — no way to determine from `redirect_links` alone
  which one the user actually meant (the table has no `created_by_user_id`
  or any field identifying which flow produced the row).

**Diagnostic backfill performed on the 35-row multi-candidate set:**
A deterministic, explicitly-labeled-as-non-authoritative temporary value
was written: for each of the 35 rows, `promotion_id` was set to the
candidate with the latest `promotion_created_at` (tie-broken by
`promotion_id DESC`). This was executed **only** to test whether NULL
`promotion_id` is a contributing cause of the broader Promotion Analytics
symptoms — **not** as a claim of recovered historical truth. Verified:
35 targeted → 35 filled → 0 still NULL; 28-zero-candidate and
46-one-candidate counts unchanged (untouched, as required). **A full
rollback ID list (the 35 `redirect_link.id` values) was generated and
retained** so this diagnostic backfill can be reversed with a single
`UPDATE ... SET promotion_id = NULL WHERE id = ANY(...)` at any time. This
35-row set **remains backfilled for now**, specifically to keep testing
Promotion Analytics against it — **do not roll it back without an explicit
decision to do so**, and do not treat its values as ground truth in any
other context.

**STRATEGY REVERSED — do not backfill the 46 one-candidate rows.**
Original reasoning was "1 candidate = high confidence, safe to fill."
This was rejected. Reasoning: `asset_id IS NOT NULL` does **not** imply
`promotion_id` should be non-NULL — a My/Assigned asset can legitimately
have `promotion_id = NULL` forever (see root cause above). A
`promotion_assets` row existing for an asset only proves "this asset is
*currently* associated with exactly one promotion" — it does **not** prove
"this specific historical redirect_link was created *through* that
promotion's flow." Backfilling on that basis would silently convert an
honest "unknown" into a fabricated-looking "known," indistinguishable from
real data, with no schema-level way to mark it as inferred. **Decision:
the 46 one-candidate rows are left untouched, and no further historical
`promotion_id` backfill will be attempted.** "Archaeology" of old rows is
deprioritized in favor of Section C below.

### C. New direction — STOP backfilling history → FIX FORWARD → TEST MATRIX

Decision (2026-08-30): stop spending further time trying to reconstruct
historical `promotion_id` values. The 35-row diagnostic backfill already
established what it needed to establish (NULL is *a* contributing cause of
Promotion Analytics symptoms — not full proof of a single root cause, but
sufficient signal). Further time is better spent guaranteeing **forward**
correctness than reconstructing the past.

**Governing principle (do not violate in any future patch):**
`asset_id IS NOT NULL` must **never** be treated as implying
`promotion_id` should be non-NULL. The correct invariant is per asset
category:

| Asset category | Has a Promotion? | Expected `redirect_links.promotion_id` |
|---|---|---|
| My Asset (no promotion exists) | No | `NULL` — correct, not a bug |
| Assigned Asset (no promotion exists) | No | `NULL` — correct, not a bug |
| Shared Asset, exactly 1 active promotion | Yes | **Must be non-NULL** — NULL here is a real bug |
| Shared Asset, 2+ active promotions | Yes (ambiguous) | Must be non-NULL via explicit user selection or a documented deterministic rule — silently NULL is a real bug; silently guessing is also a bug |
| Campaign Element Asset with campaign provenance | Sometimes | Depends on whether that provenance implies a Promotion — not yet defined, needs product-rule confirmation |
| Asset with genuinely zero promotion relationship | No | `NULL` — correct |
| Video with no asset (`asset_id IS NULL`) | N/A | Not in scope of `promotion_id` at all — these rows go into `buildAssetAnalyticsRows.ts`'s `ownCampaignRows` bucket, never the asset-promotion bucket |

**Next investigation target (NOT STARTED, this is the immediate next
step):** trace `Track New Content → Select Shared Asset → generateAssetRedirectLinks() →
createRedirectLink()` end-to-end, specifically the still-unread UI file
that calls `resolvePromotionContextForAsset()` and decides what to do when
it returns 2+ candidates. Confirm whether:
1. A Shared asset with exactly one active promotion always produces a
   non-NULL `promotion_id` on the resulting redirect_link today.
2. A Shared asset with 2+ active promotions has any UI path today that
   lets the user disambiguate, or whether it silently produces NULL (this
   would be a **live, current bug**, not historical data).

**Test matrix to build once the above is traced (execute as real
integration/manual tests, not more archaeology):**

| Asset | Promotion | Expected `redirect_links.promotion_id` |
|---|---|---|
| My Asset | None | `NULL` ✅ |
| My Asset | Somehow has one anyway | Per product rule (undecided) |
| Assigned Asset | None | `NULL` or per rule (undecided) |
| Assigned Asset | Has one | Per actual flow (undecided) |
| Shared Asset | Exactly 1 | Must be non-NULL |
| Shared Asset | 2+ | Must be non-NULL via explicit/deterministic selection |
| Campaign Element Asset | Has provenance | Should be traceable to a Promotion (undecided) |
| Any Asset | 0 promotions | Must stay `NULL` — never fabricate |
| Video, no asset | — | Not applicable — must never be assigned a fake promotion |

**Explicitly out of scope until the above test matrix is run:**
- No further historical `promotion_id` UPDATEs of any kind.
- No rollback of the 35-row diagnostic backfill (keep it for now,
  deliberately).
- No RLS changes beyond the one already applied and verified in Section A.
- No changes to `Track New Content`, `resolvePromotionContextForAsset.ts`,
  or `generateAssetRedirectLinks.ts` until the trace above is done and a
  concrete bug (or confirmed absence of one) is identified.
- Asset Scope (My/Shared/Assigned filter UI) and Recently Added sorting
  remain as already specified earlier in this document — not reopened by
  this addendum.

### D. Files read and confirmed this addendum (do not re-request unless code changes)
`AllAssetsAnalytics.tsx`, `listSharedAssetsForCollaborator.ts`,
`getAssetAnalyticsRows.ts`, `resolvePromotionContextForAsset.ts`,
`redirects.ts` (`lib/redirects.ts`), `buildAssetAnalyticsRows.ts`,
`generateAssetRedirectLinks.ts`.

### E. Files still needed for the next session (Section C's next step)
The UI caller of `resolvePromotionContextForAsset()` — almost certainly
`Videos.tsx`, possibly also `PromotedAssetPicker.tsx` — has never been
uploaded/read. This is required before Section C's trace can proceed.