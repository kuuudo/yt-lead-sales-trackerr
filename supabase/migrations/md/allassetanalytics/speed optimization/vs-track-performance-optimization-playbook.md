# VS-Track Performance Optimization / Sequential Query Investigation Playbook

**Subject:** `AllAssetsAnalytics` load-time optimization
**Status:** Two optimization rounds complete. Third round (AllAssetsAnalytics.tsx-level) not yet started.
**Purpose:** Capture what was done, why it worked, and a reusable methodology for optimizing other sheets (Analytics, InDepthAnalytics, other asset/analytics pages).

---

## 1. Original Problem

`AllAssetsAnalytics` was taking **~11.4 seconds** to load, for a dataset that was not large:

```
analyticsRows: 135
assetIds:      38
videoIds:      66
campaignIds:   8
promotionIds:  27
sharedAssetIds: 25
```

**Why this was identified as a sequential-await problem, not a data-volume problem:**

135 rows and 38 assets is a trivial amount of data for any competent database to serve. If this were a data-volume problem, the fix would be pagination, indexing, or query optimization at the SQL level. Instead, real timing instrumentation showed the time was being spent almost entirely in **round-trip latency, repeated many times in strict sequence** — dozens of independent network calls to Supabase, each waiting for the previous one to fully complete even when it had no data dependency on it.

The signature of this problem type: **total time ≈ sum of individual query durations**, rather than being bounded by the single slowest necessary chain. That's the tell that parallelization — not query optimization — is the right fix.

---

## 2. Investigation Methodology

This is the process that produced two successful, provably-correct optimization rounds. It should be repeated for any future page.

