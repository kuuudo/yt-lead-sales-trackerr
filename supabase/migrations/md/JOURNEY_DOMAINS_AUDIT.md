# Journey Domain / Relay Continuity — Technical Understanding & Audit Plan

**Status:** Audit / plan only. No code applied by this document.  
**Date:** 2026-09-27 (updated 2026-09-28)  
**Working rules (locked for planning):**

- Column name: **`journey_domains`** (not merely a cache of `tracking_hostname`)
- Max **2 distinct tracking hostnames per structural journey branch / path context**
- Budget is **domain count**, not asset count
- Branches / path contexts are **independent** (do not pool Video P’s A/B/C; do **not** flatten fan-in to a global union at a node)
- Structural graph from **`redirect_links`**, **not** `events_journey`
- Path B candidates ∩ journey budget; “two options” ≠ “two domains used”
- **No** `cant_switch_around` column
- Write `journey_domains` on **newly created edges**; no full-chain backfill
- **`tracking_hostname` NULL ⇒ treat as `vstrk.com`** (counts as a real domain)
- First Touch already shipped; Relay consumption is **later**

---

## 0. Decisions locked on 2026-09-28 (product clarification)

### 0.1 Why `journey_domains` is required (not optional denormalization)

| Field | Meaning |
|-------|---------|
| **`tracking_hostname`** | This **specific redirect edge** was generated on which hostname (or NULL → VSTRK). |
| **`journey_domains`** | **Declared / committed domain context for this edge’s branch**: which tracking domains this structural path is allowed to continue through (priority list for Relay). |
| **Path B** | Which domains the user is **allowed to choose** when creating a **new** edge for this Promotion×Asset. |

`journey_domains` is **not** “just a cache of tracking_hostname”.

It is the **journey-level declaration** the user (or system) commits when creating the edge, so later Relay can trust path context even when the graph has fan-in.

Example:

```
A → C → D → F → G
    journey_domains = [lucy.com]     (edge A→C and/or edges on that path context)

B → C → D → F → G
    journey_domains = [peter.com]    (edge B→C and/or edges on that path context)
```

Same node C appears in two path contexts. Collapsing C to `{lucy, peter}` **loses** which visitor path applies.

### 0.2 Fan-in is NOT “union at the node” for eligibility / Relay

Graph:

```
A ──→ C
B ──→ C
```

- A→C edge may be `lucy.com` with `journey_domains = [lucy.com]`
- B→C edge may be `peter.com` with `journey_domains = [peter.com]`

**Two different questions:**

1. **Graph:** What can reach C? → A and B (fan-in). Useful for maps / “Continue upstream”.
2. **Journey / click context:** Which branch is **this** visitor on? → determined by the **clicked token / redirect_link**, then that edge’s `journey_domains` (and `tracking_hostname`).

Click `lucy.com/<token>` → Lucy path context only.  
Click `peter.com/<token>` → Peter path context only.

**Do not lock** VideoDetail / Relay eligibility as:

```
C.upstream_domains = union(all incoming) = {lucy, peter}
```

Union may still be shown as a **graph-level summary** in UI (“multiple upstream branches”), but **budget and Relay priority follow path/edge context**, not the flattened union.

Hostname alone is **not** full journey identity (two unrelated journeys can both use `lucy.com`). Conceptual chain:

```
token
  → redirect_link (edge)
  → path / branch context
  → journey_domains
  → applicable hostname(s) for Relay probe order
```

### 0.3 `tracking_hostname` NULL = VSTRK

Established product semantics:

```
tracking_hostname IS NULL  ⇒  vstrk.com
```

For all journey-domain **counts and displays**, normalize NULL → `vstrk.com` before computing set size.

Example:

```
A → B  tracking_hostname NULL     → vstrk.com
B → C  tracking_hostname lucy.com → lucy.com
⇒ branch domains = {vstrk.com, lucy.com}  → 2/2
```

Not “1 known + 1 unknown”.

### 0.4 Wording

Prefer:

> User chooses which **tracking domain this new structural edge** uses within the branch; then **`journey_domains` records the resulting branch domain context**.

Avoid implying the user edits an entire historical “user journey” object in the DB.

### 0.5 Videos.tsx intended UX (video-turn only)

```
Select video-turn asset
  → structural downstream discovery (redirect_links, not events_journey)
  → per branch / path: show committed domains (from edges’ journey_domains / normalized hostnames)
  → modal: choose domain for THIS new edge (Path B ∩ budget)
  → max 2 distinct on that branch after choice
  → create redirect_link
  → persist tracking_hostname + journey_domains on the NEW edge only
```

Illustrative modal:

```
Journey domain context
This branch currently uses: ● lucy.com

Choose tracking domain for this new connection:
  ○ lucy.com
  ○ peter.com     ← would make 2/2
  ○ nike.com      ← disabled if already 2/2
```

---

## A. Current understanding

### Mental model (four layers)

