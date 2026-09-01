Handoff — Video Archive Migration (video_user_states)
1. Completed and verified
video_user_states table created in Supabase, schema/RLS confirmed to match asset_user_states exactly: (id, video_id, user_id, archived_at, created_at), unique (video_id, user_id), RLS enabled with 3 policies (select/insert/update, all user_id = auth.uid()) — no delete policy, matching asset_user_states. select * from video_user_states limit 1 ran with no error.
services/video/getVideoArchiveContext.ts migrated: all 3 archive-read paths (getVideoArchiveContext, getVideoArchiveContextsForViewer, computeVideoArchiveContextsFromLoadedData) now source the 'video' reason from video_user_states scoped to viewerId, via two new helpers getPersonalArchivedAt / getPersonalArchivedAtBulk. Campaign logic and archive_ui_visibility/hidden logic untouched (diffed identical). tsc --strict passes. Deployed — confirmed not to reproduce the original blank-AllAssetsAnalytics failure.
2. Root cause of the earlier AllAssetsAnalytics failure (already resolved)

An earlier patch attempt queried video_user_states before the table existed in Supabase. The bulk resolver call inside AllAssetsAnalytics.tsx's data-loading pipeline threw, an uncaught exception propagated into that page's single try/catch, which does setRows([]) on any error — wiping all rows. Confirmed via AllAssetsAnalytics.tsx's own console logs stopping right before the video-archive-context call. Not a design flaw — a deploy-ordering issue (code shipped referencing a table that wasn't migrated in yet). Table now exists; this specific failure mode is closed.

3. Root cause of the current half-migration behavior (confirmed today, live-tested)
Read path (getVideoArchiveContext.ts) now trusts video_user_states only.
Write paths (Videos.tsx handleArchiveVideo/handleRestoreVideoOwnArchive, VideoDetail.tsx handleArchive/handleRestore) still write .from('videos').update({ archived_at: ... }) — unmigrated.
Both write handlers use optimistic local React state only (setArchiveContextMap / setArchiveContext) and never re-call the resolver — so an archive action in Videos.tsx appears to work purely from in-memory state, with no read-verification that it persisted correctly.
video_user_states is currently empty (nothing has ever written to it).
Any fresh resolver read — VideoDetail.tsx on every page load (line ~465), or Videos.tsx on a cache-miss fetchData() — reads the empty table and correctly reports every video as not-archived. This is why all previously-"archived" videos appeared to revert at once: it's a full fresh read of an empty source, not per-video corruption.
Same root cause explains AllAssetsAnalytics.tsx showing nothing archived — it also reads only video_user_states via getVideoArchiveContextsForViewer.
4. getVideoArchiveContext.ts — do not touch again

Confirmed correct and working as designed. The bug is entirely that its data source isn't populated yet, not the resolver logic itself.

5. Confirmed next implementation order
FIRST — migrate archive/restore WRITE paths in Videos.tsx and VideoDetail.tsx to video_user_states (upsert, matching asset_user_states's pattern — update archived_at, never delete the row on restore).
SECOND — fix getAssetArchiveContext.ts's two ungated video.archived_at reads (still leak WebMood's archive to Ali via Asset provenance — confirmed present, unfixed).
THIRD — fix Videos.tsx's videosPageCache key: currently videosPageCache.get/set(effectiveOrgId) only (confirmed at lines ~903, 1004, 1019) — needs effectiveUserId folded in, since archiveContextMap will hold per-viewer data and two users in the same org must not share a cache hit.
6. Exact write locations for the next Claude to modify

pages/Videos.tsx

handleArchiveVideo (~line 1276): the .from('videos').update({ archived_at: new Date().toISOString() }).eq('id', v.id) call (~line 1284–1287).
handleRestoreVideoOwnArchive (~line 1352): the .from('videos').update({ archived_at: null }).eq('id', videoId) call (~line 1355–1358).
videosPageCache.get(effectiveOrgId) (~line 903) and both videosPageCache.set(effectiveOrgId, ...) calls (~lines 1004, 1019) — cache key needs effectiveUserId.

pages/VideoDetail.tsx

handleArchive (~line 892): the .from('videos').update({ archived_at: new Date().toISOString() }).eq('id', id!) call (~line 900–903).
handleRestore (~line 921): the .from('videos').update({ archived_at: null }).eq('id', id) call (~line 926–929).

services/asset/getAssetArchiveContext.ts (second phase)

resolveProvenanceReasons — single-asset path, the if (isLibraryVisible && video.archived_at) block.
getVideoProvenanceRowsBulk usage inside getAssetArchiveContextsForViewer — same ungated pattern, batch path.
7. Must NOT change unless later investigation proves otherwise
pages/AllAssetsAnalytics.tsx — confirmed generic consumer of the resolver, needs zero changes.
lib/analyticsArchiveFilter.ts — pure filter, no DB access, unaffected.
pages/AssetDetail.tsx — resolver-output-driven, confirmed clean.
services/video/archiveUiVisibility.ts — separate concept (Level 1/2 UI visibility), not the archive condition; explicitly not to be merged with video_user_states.
8. Backfill — decision deferred, not implemented

