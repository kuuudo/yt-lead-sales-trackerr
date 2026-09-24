                CAMPAIGN A
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
       Content    Own Asset  Marketer
       Analytics  Analytics  Analytics
                              │
                         ← CLICK →
                              │
                              ▼
                         ┌─────────┐
                         │ Marketer│
                         │    A    │
                         └────┬────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              Promotion A         Promotion B
         ┌─────────┴─────────┐
        ▼                    ▼
        ASEET A             ASEET B 

                                 CAMPAIGN
                            │
             ┌──────────────┼──────────────┐
             │              │              │
             ▼              ▼              ▼
         CONTENT       OWN ASSETS       MARKETERS
                                             │
                          ┌──────────────────┼───────────────┐
                          │                  │               │
                          ▼                  ▼               ▼
                      MARKETER A        MARKETER B      MARKETER C
                          │                  │               │
                     ┌────┴────┐        ┌────┴────┐         │
                     ▼         ▼        ▼         ▼         ▼
                   PROMO A   PROMO B  PROMO C   PROMO D   PROMO E
                     │         │        │         │         │
                     ▼         ▼        ▼         ▼         ▼
                   ASSETS    ASSETS   ASSETS    ASSETS    ASSETS
# ANALYTICS_DRILLDOWN_ARCHITECTURE.md

Internal developer map for the **unified Analytics drill-down prototype** (UI / interaction phase).

Status of this doc: living. Update when files are added, removed, or change role.

---

## Canonical interaction (LOCKED for this phase)
REAL ANALYTICS TABLE
│
│ hover  →  highlight ONLY the interactive identity item
│           (no row chrome, no grow, no navigation)
▼
│ click  →  select + middle-stage
▼
│ grow   →  next level LEFT → RIGHT
▼
│ click analytics destination
▼
REAL ANALYTICS TABLE
textHierarchy:
CAMPAIGN ANALYTICS TABLE
│ click Campaign
▼
CAMPAIGN MIDDLE STAGE (L→R)
├── Content Analytics      → real Content / InDepthAnalytics
├── Own Asset Analytics    → real Asset Analytics (own scope)
└── Marketer Analytics     → real Marketer Analytics table
│ click Marketer
▼
PROMOTION MIDDLE STAGE (L→R)
│
▼
PROMOTION ANALYTICS TABLE
│ click Promotion
▼
ASSET MIDDLE STAGE (L→R)
│
▼
ASSET ANALYTICS (AllAssetsAnalytics foundation)
text**Strict rules**

- Hover ≠ expand. Hover ≠ dim siblings. Hover ≠ navigate.
- Click = only action that opens middle-stage / grow.
- Growth direction: **LEFT → RIGHT**.
- No IndividualCampaign / IndividualMarketer / IndividualPromotion product pages.
- Mock data only this phase. No analytics engine / Supabase redesign.

---

## File relationship diagram
App.tsx
└── DrillDownProvider (lib/DrillDownContext.tsx)
│
├── pages/AllCampaignAnalytics.tsx
│         └── AnalyticsDrillDownTable
│         └── GrowBranch (middle stage: Content / Own Assets / Marketers)
│
├── pages/MarketerAnalytics.tsx
│         └── AnalyticsDrillDownTable
│         └── GrowBranch (promotions) → enter Promotion Analytics
│
├── pages/AllPromotionsAnalytics.tsx
│         └── AnalyticsDrillDownTable
│         └── GrowBranch (assets) → enter Asset Analytics
│
├── pages/AllAssetsAnalytics.tsx     ← EXISTING FOUNDATION (destination)
├── pages/InDepthAnalytics.tsx       ← EXISTING FOUNDATION (Content destination)
│
├── components/analytics/LockedFilterBadge.tsx
├── components/analytics/AnalyticsBreadcrumb.tsx  (if still present)
└── lib/mockAnalyticsData.ts
Supporting:
components/analytics/AnalyticsDrillDownTable.tsx
components/analytics/GrowBranch.tsx
textLegacy / optional paths (may exist from earlier passes):
pages/CampaignAnalytics.tsx      → campaign overview cards (superseded by in-table middle stage)
pages/AssetAnalyticsMock.tsx     → temporary asset destination (prefer AllAssetsAnalytics)
text---

## File inventory

### CORE / KEEP (long-term interaction system)

#### `lib/DrillDownContext.tsx`