```
1) FIRST TOUCH (videos.first_touch_id)
   → Is this Video still an unconnected journey source?
   → Written on create; cleared when another Video promotes this video-turn asset.

2) STRUCTURAL EDGE (redirect_links)
   → video_id → asset_id (video-turn: link_type landing_page)
   → token identifies the edge
   → tracking_hostname = hostname of THIS edge (NULL → vstrk.com)

3) JOURNEY_DOMAINS (redirect_links.journey_domains)  [planned]
   → declared domain context for THIS edge’s branch
   → Relay priority / continuity (not a substitute for Path B)
   → written when the edge is created; not full-chain backfill

4) PATH B / PROMOTION
   → allowed methods/hostnames when creating a new edge
   → candidates ∩ branch budget; options ≠ already-used count
```

### Core product rule (path-scoped)

```
Per structural branch / path context P (not per node union):
  S = distinct hostnames in that path’s committed context
      (from journey_domains on edges of P, and/or normalized tracking_hostname)
  |S| ≤ 2; |S| ≥ 3 → anomaly / warn

When creating a NEW edge that extends path P with hostname d:
  |S| = 0  → any Path-B-allowed d; new context S' = {d}
  |S| = 1  → d may equal existing OR one new
  |S| = 2  → d MUST ∈ S
```

Same hostname on many assets on the same path = still one domain toward the budget.

### Videos vs VideoDetail vs Analytics

| Surface | Direction | Role |
|---------|-----------|------|
| **Videos.tsx** Track New Content | Downstream from selected **video-turn** | Discover path domain context; modal choose domain; stamp new edge |
| **VideoDetail** | Upstream **paths** into this video + new downstream edges | Eligibility is **per upstream path context**, not global union at the node |
| **Analytics Downstream** | Observed `events_journey` | Unrelated to structural budget enforcement |

`upstreamForRow.ts`: structural fan-in + optional confirmed counts — good for **map UI**. Domain **budget / Relay** must attach to **edge/path**, not `union(all upstream hostnames)` as the sole rule.

---

## B. What existing code already does

### B1. First Touch (done; user verified)

| Item | Behavior |
|------|----------|
| Column | `videos.first_touch_id` uuid NULL |
| Create | `createVideo.ts` → `crypto.randomUUID()` every insert |
| Clear | `generateAssetRedirectLinks` when `assetType === 'video'` → clear videos with that `asset_id` |
| Non-video | resource / campaign_element: no clear |

Track New Content almost always creates a **new** first-touch video; first-touch is cleared only when **later** content promotes that video’s asset.

Future Relay order (not implemented yet):

```
first_touch_id on resolved video?
  YES → treat as source / direct emphasis
  NO  → use clicked edge’s journey_domains (+ tracking_hostname) → existing fallback
```

### B2. Redirect / edge model

- Campaign links: `video_id` + often null `asset_id`, `campaign_id` = link campaign, domain from campaign config / createRedirectLink.
- Asset / video-turn hops: `video_id` = source, `asset_id` = promoted asset, typically `landing_page`, `tracking_hostname` from chosen domain id (NULL → VSTRK semantics).
- Options already include `trackingDomainId`, `promotionId`, `assetId`.

**No `journey_domains` column in DB yet.**

### B3. Path B

`assignment_assets.allow_*`, `promotion_assets.use_*` / `selected_*`; UI in Videos / AssignmentDetail / PromotionDetail. Candidates from `branded_tracking_domains` (+ VSTRK).

### B4. Observed vs structural downstream

- Observed: `downstreamForRow.ts` / `events_journey` (analytics).
- Structural downstream for budget: **not yet a shared helper**; must walk `redirect_links` forward from the video-turn’s video, per branch, reading hostnames / future `journey_domains`.

### B5–B7. Videos / VideoDetail / PromotionDetail

- No journey budget modal yet.
- PromotionDetail Path B edits typically do **not** rewrite existing `redirect_links.tracking_hostname` — budget should prefer **link/edge** data, not live Path B alone.

---

## C. What is missing

1. Migration: `redirect_links.journey_domains` (`text[]` NULL) — **keep**; justified as declaration, not pure denorm.
2. Normalize NULL hostname → `vstrk.com` in all budget math.
3. Structural downstream discovery (per branch), path-scoped (no fan-in union lock).
4. Videos modal: show path domain context + choose domain ∩ Path B ∩ max 2.
5. Stamp `journey_domains` + `tracking_hostname` on **new** video-turn edges only.
6. VideoDetail: per-path upstream context for eligibility (audit token→edge→journey_domains before coding eligibility).
7. Relay read path (later).
8. Legacy edges without `journey_domains`: derive interim S from normalized `tracking_hostname` on edges of the path until rewritten.

---

## D. Edge cases