1. **Instrument timings first.** Add `console.time`/`console.timeEnd` around every discrete async operation, plus `console.log` of relevant counts (row counts, ID counts) at each step. Do this *before* touching any logic.
2. **Map the dependency graph before changing code.** For every operation, ask three questions:
   - What data does it actually consume (read the code — don't assume)?
   - What later operations consume its output?
   - Could it start earlier than it currently does, given what it actually needs?
3. **Identify which queries genuinely depend on previous results** vs. which merely *happen* to be written sequentially in the code. These are not the same thing — code order is not dependency order.
4. **Parallelize only truly independent work.** Two DB queries are not "independent" just because they're both DB queries — verify from the actual code, not assumption.
5. **Preserve processing order, return shape, RLS/permissions, and business logic exactly.** A performance pass should be invisible to correctness — same filters, same merge order, same error-handling semantics, same visibility rules.
6. **Measure before/after using multiple timing runs**, not a single sample — individual page loads have real noise (network variance, cold caches) that can hide or exaggerate a fix's true effect.
7. **Use critical-path math to verify parallelization actually happened**, not just that the total got smaller. If you can predict `max(a, b)` or a chained `a + b` from the dependency graph and the observed total matches within a few ms, that's strong proof the new `Promise.all`/chaining structure is behaving as designed rather than the number just moving from unrelated noise.

---

## 3. Fix 1 — `getSharedAssetRows()`

**Problem:** Three independent asset-type queries (video / resource / campaign-element) were being awaited one after another inside `getSharedAssetRows()`, despite none of them depending on each other's results — each just filters the same `assetIds` list by a different `asset_type`.

**Fix:** Fired all three Supabase queries immediately via async IIFEs (dispatched together, before any is awaited), then awaited/processed each at its original code position — same logs, same error handling, same `results.push()` order (video → resource → campaign_element).

**Before/after:**
```
Before (sequential): video 756ms + resource 375ms + element 383ms ≈ 1515ms
After  (parallel):   step 4 (all 3 sub-queries) = 403ms
                      ≈ max(392, 386, 403) — matches prediction almost exactly
```

**Why this proves the fix worked:** The observed total (403ms) matches `max()` of the three individual query times, not their sum. That's only possible if they were genuinely running concurrently.

---

## 4. Fix 2 — `listSharedAssetsForCollaborator()`

**Problem:** After `getMyPromotions()` resolved, two branches ran in sequence even though only one depended on the other:
- **Asset branch:** `getAssetPromotionPairs → getRevokedAssetKeys → getSharedAssetRows` (genuine internal sequential dependencies — each step needs the previous step's output)
- **Sharer branch:** `getAssignmentCreators → getSharerProfiles` (only needs `assignmentIds`, which is derived from `myPromotions` alone — no dependency on the asset branch)

**Fix:** Wrapped each branch in its own async IIFE and ran them together via `Promise.all`, instead of the sharer branch waiting behind the asset branch.

**Explicitly preserved (not touched):** The internal sequential dependencies *inside* the asset branch (`getAssetPromotionPairs → getRevokedAssetKeys → getSharedAssetRows`) were left exactly as they were — only the *outer* pairing of the two branches was parallelized.

**Before/after:**
```
Asset branch:  step2 (284) + step3 (704) + step4 (403) = 1391ms
Sharer branch: step5 (283) + step6 (302) = 585ms
Predicted: max(1391, 585) = 1391ms, plus step1 (641ms, unparallelized) = 2032ms
Observed: SharedAssets TOTAL = 2033.4ms  →  1ms off prediction
```

This produced an overall `SharedAssets TOTAL` reduction from ~3622ms → ~2033ms (~44%).

---

## 5. Top-Level Optimization — Query A / Query B in `getAssetAnalyticsRows()`

**Problem:** Query A (`orgRedirectLinks`, needs only `organizationId`/`assetIdsFilter`) and Query B (`sharedAssetResolution`, needs only `viewerId`/`organizationId`) never touch each other's data, but ran sequentially in code.

**Important nuance preserved:** Query B itself contains an internal **B1 → B2 dependency**:
- B1 = `listSharedAssetsForCollaborator(...)` (measured separately as `SharedAssets TOTAL`)
- B2 = a second, previously-uninstrumented `redirect_links` query filtered by `.in('asset_id', sharedAssetIds)`, which genuinely needs B1's output (`sharedAssetIds`)

This B1 → B2 dependency was **kept fully intact** — it was only Query A that got pulled out to run *alongside* Query B (B1+B2 combined), not anything inside Query B.

**Investigation finding worth remembering:** The ~798ms gap observed between `query B: sharedAssetResolution` (2830ms) and `SharedAssets TOTAL` (2033ms) in early debugging was traced to exactly this B2 sub-query — real, legitimate DB work that simply wasn't individually instrumented, not timing noise. Lesson: an unexplained gap between a parent timer and a child timer is a strong signal there's a second, uninstrumented operation inside the parent — go find it in the code before assuming it's noise.

**Fix:** Wrapped Query A and the full Query B (B1+B2) each in an async IIFE, ran both via `Promise.all`, merged results in the same fixed order as before (`[...orgScopedRedirectLinks, ...sharedRedirectLinks]`), so behavior/ordering is unaffected by which one finishes first.

---

## 6. C/D/E/F/G Optimization (inside `getAssetAnalyticsRows()`)

**Dependency graph, verified from the actual code (not assumed):**

- **C** (`assets`), **D** (`events`), **F** (`videos+resources+elements+assigned`) each depend *only* on `distinctAssetIds` (+ `viewerId` for F) — none reads another's output. **Independent of each other.**
- **E** (`stripe+pixelPurchases`) is a mixed case:
  - Its `stripeByToken` branch depends only on `tokens` (derived from `redirectLinks`, available even before C starts) — independent of C/D/F.
  - Its `stripeBySession` and `pixelPurchases` branches depend on `sessionIdsFromEvents`, which only exists after **D** resolves — these must stay chained off D.
- **G** (`assetArchiveContext`) depends only on `assetTypeById`, which comes from **C** — chained off C, but does **not** need D, E, or F.
- **The `computeAssetAnalytics` compute loop** needs C, D, E, F all resolved — but critically, it does **not** read archive data (G's output). Only the final row-join step needs G. This meant G could be moved to run *underneath* the compute loop instead of blocking it.

**Fix:** C, D, F, and E's token-branch were all dispatched together immediately. E's two session-based branches were chained via `.then()` off the D promise. G was chained via `.then()` off the C promise, and `await`ed only right before the final join — not before the compute loop.

**Resulting critical path (predicted vs. observed):**
```
Predicted critical path: C (420ms) → G (1112ms) = 1532ms
  (chosen because D/E/F all finish comfortably inside that window)
Observed: AssetAnalyticsRows TOTAL (3663.9ms) − [Query A/B combined, 2130ms]
          − buildAssetAnalyticsRows (0.2ms) = 1533.7ms remaining
Predicted 1532ms vs. observed 1533ms — 1ms off.
```

This is strong confirmation the new `Promise.all`/chaining structure is genuinely doing what it was designed to do, not just coincidentally faster.

---

## 7. Measured Results (progression across both rounds)

| Metric | Original | After Round 1 (Fix 1+2) | After Round 2 (Query A/B + C/D/E/F/G) |
|---|---|---|---|
| `AllAssetsAnalytics TOTAL` | ~11.38s | ~10.73s | **~7.51s** |
| `getAssetAnalyticsRows TOTAL` | ~6.78s (part of the 11.38s run's 7.9s) | — | ~3.66s |
| `SharedAssets TOTAL` | ~3.62s | ~2.03s | ~1.77s |
| `finalRows` | 135 | 135 | 135 ✅ |
| `assetIds` | 38 | 38 | 38 ✅ |
| `videoIds` | 66 | 66 | 66 ✅ |

Net result so far: **~11.4s → ~7.5s (~34% total reduction)**, with row/asset/video counts verified unchanged at every step (no correctness regression detected).

---

## 8. What NOT To Do

- **Don't parallelize based merely on query duration.** A slow query is not automatically a parallelization candidate — check what it actually depends on first.
- **Don't parallelize queries whose inputs come from another query.** Verify data dependencies from the real code, never assume two DB calls are independent just because they're both DB calls.
- **Don't change business logic, RLS, or filtering while doing a performance pass.** Keep performance work surgical and separable from behavior changes — mixing the two makes both harder to verify and roll back.
- **Don't combine unrelated refactors with a surgical performance optimization.** No drive-by cleanup, no architecture changes, no touching unrelated warnings (e.g. `Multiple GoTrueClient instances`, the YouTube `hqdefault.jpg` 404) inside a performance pass.
- **Don't judge a change from one noisy timing run.** Individual page loads vary due to network/connection-pool variance — confirm with multiple runs before concluding a change regressed or didn't help.
- **Don't chase sub-1-second performance before the MVP is stable.** For an authenticated data dashboard doing many DB round-trips (not a marketing landing page), ~3–5s is an acceptable MVP target, ~2–3s is good, and squeezing further than that is not worth the risk/time before shipping.
- **Don't remove timing instrumentation mid-investigation.** Keep `console.time`/`console.timeEnd`/`console.log` instrumentation in place through the *entire* optimization cycle (baseline → fix → measure → investigate → fix → measure → ... → final cleanup). Only strip it out in a dedicated cleanup pass once performance work is fully done and verified.

---

## 9. Current Remaining Bottleneck

Page total is currently **~7.51s**. The two rounds of work above focused entirely on `getAssetAnalyticsRows()` (now ~3.66s, down from ~6.78s). The remaining time is split between that function and several **untouched, still-sequential** steps inside `AllAssetsAnalytics.tsx` itself:

```
resolveOrgAndViewer   ~780ms
videoArchive          ~938ms
campaignArchive       ~278ms
promotionArchive      ~667ms
videosAndAssets       ~891ms
profiles              ~286ms
-----------------------------
                     ~3.84s  (untouched, not yet investigated)
```

These have **not yet been investigated** — no dependency graph has been mapped for them, and no assumption should be made about which are safe to parallelize.

---

## 10. Next-Step Procedure

The next optimization pass — on `AllAssetsAnalytics.tsx` — should follow the exact same discipline as this playbook documents, **investigation before code**:

1. Read `AllAssetsAnalytics.tsx` in full.
2. Map its dependency graph: for each of `resolveOrgAndViewer`, `videoArchive`, `campaignArchive`, `promotionArchive`, `videosAndAssets`, `profiles` (and any other steps), determine what data each one actually consumes and what depends on its output.
3. Identify which operations are genuinely independent vs. which have real sequential dependencies (verify from code, not assumption).
4. Calculate the theoretical critical path if the independent work were parallelized.
5. Only then propose the safest, most minimal set of changes — and stop there. Do not implement automatically; present the graph and expected savings first, the same way the C/D/E/F/G investigation was presented before those patches were written.

**Do not start this investigation by patching code.** Investigation and code changes are separate steps/turns, exactly as they were for both rounds documented above.

---

## 11. Reusable Checklist

For optimizing any future sheet (Analytics, InDepthAnalytics, other asset/analytics pages):

1. **Instrument** — add timing/count logging around every discrete async step, before touching logic.
2. **Map dependencies** — for each operation: what does it consume, what consumes its output, from the actual code.
3. **Identify critical path** — the longest genuinely-required sequential chain; that's the theoretical floor for total time.
4. **Parallelize only independent work** — verified independence, not assumed.
5. **Preserve logic** — same filters, same merge/processing order, same RLS/permissions, same return shape, same error-handling semantics.
6. **Build/typecheck** — confirm no new errors before deploying.
7. **Deploy.**
8. **Run multiple timing tests** — not just one page load.
9. **Verify row counts/data** — confirm counts (rows, assets, videos, etc.) match pre-change values, and spot-check displayed data.
10. **Compare critical path** — check whether the observed total matches the predicted `max()`/chained critical-path math; if it doesn't, the parallelization may not be working as intended even if the number went down.
11. **Decide whether another pass is worth it** — weigh remaining time against MVP timeline; don't over-optimize past the point of diminishing returns.