Existing rows where videos.archived_at IS NOT NULL will, once writes are migrated, have no corresponding video_user_states row and will show as NOT archived for everyone until a backfill is explicitly decided and run. This is a known, visible behavior change on deploy — not a bug — and is intentionally left as a separate future decision. Do not write backfill SQL until explicitly asked.

9. WebMood / Ali acceptance tests (run after steps 1–3 above)
WebMood archives Video A in Videos.tsx → reads back as archived for WebMood after a full page reload (not just optimistic state) in both Videos.tsx and VideoDetail.tsx.
Ali (different user, same org) loads Videos.tsx / VideoDetail.tsx for Video A → shows NORMAL, no archive badge.
Ali loads AssetDetail.tsx for the Asset that Video A promotes → no "Source Video Archived" reason (this is the specific case getAssetArchiveContext.ts's fix addresses).
Ali's AllAssetsAnalytics.tsx loads with nonzero rows, videoArchive.isArchived === false for rows referencing Video A.
WebMood's AllAssetsAnalytics.tsx loads with nonzero rows, videoArchive.isArchived === true for rows referencing Video A.
WebMood restores Video A → reflects correctly (not archived) after a full reload, for WebMood only.
Two different users in the same org load Videos.tsx back-to-back → confirm no cross-contamination via videosPageCache (tests the step-3 cache-key fix).
Navigate away and back (or hard reload) after any archive/restore action, in both Videos.tsx and VideoDetail.tsx — confirm state persists correctly from video_user_states, not just optimistic local state.


Before we continue with the next patch, I need to correct one important product requirement from the previous plan.

## IMPORTANT: Asset A must NOT inherit or display Video archive status

Our actual model is:

* Asset A can be promoted from **multiple videos**.
* Example:

  * Ali gives Asset A to WebMood.
  * WebMood promotes Asset A using Video A.
  * The same Asset A could also be promoted using Video B, Video C, etc.
* If WebMood archives Video A, that must affect **WebMood's view of Video A only**.
* It must NOT cause Asset A itself to become archived.
* It must NOT cause Asset A's provenance to show `Source Video Archived`.
* In fact, I do **not want Asset A / AssetDetail / asset provenance to display anything at all about a source video's archive state**.

So I do NOT want to merely fix the previous `getAssetArchiveContext.ts` ownership leak by making `Source Video Archived` viewer-specific.

I want to remove/stop the Asset provenance dependency on Video archive state entirely.

### Before changing anything

Please inspect the actual current `services/asset/getAssetArchiveContext.ts` and trace:

1. Every place where `video.archived_at` or video archive state is read.
2. Every place where that information becomes a provenance/archive reason such as:
   `sourceType: 'video'`
   or `Source Video Archived`.
3. Confirm whether this affects:

   * AssetDetail.tsx
   * Assets.tsx / bulk provenance
   * AllAssetsAnalytics.tsx
   * any other asset archive UI.

Do NOT modify code yet.

I want you to report exactly:

* what code currently causes `Source Video Archived` to appear for an Asset;
* whether there are one or multiple paths;
* what the smallest safe change would be to completely remove Video archive status from Asset provenance;
* and confirm that removing this dependency will NOT affect:

  * Video A's own archive state;
  * Video archive behavior in Videos.tsx;
  * VideoDetail.tsx;
  * AllAssetsAnalytics.tsx's `videoArchive` field;
  * campaign archive logic;
  * promotion archive logic;
  * asset's own personal archive state.

### Current verified state

The following is already working and should NOT be changed:

1. `video_user_states` exists and matches `asset_user_states`:

   * `(id, video_id, user_id, archived_at, created_at)`
   * unique `(video_id, user_id)`
   * RLS enabled
   * SELECT / INSERT / UPDATE own-user policies
   * no DELETE policy.

2. `getVideoArchiveContext.ts` has already been migrated to read personal video archive state from `video_user_states`.

3. `Videos.tsx` archive/restore writes have been migrated to `video_user_states`.

4. `VideoDetail.tsx` archive/restore writes have been migrated to `video_user_states`.

5. `Videos.tsx` cache key has been changed to include both:
   `${effectiveOrgId}:${effectiveUserId}`

6. Acceptance test already passed:

   * WebMood archives Video A.
   * WebMood's AllAssetsAnalytics shows Video A as archived.
   * Ali's AllAssetsAnalytics shows Video A as NOT archived.
   * VideoDetail archive/restore behavior is now also working.

### Do NOT do

Do not:

* create another archive table;
* modify `getVideoArchiveContext.ts`;
* modify `AllAssetsAnalytics.tsx`;
* modify `analyticsArchiveFilter.ts`;
* add an ownership gate to `getAssetArchiveContext.ts` as a substitute for this requirement;
* perform any backfill;
* change campaign or promotion archive logic.

First investigate `getAssetArchiveContext.ts` and report the exact current behavior and smallest safe fix. Do not edit until I approve the proposed change.