| Case | Rule |
|------|------|
| Fan-in A→C (lucy) and B→C (peter) | Two path contexts; do **not** force C eligibility = {lucy, peter} for every action |
| Click lucy token vs peter token | Different `journey_domains` context for Relay |
| NULL tracking_hostname | Count as `vstrk.com` |
| Path B offers 2 domains, path S has 1 | Choosing the other makes 2; not pre-counted as 2 |
| Path S already 2 | Third hostname disabled |
| Same domain many assets | Still 1 toward budget |
| P→A lucy, P→B peter, P→C nike | Three independent branches |
| Cycle / duplicate links | seen-set; prefer edges with hostname / journey_domains |
| campaign_element / resource | No video-hop continuation UI |
| \|S\| ≥ 3 on a path | Anomaly / warn |
| Two journeys both use lucy.com | Hostname ≠ unique journey id; token/edge identity matters |

---

## E. Files likely to change (when implementing)

| File | Role |
|------|------|
| Migration | `journey_domains text[]` |
| `lib/redirects.ts` | Persist journey_domains; NULL hostname = VSTRK semantics |
| `services/asset/generateAssetRedirectLinks.ts` | Stamp on new video-turn edges; validate ≤2 |
| **New** structural path/domain helper | Downstream branches + normalize hostnames |
| `upstreamForRow.ts` or companion | Expose **per-edge / per-path** domain context (not only union) |
| `pages/Videos.tsx` | Downstream inspect + domain modal |
| `pages/VideoDetail.tsx` | Path-scoped upstream + new edge rules |
| Path B panel | Disable candidates outside path budget |

---

## F. Schema

```sql
ALTER TABLE public.redirect_links
  ADD COLUMN IF NOT EXISTS journey_domains text[] NULL;
```

- Store hostnames only (e.g. `{lucy.com}` or `{vstrk.com,lucy.com}`).
- On create of video→video-turn edge: set to the **path context after this edge** (prior path domains ∪ {this edge’s hostname}, max 2).
- Always also set/leave `tracking_hostname` for **this** edge (NULL remains valid DB value meaning VSTRK).

**Do not add:** `cant_switch_around`, journey_id table, token chains.

---

## G. Videos.tsx hooks

1. After video-turn selection → structural downstream → per-branch domain context.  
2. Modal: Path B ∩ budget; user picks domain for **this new edge**.  
3. Generate → `createRedirectLink` / `generateAssetRedirectLinks` with hostname + `journey_domains`.  
4. Non video-turn: skip this panel.

---

## H. VideoDetail hooks

1. Map UI may show multiple upstream **branches** (graph).  
2. Eligibility / generate: use **path/edge context**, not forced union.  
3. Before locking eligibility code: audit `token → redirect_link → tracking_hostname / journey_domains`.  
4. New outgoing video-turn edges same stamp rules as Videos.

---

## I. Do not modify (this phase)

- Observed `downstreamForRow` / `events_journey` writers  
- First Touch behavior  
- Fan-in **union** as the sole budget rule  
- Full-chain backfill  
- Relay implementation  
- `cant_switch_around`  

---

## J. Implementation order

1. Document NULL → `vstrk.com` everywhere in budget code comments.  
2. Migration `journey_domains`.  
3. Helper: structural downstream branches + normalize hostnames + read existing `journey_domains` when present.  
4. `createRedirectLink` / generateAssetRedirectLinks stamp + validate.  
5. Videos.tsx modal + Path B intersect.  
6. VideoDetail path-scoped rules (after token→edge audit).  
7. Manual matrix (single path, 2 domains, third blocked, multi-branch independence, fan-in two tokens).  
8. Later: Relay uses first_touch → edge `journey_domains` → fallback.

---

## Appendix — Scenario matrix

| # | Structure | Domains | Notes |
|---|-----------|---------|--------|
| 1 | A→B→C all lucy | 1 | OK |
| 2 | A→B→C lucy then peter | 2 | OK |
| 3 | + nike | 3 | Block / warn |
| 4 | Same domain repeated | 1 | OK |
| 5 | P→A lucy; P→B peter; P→C nike | 1 each branch | Independent |
| 6 | Fan-in A→C lucy, B→C peter | two contexts | No forced union for Relay |
| 7 | NULL then lucy | {vstrk.com, lucy.com} | 2 domains |

---

## Appendix — First Touch checklist

- [x] `videos.first_touch_id`  
- [x] createVideo sets UUID  
- [x] generateAssetRedirectLinks clears video-turn downstream  
- [x] User tests succeeded  
- [ ] `journey_domains` migration + stamp  
- [ ] Videos domain modal  
- [ ] VideoDetail path-scoped eligibility  
- [ ] Relay  

---

*Updated 2026-09-28: journey_domains required as path declaration; fan-in union not locked; NULL = vstrk.com; Videos modal flow. Audit only — no application code changed beyond this doc.*

使用者建立 Video
        ↓
這個 Video 要接到某個 Asset
        ↓
判斷這個 Asset 後面已經存在的 Journey
        ↓
看看這條 Journey 已經用了哪些 domain
        ↓
使用者選擇這次新 edge 要用哪個 domain
        ↓
最多只能有 2 個不同 domain
        ↓
把結果存進 redirect_links
        ↓
        tracking_hostname
        +
        journey_domains
        ↓
未來 Relay
        ↓
Relay 讀 journey_domains
        ↓
決定 Relay domain
        ↓
cookie