- **Purpose:** Holds drill-down path, locked filter dimensions (campaign / marketer / promotion), expanded row id, breadcrumb path, and navigation into real analytics destinations.
- **Status:** CORE / KEEP
- **Depends on it:** AllCampaignAnalytics, MarketerAnalytics, AllPromotionsAnalytics, LockedFilterBadge consumers, App (provider).
- **Should NOT contain:** Metric math, Supabase queries, table column definitions, visual styling of nodes.
- **Future:** May gain URL sync; keep pure state + navigate.

#### `components/analytics/AnalyticsDrillDownTable.tsx`

- **Purpose:** Reusable ranking table: sort, identity-item hover, click-to-expand, optional L→R expand panel under selected row.
- **Status:** CORE / KEEP (UI interaction primitive)
- **Depends on it:** Campaign / Marketer / Promotion analytics pages.
- **Should NOT contain:** Domain-specific business rules, data fetching, locked-filter policy.
- **Future:** Polish motion; keep hover = item-only.

#### `components/analytics/GrowBranch.tsx`

- **Purpose:** Presentational L→R nodes + connectors for middle-stage branches.
- **Status:** CORE / KEEP (UI-only)
- **Depends on it:** Expand panels on Campaign / Marketer / Promotion pages.
- **Should NOT contain:** Navigation logic, filter state, data loading.
- **Future:** Optional connector/animation polish only.

#### `components/analytics/LockedFilterBadge.tsx`

- **Purpose:** Visual locked filter chip (campaign / marketer / promotion context).
- **Status:** CORE / KEEP (UI-only)
- **Depends on it:** MarketerAnalytics, AllPromotionsAnalytics (and later Asset when context-wired).
- **Should NOT contain:** Unlock logic that mutates engines; purely display + later clear affordance if needed.

---

### EXISTING FOUNDATION / KEEP

#### `pages/AllAssetsAnalytics.tsx`

- **Purpose:** Production Asset Analytics UI (Asset × Promoting Content, filters, columns). Deepest table destination.
- **Status:** EXISTING FOUNDATION / KEEP
- **Depends on it:** Product Asset Analytics route; drill-down eventual destination for Own Assets + Promotion-scoped assets.
- **Should NOT:** Be replaced by AssetAnalyticsMock long-term.
- **Future:** Accept DrillDownContext locks (campaign / marketer / promotion / own scope) without rewriting engines this phase.

#### `pages/InDepthAnalytics.tsx`

- **Purpose:** Content Analytics destination.
- **Status:** EXISTING FOUNDATION / KEEP
- **Future:** Optional locked Campaign banner from DrillDownContext; no engine rewrite this phase.

#### `App.tsx` (modified)

- **Purpose:** App shell + routes.
- **Change for this work:** Wrap tree with `DrillDownProvider` **inside** `Router` (uses `useNavigate`).
- **Status:** CONFIGURATION / KEEP modification
- **Should NOT:** Host drill-down business logic beyond provider placement.

---

### UI ONLY / PROTOTYPE PAGES (keep concept; data is mock)

#### `pages/AllCampaignAnalytics.tsx`

- **Purpose:** Real Campaign ranking table + click → campaign middle stage (3 branches L→R).
- **Status:** UI ONLY (structure keep; data MOCK until real campaign ranking exists)
- **Depends on:** DrillDownContext, AnalyticsDrillDownTable, GrowBranch, mockAnalyticsData
- **Should NOT contain:** Real revenue engine, IndividualCampaign page.

#### `pages/MarketerAnalytics.tsx`

- **Purpose:** Real Marketer ranking table + click → promotion middle stage → enter Promotion Analytics.
- **Status:** UI ONLY / MOCK data (page role long-term)
- **Depends on:** DrillDownContext, table, GrowBranch, mock data, LockedFilterBadge

#### `pages/AllPromotionsAnalytics.tsx`

- **Purpose:** Real Promotion ranking table + click → asset middle stage → enter Asset Analytics.
- **Status:** UI ONLY / MOCK data (page role long-term)
- **Depends on:** Same pattern as Marketer

---

### MOCK / REPLACE LATER

#### `lib/mockAnalyticsData.ts`

- **Purpose:** Fake campaigns, marketers, promotions, assets, content + helpers for scoped lists.
- **Status:** MOCK / REPLACE LATER
- **Depends on it:** All prototype ranking pages and grow panels.
- **Should NOT contain:** Production queries.
- **Future:** Real org-scoped fetches + engines; keep helper shapes only if useful.

---

