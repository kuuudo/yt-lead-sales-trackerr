# Potential risk — Asset Clicks grain (Promotion vs AllAssets)

**Status:** MVP accepted decision (2026-09-26)  
**Scope:** Documentation only for future reconciliation. Does not change runtime formulas beyond the current Promotion-bag implementation.

---

## Current Promotion Asset Clicks definition

**Location:** `services/analytics/buildPromotionMetricRows.ts` → `countAssetClicksFromEvents`

Within a single **Promotion fact bag** (events already partitioned by resolved `promotion_id`):

1. Event must have non-null `asset_id`
2. `event_type` must be one of the raw types in `CLICK_EVENT_MAP` from `analyticsEngine.ts`:
   - `landing_page`
   - `lead_magnet`
   - `newsletter` / `newsletter_click`
   - `sales_call`
   - `consultation` / `consultation_booking`
3. Deduplicate by **`event.id`** within the bag
4. Count = number of distinct matching event ids

**Explicitly not:** sum of AllAssets table/display rows for that promotion.

Per-asset breakdown (MVP) uses **the same rules**, grouped by `asset_id`. Therefore:

```text
sum(per-asset clicks for promotion P) === PromotionMetricRow.asset_clicks for P
```

Zero-activity assets (on `promotion_assets` but no matching events) appear with **0** clicks.

---

## Current AllAssets Asset Clicks grain

**Location:** AllAssets UI `row.asset_clicks` ← `getAssetAnalyticsRows` → `r.metrics.clicks` (`AssetMetrics` / `computeAssetMetrics` path)

**Grain:** one row = one **(promoting video × asset) pair**

Design (`ASSET_ANALYTICS_DESIGN`): clicks from `events` with `asset_id` and `event_type` via `CLICK_EVENT_MAP`, typically scoped to that pair’s `(video_id, asset_id)`.

This is a **parallel** formula set to the 14-column `processVideoMetrics` funnel (not the same as Landing Page Clicks column alone).

---

## Why the two grains can produce different numbers

| Dimension | AllAssets | Promotion (current) |
|-----------|-----------|---------------------|
| Unit of analysis | `(video_id, asset_id)` pair | Entire promotion fact bag |
| Video scope | Clicks tied to that promoting video | All videos’ events attributed to the promotion |
| Aggregation | User may mentally sum pair rows | Single bag count / per-asset within bag |
| Row multiplicity | Same logical traffic can appear on multiple pair rows if product lists multiple relationships | One event id counted once in the bag |

Example: Asset A promoted by Video 1 and Video 2 under Promotion P.

- AllAssets may show two rows (V1×A, V2×A) each with pair-scoped clicks.
- Promotion shows one `asset_clicks` total (and one per-asset line for A) over **all** bag events for A under P.

Summing AllAssets pair `asset_clicks` for P is **not** defined to equal Promotion `asset_clicks`.

---

## Why MVP intentionally uses Promotion-bag events grouped by `asset_id`

1. Matches existing Promotion analytics architecture (facts → resolve `promotion_id` → bag → metrics).
2. Avoids double-counting from summing AllAssets display rows.
3. Per-asset breakdown is a partition of the same event set → additive identity with the Promotion total.
4. Reuses `CLICK_EVENT_MAP` and event-id dedupe without changing `processVideoMetrics` or AllAssets.

---

## What could cause divergence in a more sophisticated future implementation

- Counting clicks with **session-level** uniqueness instead of (or in addition to) `event.id`
- Requiring **both** `video_id` and `asset_id` (pair grain) inside Promotion totals
- Different **source modes** (Total / Pixel / Stripe) applying different event filters for Asset Clicks vs funnel metrics
- Attribution changes so the same raw event lands in a different promotion bag than the pair path
- Including or excluding events with null `promotion_id` resolved only via redirect-link fallback differently per surface

---

## Later: strict (video × asset) reconciliation

If product requires “Promotion Asset Clicks ≡ sum of AllAssets pair Asset Clicks for that promotion”:

1. Document and lock AllAssets `computeAssetMetrics` / `metrics.clicks` source code as the single definition.
2. Either:
   - Recompute Promotion totals at pair grain then roll up by promotion with explicit dedupe keys, or
   - Change AllAssets display grain / rollup rules so sums are comparable.
3. Add verification tests: same org, date range, source mode → pair rollup vs bag count.
4. Revisit this file and the MVP additive guarantee (it may no longer hold if pair scoping drops events that bag still counts).

Until then, **Promotion Asset Clicks and AllAssets Asset Clicks are related but not guaranteed equal.**

---

## Related files (runtime)

- `services/analytics/buildPromotionMetricRows.ts` — totals + per-asset counts
- `pages/analytics-lego/resolvePromotionAssets.ts` — asset identity (membership)
- `pages/AllPromotionsAnalytics.tsx` — display
- `lib/analyticsEngine.ts` — `CLICK_EVENT_MAP`
- AllAssets / `getAssetAnalyticsRows` — pair-grain `metrics.clicks` (unchanged by MVP)
