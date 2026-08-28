# ASSET ANALYTICS — SOURCE OF TRUTH

Status: **Table Structure = LOCKED · Attribution (Type 1/2/3) = LOCKED · Row grain = LOCKED · Archive architecture = LOCKED · Organization boundary = LOCKED · Orchestration = IMPLEMENTED + REAL-DATA VERIFIED · AllAssetsAnalytics = CONNECTED TO REAL DATA · Filter options (Campaign/Promotion lists) = STILL STUB · Revenue Truth / double-counting model = NOT STARTED · UI identity enrichment quality = OPEN (P1)**

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
3. Asset thumbnail / title correctness  
4. Content (video) thumbnail / title / platform  
5. Identity maps use correct `asset_id` and `video_id`  
6. Asset type badge vs `assets.asset_type`  

For each P1: Question = does UI show the same title/thumb as Assets/Videos for that id? Inspect = enrichment in `AllAssetsAnalytics` + `listAssetsByOrganization` patterns. PASS = match. FAIL = wrong id or bad embed. Code changes allowed only in UI adapter, not engines.

### P2
7. Campaign / Promotion filter data + ownership boundary  
8. Archive Level 1/2 visibility in this table  
9. Richer funnel columns vs 5-field AssetMetrics (product decision)  

### P3
10. Scale / batching if asset count grows  
11. Revenue-truth / cross-surface double-counting model  

---

## ASSET ANALYTICS CHECKPOINT — 2026-08-28

- Forensic investigation **complete**; architecture **LOCKED** in this doc  
- Orchestration **implemented** (`getAssetAnalyticsRows.ts`)  
- Real-data verification **PASS**  
- AllAssetsAnalytics **connected** to real Supabase data  
- Unmatched identities **expected** (no activity in range) — keep with zeros  
- Known issues are primarily **display/identity enrichment quality**, not confirmed attribution bugs  
- Engines **frozen** unless evidence shows a bug  
- **Next phase:** P0/P1 UI and metric spot-checks — not architecture redesign  