### TEMPORARY / MAY REPLACE OR DELETE

#### `pages/AssetAnalyticsMock.tsx` (if present)

- **Purpose:** Temporary Asset destination for locked-context demo.
- **Status:** TEMPORARY / MOCK
- **Long-term:** Use `AllAssetsAnalytics.tsx` only.
- **Action:** Prefer routing `/assets/analytics` → AllAssetsAnalytics; delete mock when context is wired.

#### `pages/CampaignAnalytics.tsx` (if still the old 3-card overview)

- **Purpose:** Earlier middle-stage-as-page experiment.
- **Status:** TEMPORARY / SUPERSEDED by in-table middle stage on AllCampaignAnalytics
- **Action:** Route `/campaigns/:id/analytics` can redirect to campaign table expand or stay for deep links; do not treat as primary UX.

#### `components/analytics/AnalyticsBreadcrumb.tsx` (if present)

- **Purpose:** Breadcrumb UI; some pages inline breadcrumb from context instead.
- **Status:** UI ONLY — KEEP if still imported; otherwise fold into shared header later
- **Review:** Deduplicate with per-page breadcrumb if both exist.

---

### REFERENCE ONLY (do not modify for this work)

#### `ASSET_ANALYTICS_DESIGN_6` / design markdown

- **Purpose:** Reference for Asset Analytics visual language, columns, filters, product feel.
- **Status:** REFERENCE ONLY
- **Do NOT:** Treat as mandate to rebuild Asset Analytics or engines in this phase.

---

## Summary tables

### CREATED (this prototype)

| File | Role |
|------|------|
| `lib/DrillDownContext.tsx` | CORE |
| `lib/mockAnalyticsData.ts` | MOCK |
| `components/analytics/AnalyticsDrillDownTable.tsx` | CORE UI |
| `components/analytics/GrowBranch.tsx` | CORE UI |
| `components/analytics/LockedFilterBadge.tsx` | CORE UI |
| `components/analytics/AnalyticsBreadcrumb.tsx` | UI (if created) |
| `pages/AllCampaignAnalytics.tsx` | rewritten as table+grow |
| `pages/MarketerAnalytics.tsx` | rewritten as table+grow |
| `pages/AllPromotionsAnalytics.tsx` | rewritten as table+grow |
| `pages/AssetAnalyticsMock.tsx` | TEMPORARY (if any) |
| `ANALYTICS_DRILLDOWN_ARCHITECTURE.md` | this doc |

### MODIFIED

| File | Change |
|------|--------|
| `App.tsx` | `DrillDownProvider` inside `Router` |
| Ranking pages above | Interaction model iterations |

### TEMPORARY / MAY DELETE

- `AssetAnalyticsMock.tsx`
- Old card-only `CampaignAnalytics` overview if fully superseded
- Duplicate breadcrumb implementations

### LONG-TERM KEEP

- `DrillDownContext` (or successor context)
- `AnalyticsDrillDownTable` + `GrowBranch` + `LockedFilterBadge`
- `AllAssetsAnalytics.tsx` / `InDepthAnalytics.tsx`
- App provider placement
- Ranking page **roles** (Campaign / Marketer / Promotion) with real data later

### FILES THAT SHOULD NOT EXIST LONG-TERM AS PRODUCT

- Individual* Analytics pages (never created as product)
- Mock-only asset destination once AllAssetsAnalytics accepts context

---

## Out of scope (this phase)

- Real analytics engines / attribution
- Supabase schema / RLS
- Replacing AllAssetsAnalytics foundation
- Mini chart images under branches
- Perfect animation polish

---

## Verify checklist

- [ ] Hover campaign/marketer/promotion **name** → only that item highlights
- [ ] Hover does not grow branches or dim other rows
- [ ] Click → middle stage grows **left → right**
- [ ] Branch enters real destination table
- [ ] Locked filters show when context set
- [ ] AllAssetsAnalytics remains the asset foundation

Step 4 — Concise summary





























CategoryFilesCREATEDDrillDownContext, mockAnalyticsData, AnalyticsDrillDownTable, GrowBranch, LockedFilterBadge, ranking page rewrites, this architecture docMODIFIEDApp.tsx (provider)TEMPORARYAssetAnalyticsMock (if present), old card-only Campaign overviewLONG-TERMDrill-down context + table/grow primitives, AllAssetsAnalytics, InDepthAnalytics, ranking page rolesREPLACE LATERmockAnalyticsData → real data