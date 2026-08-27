# ASSET ANALYTICS — SOURCE OF TRUTH

Status: **Table Structure = LOCKED (columns/shell only) · Revenue Truth = NOT STARTED · Attribution Model = Type 1, Type 2 & Type 3 LOCKED (design confirmed, not yet implemented) · Filter Shell = LOCKED (state wired, not applied to data)**

## SOURCE OF TRUTH / ARCHITECTURE RULES (DO NOT RE-INVESTIGATE)

Read this section first in any future session.

### Canonical row grain
- One analytics row = one `(video_id, asset_id)` pair.
- Own-campaign rows (`asset_id IS NULL`) and asset-promotion rows (`asset_id IS NOT NULL`) are separate and must never be merged.
- Supported by `buildAssetAnalyticsRows.ts`, `assetAnalyticsEngine.ts` (`computeRelationships`), and `redirect_links` schema.

### Three asset types (LOCKED)
| Type | Source table(s) | Provenance | Archive derivation |
|------|-----------------|------------|--------------------|
| **Type 1 – Campaign Element** | `campaign_element_assets` | Own campaign (element's campaign) | Campaign-derived + personal |
| **Type 2 – Video Asset** | `videos.asset_id → assets.id` | Own campaign (video's campaign) | Video-derived + campaign-derived (Library-gated) + personal |
| **Type 3 – Resource** | `asset_resources` | Optional / lazy ("ONLY PROMOTE ASSET" system campaign via `ensureResourcePromotionCampaign`); never invent a real campaign relationship that does not exist | Personal only — never derive campaign/video archive |

### Attribution (all three types use the same mechanism)
- Clicks: `events.asset_id` + `event_type` ∈ `CLICK_EVENT_MAP` (filterable by `(video_id, asset_id)`).
- Revenue: `stripe_purchases` / pixel → `redirect_links` (token or id) → `link_type` → `mapLinkTypeToRevenueType()`.
- `redirect_links` already carries both `video_id` and `asset_id`.
- Resource assets are **not** click-only. `RESOURCE_TYPE_TO_LINK_TYPE` maps `resource_type` → `link_type` (consultation, landing_page, newsletter, sales_call, checkout; fallback `landing_page`). Same revenue path applies when the mapped type is revenue-bearing.

### Redirect creation (LOCKED)
- All asset-tagged paths (Resource / Campaign Element / Video Asset, Shared or My/Assigned) call `createRedirectLink(..., allowDuplicate = true, { assetId, promotionId, trackingDomainId })`.
- Unconditional `true` → asset-specific rows are always inserted; never reuse an existing non-asset redirect.
- Provenance campaign on the redirect is the **asset's** campaign, never the new video's selected campaign.

### Engine responsibilities
- `buildAssetAnalyticsRows()` → pure row identity `(video_id, asset_id)`.
- `assetAnalyticsEngine.computeAssetAnalytics(assetId)` → asset-level metrics + `relationships[]` keyed by `promotingSourceId = video_id`.
- `computeRelationships()` is the piece that already produces the exact `(asset_id, video_id)` metric shape needed.
- Organization scoping belongs in the fetch/orchestration layer (engines assume or defensively check one org).
- Do **not** put archive / viewer logic inside the pure metric engines.

### Archive architecture (LOCKED)
- Resolvers are **read-only, additive, viewer-scoped**.
- They never mutate `events`, `redirect_links`, `stripe_purchases`, or `pixel_purchases`. Historical attribution is preserved.
- `isArchived` / reasons come from the resolvers (`getAssetArchiveContext`, `getVideoArchiveContext`, `getCampaignArchiveContext`).
- `archive_ui_visibility` only answers Level 1 vs Level 2 (presentation). It is **not** the source of truth for `isArchived`.
- Filtering / visibility decisions belong in the orchestration or UI layer, never inside `buildAssetAnalyticsRows` or `assetAnalyticsEngine`.
- Reuse the same resolvers already used by AssetPicker / listAssetsForAssignmentPicker / etc.

### Organization boundary
- Hard data boundary. Callers must scope to one `organization_id` before feeding `buildAssetAnalyticsRows`. Engines may defensively re-check.

### Known limitation (accepted)
- Pixel conversion events do not carry `asset_id`; they rely on the session-id bridge. Cross-session stitching is a pre-existing, documented limitation of the whole pipeline (see `journeyAnalyticsEngine.ts`). It affects asset rows the same way it affects video rows.

## CONFIDENCE / EVIDENCE STATUS

| Decision | Status | Evidence |
|----------|--------|----------|
| Row grain = `(video_id, asset_id)` | LOCKED / CODE-CONFIRMED | `buildAssetAnalyticsRows.ts`, `AssetRelationshipRow`, `redirect_links` schema |
| Own-campaign vs asset-promotion split | LOCKED / CODE-CONFIRMED | `buildAssetAnalyticsRows` splits on `asset_id IS NULL` |
| Type 1 / Type 2 attribution mechanism | LOCKED / CODE-CONFIRMED | `campaignElementAnalyticsEngine` + `assetAnalyticsEngine` + real queries |
| Type 3 uses same redirect + attribution path | LOCKED / CODE-CONFIRMED | `generateAssetRedirectLinks.ts` + `RESOURCE_TYPE_TO_LINK_TYPE` + `createRedirectLink` |
| Resource not inherently click-only | LOCKED / CODE-CONFIRMED | Mapping includes consultation / checkout etc. |
| `allowDuplicate = true` unconditional on asset paths | LOCKED / CODE-CONFIRMED | Literal `true` in every `createRedirectLink` call inside `generateAssetRedirectLinks.ts` |
| Archive resolvers read-only / additive | LOCKED / CODE-CONFIRMED | All three resolvers + design docs |
| Archive filtering outside metric engines | LOCKED / ARCHITECTURAL DECISION | Precedent in pickers + resolver contracts |
| Organization scoping at orchestration layer | LOCKED / ARCHITECTURAL DECISION | Engine preconditions + defensive checks |
| Batch join of rows × relationships | OPEN / IMPLEMENTATION GAP | Pieces exist; glue function does not |
| Live Resource revenue / event volume | OPEN / NEEDS LIVE DATA | Code path confirmed; sample still small |
| Re-save / double-invocation of generateAssetRedirectLinks | OPEN / LOW RISK | Unconditional insert; idempotency not enforced in this file (flag only) |
| InDepthAnalytics archive wiring | OPEN / IMPLEMENTATION GAP | Pattern locked; zero wiring today |

## FUTURE ANALYTICS REUSE — INVESTIGATE ONCE, REUSE EVERYWHERE

Do **not** re-open the forensic investigation for:
- AllAssetsAnalytics
- AssetAnalytics (single)
- Top Assets
- InDepthAnalytics (archive side)
- any future chart that needs asset-level or (video, asset) metrics

| Concern | Reuse |
|---------|-------|
| Row identity | `buildAssetAnalyticsRows()` |
| Per-(asset, video) metrics | `assetAnalyticsEngine.computeAssetAnalytics().relationships` via `computeRelationships()` |
| Batch orchestration | New thin glue (see next implementation) — do **not** invent a second engine |
| Archive state | `getAssetArchiveContext(s)ForViewer`, `getVideoArchiveContext(s)ForViewer`, `getCampaignArchiveContext` |
| UI Level 1/2 | Existing `archive_ui_visibility` pattern already used by pickers |
| Organization | Fetch/orchestration layer only |
| Column set / labels | Reuse `analyticsEngine.ts` `TABLE_COLUMNS` / `COLUMN_LABELS` (already done in shell) |

Principle: **raw attribution → row identity → metrics → archive context → UI visibility decision**.

This doc is the working companion to `AllAssetsAnalytics.tsx`. Per the working agreement: we're building the chart first and letting real numbers surface the architecture questions, rather than resolving all 28 forensic-report sections up front. §2 (Type 1 & Type 2 attribution) and the row-grain in §1 are now **confirmed from the actual implementation and real query results** — everything under §4 "Reminders" is still a verbatim carry-forward from the original session brief and **has not been investigated or decided.** This doc's job is to make sure none of it gets lost while we move fast on the UI shell.

---

## 1. What's actually built right now

`AllAssetsAnalytics.tsx` — table shell + filter shell. No Supabase queries, no revenue computation. Specifically:

- **Row grain — CONFIRMED**: one row = one **`(video_id, asset_id)`** pair, not one asset and not one video. "Video A promotes Asset A / Asset B / Asset C" → 3 independent rows: `(Video A, Asset A)`, `(Video A, Asset B)`, `(Video A, Asset C)`. If a different video later also promotes Asset B — `(Video C, Asset B)` — that is its own row; clicks/revenue must never be merged across the two videos promoting the same asset. `redirect_links` already carries both `video_id` and `asset_id` on the same row, so this is a real, queryable field today — not a new schema requirement.
- **TWO identity columns, not one**: `Asset` (sticky leftmost — thumbnail/title) and `Content` (its own column — the promoting video's thumbnail/title/platform). Revised from the first pass, which put the video on a sub-line under the asset; you asked for it as its own column, matching how InDepthAnalytics gives the video full identity-cell treatment.
- **Asset Type badge column**: `campaign_element | promotional_video | resource | content_video` — visual only, not yet checked against the real `assets.asset_type` enum (see §4 "Reminders").
- **Asset Clicks column**: present, always renders `—`. Deliberately not fabricated from other columns. For Type 1/2 this is just the click metrics confirmed in §2. For Type 3 it's still unresolved — see §3.
- **14 metric columns**: imported directly from `analyticsEngine.ts`'s `TABLE_COLUMNS` / `COLUMN_LABELS` — **not redeclared**. This is a hard guarantee that this table can never silently drift from InDepthAnalytics' column set. All cells currently render `0` because `metrics` is stub data.
- **Data source**: `useAssetAnalyticsRows()` returns `{ rows: [], loading: false }` unconditionally. It's a named stub with a `TODO(wiring phase)` comment listing the 4 steps the real version needs (redirect_links grouping → asset identity resolution → per-pair metric computation).
- **Filters — now built as a real shell, state wired, not yet applied to data** (mirrors InDepthAnalytics' sidebar/header exactly):
  - Sidebar: Date Range (7/30/60/180/365 days, lifetime, custom), Campaign dropdown, **Promotion dropdown (new — not in InDepthAnalytics)**.
  - Header: source toggle (total/pixel/stripe), Columns dropdown (toggles `visibleColumns`), row count.
  - Second header row: platform pills (All + one per platform present in the data), sort shortcuts (Revenue / Consultations / Purchases / Calls / Opt-ins).
  - Still reserved, not built: All/My/Shared/Assigned scope tabs + the four asset-type filter pills — scope rules unconfirmed against real data.
  - `Campaign` and `PromotionOption` come from new stub hooks (`useCampaignOptions()`, `usePromotionOptions()`) that currently return `[]` — same "structure now, data later" pattern as the rows hook.
  - **Promotions dropdown ownership boundary is itself unresolved** — see §4 "Ownership" below; don't scope its future query by `organization_id` alone without checking the Top Promotions concern first.

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

## 5. Deferred / explicitly not in this pass

- Any Supabase query or join — `useAssetAnalyticsRows()`, `useCampaignOptions()`, `usePromotionOptions()` are all stubs returning `[]`.
- Filters *apply* to data (state exists and is wired to controls; nothing filters `rows` yet because `rows` is always empty).
- All/My/Shared/Assigned scope tabs + per-asset-type filter pills.
- Implementing §2e's aggregation fix (`video_id` added to `campaignElementAnalyticsEngine.ts`'s row types + composite-key accumulator) — design confirmed, code not touched.
- Asset Clicks computation for Type 3 — still open, see §3.
- Per-pair (video, asset) revenue computation — mechanism confirmed (§2), implementation not started.
- Promotions-dropdown ownership boundary (which promotions populate the list for the current account owner).

## 6. Next step (when you're ready)

Per your plan: wire real rows into the table one asset type at a time, compare the numbers against InDepthAnalytics / Dashboard, and let discrepancies point at which Open Question above needs answering first. This doc gets updated in place as each one gets resolved — sections move from "Open Questions" into a "Locked" section the way `ARCHIVE_SYSTEM_DESIGN.md` does per-entity.

---

## LAST CONVERSATION SUMMARY / CONTINUATION PROMPT

CURRENT STATE:
- `AllAssetsAnalytics.tsx` — table shell + filter shell built, including real Asset Type filter pills (state + AND-combined with platform filter). Columns locked: Asset identity, **Content identity (own column — the promoting video)**, Asset Type badge, Asset Clicks placeholder, 14 engine metric columns reused from `analyticsEngine.ts`. Row grain **CONFIRMED** as `(video_id, asset_id)` pair — not `(asset, promoting video)` loosely, the exact FK pair.
- Filters built as real state, wired to controls, not yet applied to data: Date Range, Campaign, Promotion, source toggle, Columns toggle, platform pills, asset-type pills, sort shortcuts. Scope tabs (All/My/Shared/Assigned) still reserved/not built — ownership chain unconfirmed.
- No data wired — `useAssetAnalyticsRows()`, `useCampaignOptions()`, `usePromotionOptions()` are all stubs returning `[]`.
- This doc created as the running spec/reminder file, parallel role to `ARCHIVE_SYSTEM_DESIGN.md`.
- **Attribution mechanism for Type 1 (Campaign Element) and Type 2 (Video Library Asset) is now CONFIRMED (§2)**, from tracing `campaignElementAnalyticsEngine.ts` plus real query results against `events`/`redirect_links`: clicks via `events.asset_id` + `event_type` (`CLICK_EVENT_MAP`), revenue via `stripe_purchases` → `redirect_links` → `link_type` (`mapLinkTypeToRevenueType()`), both filterable by the `(video_id, asset_id)` pair since `redirect_links` and `events` both carry both columns. Same mechanism for both types — not two engines. One real code gap remains: `campaignElementAnalyticsEngine.ts`'s row types need `video_id` added and the accumulator needs to key on the composite pair (§2e) — not yet implemented.
- **Type 3 (Resource Asset) is now LOCKED at code level (§3)**: `generateAssetRedirectLinks.ts` + `createAssetResource.ts` confirm resource redirects use the identical `createRedirectLink(..., allowDuplicate=true, {assetId,...})` path as Type 1/2, with `RESOURCE_TYPE_TO_LINK_TYPE` mapping resource_type → link_type (fallback `landing_page`). Resource assets are not click-only — revenue applies when the mapped link_type is revenue-bearing. A broader live-data sample of Resource events/purchases is still recommended but no longer blocking.

NEXT:
1. Implement §2e (the `video_id` + composite-key fix) in `campaignElementAnalyticsEngine.ts` — the design is confirmed, this is the next concrete coding step for Type 1/2.
2. Get a broader Type 3 sample (or read `tracker.ts` / `redirects.ts`, the click/redirect creation code path) to confirm or reject whether resource-asset clicks are really just `event_type = 'landing_page'` generically, before locking §3.
3. Build the real `useAssetAnalyticsRows()` fetch — Type 1/2 first (mechanism confirmed), Type 3 once §3 locks.
4. Compare resulting numbers against InDepthAnalytics for the same underlying videos — first real signal on whether double-counting is happening.
5. Resolve the Promotions-dropdown ownership boundary before wiring `usePromotionOptions()` for real.
6. Update this doc's §4 as each open question gets touched, moving resolved items up into §2/§3-style "Locked" sections.

---

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