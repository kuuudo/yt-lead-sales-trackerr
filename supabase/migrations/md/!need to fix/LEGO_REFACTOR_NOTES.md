# LEGO_REFACTOR_NOTES.md

Running log of things noticed while extracting LEGO pieces out of
`AllAssetsAnalytics.tsx`. Nothing here gets fixed as part of the refactor
unless it literally blocks the extraction in progress. Behavior stays
frozen; this file is where "huh, that's odd" goes instead of into a
code change.

---

## 2026-09-24 — Type/shape mismatch in `analytics-lego/assetAnalyticsTypes.ts`

**File:** `pages/analytics-lego/assetAnalyticsTypes.ts`
**Approximate location:** `AssetIdentity` interface

**What I noticed:** `AssetIdentity` has no `element_type` field, but
`AllAssetsAnalytics.tsx` (~line 731, inside `useAssetAnalyticsRows`'s row
mapper) sets `element_type: (a as any)?.element_type ?? null` and casts the
whole object with `as AssetAnalyticsRow['asset'] & { element_type?: string
| null }` to get it past the compiler.

**Why it may matter:** the type file doesn't actually describe the runtime
row shape for this field; the `as any` silently defeats type-checking on
`a?.element_type` specifically (whatever `a`'s real inferred type is).
Anyone typing against `AssetIdentity` later (e.g. a new
Promotion/MarketerAnalytics consumer) won't see `element_type` exists.

**Blocks current extraction:** No.

---

## 2026-09-24 — Type/shape mismatch in `PromotingVideoIdentity`

**File:** `pages/analytics-lego/assetAnalyticsTypes.ts`
**Approximate location:** `PromotingVideoIdentity` interface

**What I noticed:** the interface is missing four fields that
`AllAssetsAnalytics.tsx`'s row mapper actually populates on
`promoting_video` (~lines 738–753): `content_owner_marketer_name`,
`created_via_creative`, `creative_promotion_id`, `creative_promotion_title`.

**Why it may matter:** same class of issue as above — the declared type
undercounts the real row shape. No `as any` here (object literal just has
excess properties TS allows structurally), but any code that types a
variable as `PromotingVideoIdentity` explicitly won't get autocomplete/
type-checking on these four fields.

**Blocks current extraction:** No.

---

## 2026-09-24 — Phase 2: `sortAssetAnalyticsRows` extraction

**Extracted into:** `pages/analytics-lego/assetAnalyticsColumns.tsx`
**Call site:** `AllAssetsAnalytics.tsx` `sortedRows` useMemo

**Intentional quirk preserved (do not "fix"):**
- Sort key `asset_created_at` (the "Recently Added" shortcut) sorts by
  `promoting_video.created_at` (content date), **not** `asset.created_at`.
- Column headers use different keys: `asset_created_at_col` /
  `content_created_at_col`. Original comments say this is deliberate.

**Related pre-existing naming split (not fixed):**
- `NEW_DATE_COLUMNS` declares keys `asset_created_at` and
  `content_created_at`, while column header `handleSort` / sort branches
  use `asset_created_at_col` / `content_created_at_col`. Visibility
  toggles and sort keys may not line up 1:1 — left as-is (behavior frozen).

**Blocks current extraction:** No.

---
