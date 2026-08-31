# ARCHIVE SYSTEM — SOURCE OF TRUTH

Status: **INVESTIGATION IN PROGRESS — NOT YET APPROVED FOR IMPLEMENTATION**

Investigation order: Assignment (LOCKED) → Asset (LOCKED) → Video (current) → Promotion → Campaign → (this doc finalized) → Implementation

Do not create `archiveScope.ts`, modify pickers, modify analytics, or write any archive-related code based on this document until every entity below is marked LOCKED and all Open Questions are answered or explicitly deferred by the product owner.

---

## 1. Objective (provisional — do not finalize until all entities locked)

Archive is a visibility/state mechanism, not deletion. Archived entities are recoverable and should generally not appear in active/operational contexts, while historical analytics/revenue/session/conversion data must survive archiving.

## 2. Non-goals

- No permanent-delete/trash lifecycle beyond what already exists in the DB today (see §9).
- No automatic cascade unless explicitly proven necessary by product decision, not inferred by convenience.
- No unification of Global vs Personal archive mechanisms into one shape — they are different by design (see §5).

## 3. Entity model

Confirmed entities requiring archive semantics: **Campaign, Video, Asset, Assignment, Promotion**.
Not yet evaluated: Marketer/Sponsor as first-class archive subjects, Tracking Domain.

## 4. Relationship map (as verified by code so far — not finalized)

```
Campaign
 ├── Videos (videos.campaign_id)
 │     └── Video Library Assets (videos.asset_id → assets.id, asset_type='video')
 ├── Campaign Element Assets (campaign_element_assets.campaign_id → assets.id, asset_type='campaign_element')
 └── Promotions (promotions.campaign_id) — relationship to Campaign Element Assets NOT YET VERIFIED

Asset (3 provenance types, 1 archive mechanism — see §7)
 ├── assignment_assets (sharing/assignment)
 ├── campaign_assets (campaign-picker usage — NOT YET fully traced)
 └── promotion_assets (promotion usage — NOT YET verified, referenced only in prior analytics doc)

Assignment
 └── assignment_collaborators → Promotion (promotions.assignment_id, promotions.assignment_collaborator_id)
```

Imported/Resource assets (Type 3) have **no campaign provenance** — confirmed, no `campaign_id` anywhere in their chain.

## 5. Archive semantics — Global vs Personal (CONFIRMED, cross-entity)

| Mechanism | Entities | Storage | Scope |
|---|---|---|---|
| **Global** | Campaign, Video | `archived_at` column on the entity row itself | Shared fact — same answer for every viewer |
| **Personal** | Asset, Assignment, Promotion | separate `*_user_states` table, `(entity_id, user_id)` unique | View-level annotation — one viewer's answer may differ from another's |

This split is confirmed by code (three `*Archive.ts` service files inspected), not assumed.

---

## 6. Assignment — **LOCKED**

- Personal, scoped `(assignment_id, user_id)`, via `assignment_user_states`.
- Zero cascade in any direction — confirmed, `assignmentArchive.ts` never touches `assignments.status`, `assignment_collaborators`, `assignment_invitations`, `promotions`, or any asset/tracking table.
- Does not cancel pending invitations, does not affect the other party, no notification.
- Per product confirmation: in the UI, an Assignment disappears once the invitation is accepted, and this is already supported by existing code. No further investigation needed unless a future phase (Promotion/Campaign) surfaces a contradiction.
- **Open items closed**: sponsor-only-vs-any-viewer question — deferred, not currently blocking, since it doesn't affect archive mechanics either way.

## 7. Asset — **LOCKED**

- Personal, scoped `(asset_id, user_id)`, via `asset_user_states`. Identical mechanism and identical policy across all 3 asset types (Campaign Element / Video Library / Imported) — type is a display/provenance concern only, never an access/archive concern. Confirmed structurally: `asset_user_states` has no visibility into `asset_type`.
- Zero outward cascade: never affects Video, Assignment, Promotion, Campaign, other users, or historical data.
- Symmetric mechanism across owner/collaborator — same function, same table. (Symmetric *mechanism*; the two directions have different **product** consequences — see Owner vs Personal Archive below.)

### Ownership vs Access — corrected model (LOCKED PRODUCT DECISION)

Ownership and access are two different gates, and archive only ever operates within a gate the viewer already qualifies for:

- **Ownership**: org-level. A user can only select/manage Assets belonging to their own organization (`assets.organization_id` matches the current user's org).
- **Access without ownership**: a Marketer/Collaborator can be granted access to another org's Asset via `assignment_assets` / `assignment_collaborators`, but this never grants ownership.
- **Create-Assignment Asset Picker eligibility**: shows only Assets the current user's own org owns. An Asset merely shared *to* the current user (they're a collaborator, not the owner) is never eligible here, regardless of anyone's archive state. This is enforced today by organization-scoped queries (`listLibraryAssetsForAssignmentPicker`'s `organization_id` filter; `listAssetsForCampaign`'s campaign→org binding) — confirmed structurally, with one caveat: I have not inspected `CreateAssignment.tsx` to confirm the `organizationId` it passes in is always the current user's own org. Treated as a reasonable assumption, not a fully confirmed fact.
- **Consequence**: the scenario "User A archives Asset X, does User B (a collaborator) see it in the Create-Assignment picker" does not occur — B was never eligible to see A's asset there in the first place, archived or not.

### Owner Archive vs Personal (Collaborator) Archive — LOCKED PRODUCT PRINCIPLE

These are different product events, not the same mechanism viewed from two angles:

| | Personal (Collaborator) Archive | Owner Archive |
|---|---|---|
| Meaning | "I don't want to see/work with this anymore" | "This Asset is no longer active/available to the people using it" |
| Affects owner's view? | No | — |
| Affects other collaborators' view? | No | Eventually yes (future) |
| Notifies owner? | No (MVP) | — |
| Notifies collaborators? | No (MVP) | **Yes — future, not implemented yet** |
| Creates shared/global archive state? | No | No — mechanism stays personal (`asset_user_states`); only the *notification* is asset-wide |

MVP scope: **mechanism is unchanged for both directions** (still writes to `asset_user_states`). The only thing deferred is the notification side-effect when an owner archives. Proposed future label distinction for UI, not built yet: **"Archived by owner"** vs **"Archived by you."**

### Future notification design — LOCKED (design only, not built)

1. Role (owner vs. collaborator) is **not currently stored** anywhere at archive time — `archiveAssetForUser(assetId, userId)` takes a bare `userId`, no role. Confirmed code fact.
2. Role is technically derivable via relationship tracing (org membership vs. `assignment_collaborators`), but **product owner has explicitly rejected relying on derivation at read time** — past experience tracing relationships across tables for historical questions was costly, so this must be captured directly instead.
3. **LOCKED future schema (not built now):** `asset_user_states` will gain an `archived_by_role` field, values `owner` / `collaborator`, written as a snapshot at the moment of archiving — never derived after the fact.
   - `owner`: archiving user belongs to the Asset's organization.
   - `collaborator`: archiving user is accessing the Asset via assignment/collaboration, not org membership.
4. **Multi-member organization ambiguity — RESOLVED, no longer an open question.** Any user who belongs to the Asset's organization is treated as owner-side; there is no requirement to identify one single "true owner" person. This is explicitly acceptable because archive is not deletion — any org member archiving is a safe, low-stakes action. (Currently moot in practice: organizations are single-member today, but the rule already covers future multi-member orgs without revisiting this question.)
5. **Recommended separation (unchanged):** `archived_by_role` is *state*, belongs on `asset_user_states`. Notifying collaborators when an owner archives is a *side-effect*, to live in a future service — proposed location `services/asset/assetNotifications.ts`, or a shared `services/notifications/` module if Video/Promotion/Campaign need the same "owner action informs downstream party" pattern (to be confirmed in the Promotion phase, not assumed now).

### Picker policy

- Hard filter against current viewer's own archive state, within the ownership-gated eligible set (see above), no toggle.
- ⚠️ **Confirmed implementation gap, scope now precise:** `listAssetsForCampaign` and `listLibraryAssetsForAssignmentPicker` correctly gate by ownership already, but neither queries `asset_user_states` — so within a user's own eligible assets, archived ones still appear. `Assets.tsx`'s in-page picker already filters correctly. Not being fixed yet, per process rules.

### Analytics policy

- **Single-viewer contexts**: soft filter, "Archived" label (distinguishing "by owner" vs "by you" once built), optional "Hide Archived," historical numbers never suppressed.
- **Org-shared/multi-viewer contexts**: **DEFERRED — Analytics Phase.** Deferred globally across all five entities at once (Promotion has the identical owner/collaborator structure), not solved per-entity, to avoid two different answers to the same structural question later.

### Explicitly out of MVP

- Surfacing "archived for me, still active for N other collaborators" to any viewer — no product need identified, and building it risks the exact cross-collaborator visibility `getAssetSharingInfo.ts` deliberately prevents elsewhere. Data model for a *future* version of this is preserved via the archived-by-role recommendation above, without building the feature now.

### Known technical note (not a blocker, not forgotten)

`assets` has a DB-level hard-DELETE RLS policy that predates the archive system. Per product owner confirmation, users cannot reach it through the UI today — recorded as a future technical risk, explicitly not in scope for the current archive design.

---

## 8. Video — NOT YET INVESTIGATED

## 9. Promotion — NOT YET INVESTIGATED (flagged by product owner as the highest-disagreement entity — expect this phase to take the longest)

## 10. Campaign — NOT YET INVESTIGATED

## 11. Cascade Matrix (fill in only as each phase completes — do not guess ahead)

| Archive source | Target | Cascade? | Why | Status |
|---|---|---|---|---|
| Asset | Video | No | Asset archive has zero outward cascade — confirmed | LOCKED |
| Asset | Assignment | No | same | LOCKED |
| Asset | Promotion | No | same | LOCKED |
| Asset | Campaign | No | same | LOCKED |
| Assignment | Asset/Video/Promotion/Campaign | No | Assignment archive has zero cascade — confirmed | LOCKED |
| Video | Asset | ? | Pending Video phase | TBD |
| Promotion | Asset | ? | Pending Promotion phase | TBD |
| Campaign | Video | ? | Pending Campaign phase | TBD |
| Campaign | Asset | ? | Pending Campaign phase | TBD |
| Campaign | Promotion | ? | Pending Campaign phase | TBD |

## 12–30. (Picker behavior, Search, Analytics, Historical data, Archive labels/reasons, Restore, Permissions, RLS, SQL/schema, Required code changes, Files that must/must not change, Testing plan, Edge cases, Known risks, Deferred questions, Implementation phases)

Not started — populated only after Video, Promotion, and Campaign are locked, per agreed process.

---

## Process rules for this document (do not skip)

1. No entity moves from "under investigation" to "LOCKED" until its Open Questions are either answered by the product owner or explicitly marked "deferred — accepted as unresolved risk."
2. No phase begins by assuming the previous phase's open questions are implicitly resolved just because the conversation moved forward.
3. This file is updated at the end of every phase, not only at the very end of the whole investigation.
4. No implementation code, migrations, or new service files are written while this document has any entity below LOCKED status.

---

## CODEBASE FILE MAP

Only files actually inspected in this investigation are listed. "Inspected" means either full content was provided and read, or targeted `grep`/`view` was run against the file on disk. Partial inspection is marked explicitly — do not treat it as equivalent to a full read.

### Pages

| File | Responsibility (as observed) | Entity | Inspection | Phase | Needed again? |
|---|---|---|---|---|---|
| `pages/Campaigns.tsx` | Own local fetch/cache/archive handlers for Campaigns, independent of `dataStore.ts`. Filters `is_system=false AND archived_at IS NULL` on fetch. | Campaign | Full (grep + targeted view) | Audit / Campaign | Yes — Campaign phase |
| `pages/Videos.tsx` | Video list, archive/restore handlers (global `archived_at`), own `videosPageCache`. Contains the confirmed unfiltered-campaign-dropdown picker bug. | Video, Campaign (picker bug) | Full (grep + targeted view) | Audit / Video | Possibly — if picker-bug fix scope is revisited |
| `pages/Assets.tsx` | In-page Asset list/picker, `archivedMap` construction via `getArchivedAssetIdsForUser`, own `assetsPageCache`. Correctly filters archived assets in its own picker. | Asset | Full (grep + targeted view) | Audit / Asset | No — Asset LOCKED |
| `pages/Marketplace.tsx` | Assignment + Promotion lists, two independent personal archive maps, own three page caches. | Assignment, Promotion | Full (grep + targeted view) | Audit / Assignment | No — Assignment LOCKED. Promotion sections will need re-inspection in Promotion phase. |
| `pages/VideoDetail.tsx` | **Partial inspection only.** Confirmed: `handleArchive`/`handleRestore` write only `videos.archived_at`, never touch `assets`. Confirmed: "View Asset" link only shown when `asset.added_to_library_at` is set. `handleAddToLibrary` calls `addToLibrary()`. Full file (1766 lines) not read line-by-line — only archive/restore/library-related sections. | Video | Partial (grep + 2 targeted view calls) | Video (in progress) | Yes — if remaining sections (edit flow, redirect link management, etc.) become relevant |

### Services — Asset

| File | Responsibility | Inspection | Needed again? |
|---|---|---|---|
| `services/asset/assetArchive.ts` | Personal archive CRUD: `getArchivedAssetIdsForUser`, `getAssetArchiveState`, `archiveAssetForUser`, `restoreAssetForUser`. Type-agnostic, keyed `(asset_id, user_id)`. | Full | No — Asset LOCKED |
| `services/asset/types.ts` | Shared `AssetType` union (`video`/`campaign_element`/`resource`), input/output shapes. | Full | No |
| `services/asset/resolveAssetType.ts` | Read-only badge lookup: asset id → type + org, graceful null on failure. | Full | No |
| `services/asset/getAssetIdentity.ts` | Diagnostic-only lookup for Asset Analytics debug page. | Full | Possibly — Analytics phase |
| `services/asset/getAsset.ts` | Single-asset fetch by id, no joins. Used by `deleteVideo.ts`. | Full | No |
| `services/asset/getAssetSharingInfo.ts` | Viewer-scoped sharing info per assignment; enforces "collaborator never sees other collaborators" — the only enforcement point for that rule today (RLS off on those tables). | Full | Possibly — Promotion phase (privacy pattern precedent) |
| `services/asset/publishCampaignElementAsAsset.ts` | Type-1 (Campaign Element) asset creation via RPC `publish_campaign_element_as_asset`. | Full | Yes — Campaign phase |
| `services/asset/addToLibrary.ts` | Sets `assets.added_to_library_at`, idempotent. | Full | No |
| `services/asset/importAsset.ts` | Type-3 (Resource) asset creation pipeline; `addToLibrary: true` hardcoded at creation, unlike Type-2. | Full | No |
| `services/asset/getAssetDetail.ts` | Page loader composing `getAsset` + type-branched resource resolution (video/resource/campaign_element). | Full | Possibly — Campaign phase (campaign_element branch) |
| `components/ImportAssetModal.tsx` | UI for Type-3 import flow. | Full | No |
| `services/assignment/listAssetsForAssignmentPicker.ts` | Campaign-scoped asset picker (`listAssetsForCampaign`), Type-1 + Type-2, no `asset_user_states` filter (confirmed gap). | Full | No — gap already recorded |
| `services/assignment/listLibraryAssetsForAssignmentPicker.ts` | Org+library-scoped asset picker, Type-2 + Type-3, no `asset_user_states` filter (confirmed gap). | Full | No — gap already recorded |

### Services — Video

| File | Responsibility | Inspection | Needed again? |
|---|---|---|---|
| `services/video/createVideo.ts` | Creates Asset (`assetType: 'video'`) and Video atomically, with compensation on failure. Confirms every Video has an Asset from creation, not later. | Full | No |
| `services/video/deleteVideo.ts` | Soft/hard delete policy keyed on `asset.added_to_library_at` (not `archived_at`). **Not yet wired into any UI** — both `VideoDetail.tsx` and `Videos.tsx` still use raw `.delete()` per its own docstring. Has defensive `ASSET_IN_USE` check acknowledging its own "not in library = no other references" assumption may not hold. | Full | Possibly — if Delete/Archive interaction question (Video Q3) is answered "yes, they should interact" |

### Services — Assignment / Promotion

| File | Responsibility | Inspection | Needed again? |
|---|---|---|---|
| `services/assignment/assignmentArchive.ts` | Personal archive CRUD for Assignment, same shape as Asset's. | Full | No — Assignment LOCKED |
| `services/promotion/promotionArchive.ts` | Personal archive CRUD for Promotion, same shape as Asset's. Docstring already raises owner/collaborator asymmetry questions relevant to Promotion phase. | Full | Yes — Promotion phase (primary file) |

### Data layer

| File | Responsibility | Inspection | Needed again? |
|---|---|---|---|
| `lib/dataStore.ts` | Zustand cache with `fetchVideos`/`fetchCampaigns`. **Confirmed unused by all 4 main pages** — no page in this investigation imports it. `fetchCampaigns` has no archive filter at all. | Full | Only if a page outside this investigation is found to use it |

### Database / SQL investigation already done (not files, but confirmed schema facts)

- Full column list for `assets`, `assignments`, `campaigns`, `promotions`, `videos`.
- Confirmed `archived_at` columns on: `campaigns`, `videos`, `asset_user_states`, `assignment_user_states`, `promotion_user_states`.
- Confirmed `deleted_at` only on `videos`.
- RLS policies for `assets`, `campaigns`, `videos` (org-membership-based; includes a hard-DELETE policy on `assets`, recorded as a known technical risk, not a blocker).
- Triggers: `protect_system_campaign_trigger`, promotion-locking triggers (`trg_lock_promotion`, `trg_lock_promotion_assets`), `trg_promotion_org_boundary`, `trg_require_promotion_campaign`.
- Functions: `restore_assignment_asset_access`, `restore_assignment_collaborator`, `restore_assignment_tracking_domain_access` — all sponsor-authorized, all restore-only (no matching "revoke" functions were inspected, only referenced in comments).
- Full table list for the `public` schema (43 tables).
- User-provided conceptual doc mapping the 3 Asset types' provenance chains (Campaign Element / Video Library / Resource) — already fully incorporated into the locked Asset section.

---

## FILES NEEDED BUT NOT YET INSPECTED

### Video (current phase — remaining)

| File | Why needed | Required or optional |
|---|---|---|
| `pages/VideoDetail.tsx` (remainder) | Only archive/restore/library sections read so far; full file may contain more archive-adjacent logic (e.g. edit flow interaction with archived state). | Optional — only if Video Q1–Q4 answers reveal a gap the partial read didn't cover |
| `services/redirect/buildCampaignRedirectJobs.ts` | Referenced by `createVideo.ts` for redirect link creation; relevant only if Video archive's effect on redirect links/historical data needs verifying beyond "confirmed untouched." | Optional |

### Promotion (not started)

| File | Why needed | Required or optional |
|---|---|---|
| `services/promotion/createPromotion.ts` | How a Promotion is created from an accepted Assignment — needed to understand the Assignment→Promotion transition referenced in Assignment's lock. | Required |
| `services/promotion/getPromotionDetail.ts` | Data shape Promotion Detail page uses — needed before evaluating archive/pause UI on that page. | Required |
| `pages/PromotionDetail.tsx` | Referenced repeatedly in the brainstorm doc as "already has every control" — needed to verify what remove-collaborator/pause mechanisms already exist before designing archive on top. | Required |
| `services/promotion/addPromotionAsset.ts` | Confirms how `promotion_assets` gets populated — needed for the Asset↔Promotion relationship question already flagged as unresolved in Asset's analysis. | Required |
| `services/promotion/promotionAssetDomainPolicy.ts` | Tracking-domain access rules — relevant to the brainstorm doc's "does archiving promotion affect tracking domain access" question. | Required |
| `services/assignment/removeCollaborator.ts` / `restoreCollaborator.ts` | Needed to determine whether "archive promotion" and "remove collaborator" are actually the same mechanism, as questioned in the brainstorm doc. | Required |
| `services/assignment/acceptInvitation.ts` | Needed to finally verify/refute the assumption "Assignment disappears once accepted" that Assignment's lock currently rests on without full code confirmation. | Optional — only if a later phase surfaces a contradiction; Assignment is not being reopened otherwise |
| DB: `promotions` RLS policies, `promotion_assets` schema/RLS | Not yet pulled — needed before locking any Promotion picker/analytics behavior. | Required |

### Campaign (not started)

| File | Why needed | Required or optional |
|---|---|---|
| `pages/CampaignDetail.tsx` | Not yet inspected — needed to see current Campaign-level archive UI beyond the list page. | Required |
| `services/campaign/saveCampaign.ts` | Campaign create/update logic — needed to confirm nothing already implicitly cascades on save. | Optional |
| `services/asset/publishCampaignElementAsAsset.ts` | Already inspected (Asset phase) — re-check for the Campaign→Campaign Element Asset cascade question specifically. | Required (re-read with Campaign lens, not a new file) |
| DB: `campaign_element_assets` RLS, `campaign_assets` schema/RLS | Not yet pulled. | Required |

### Uploaded but not yet inspected at all

| File | Status |
|---|---|
| `services/assignment/AssetPicker.tsx` | Uploaded earlier in this conversation but never actually read (content was not included in that turn's context). On disk, available if needed. |
| `pages/AssetDetail.tsx` | Same — uploaded, not read. Asset is already LOCKED without it; only needed if a contradiction requiring Asset's reopening surfaces. |

---

## CONVERSATION HANDOFF / CURRENT INVESTIGATION STATE

**Overall objective**: Define product + technical Archive semantics for 5 entities (Assignment, Asset, Video, Promotion, Campaign) before writing any implementation code. This document is the sole source of truth — a new conversation should not need the original chat history.

**Investigation order**: Assignment → Asset → Video → Promotion → Campaign → cross-entity/cascade/analytics/RLS/SQL finalization → implementation.

**Entity status**:
- Assignment — **LOCKED**
- Asset — **LOCKED**
- Video — **IN PROGRESS**
- Promotion — NOT STARTED
- Campaign — NOT STARTED

**Files inspected for current phase (Video)**: `createVideo.ts` (full), `deleteVideo.ts` (full), `getAssetDetail.ts` (full), `Videos.tsx` (full, from Audit phase), `VideoDetail.tsx` (partial — archive/restore/library-display sections only).

**Files still required for Video**: none confirmed-required yet — see "Files Needed" table above for optional follow-ups contingent on how Video Q1–Q4 are answered.

**Unresolved product questions (Video, asked, not yet answered)**:
1. Given the personal-vs-global conflict (Video archive is global; Asset archive is personal, zero-outward-cascade, already locked) — should Video archive affect the linked Asset at all, and if so: owner-only, all-collaborators, or informational-label-only?
2. Should cascade behavior (if any) differ depending on whether the Asset has ever been added to the library?
3. Should Archive and Delete interact at all, or remain fully independent as they are today?
4. Is `deleteVideo.ts` (currently unwired into any UI) in scope for this Archive investigation, or explicitly out of scope since it governs Delete, not Archive?

**Important constraints for the next conversation**:
- Do not implement any code, migrations, or new service files.
- Do not reopen Assignment or Asset unless a genuine contradiction is found in a later phase.
- Do not treat a Claude recommendation as a locked product decision — only the product owner's explicit confirmation locks something.
- Do not mark Video LOCKED until all 4 open questions above are answered or explicitly deferred.
- The `listAssetsForCampaign` / `listLibraryAssetsForAssignmentPicker` archive-filter gap is documented, confirmed, and explicitly **not to be fixed** until the full architecture is locked.

**What the next conversation should do first**: Read this document in full, especially the Video section's open questions above, and either (a) wait for the product owner to answer Video Q1–Q4, or (b) if the product owner provides `VideoDetail.tsx` in full or other optional files from the "Files Needed" table, incorporate them before re-asking the same 4 questions rather than assuming they're already answered.

**What it must not do**: Skip straight to Promotion or Campaign; assume Video is locked because the technical facts are clear; invent a product decision on the owner-vs-collaborator cascade question without explicit confirmation.

---

## LAST CONVERSATION SUMMARY / CONTINUATION PROMPT

```
CURRENT STATE:
Assignment = LOCKED
Asset = LOCKED
Video = IN PROGRESS
Promotion = NOT STARTED
Campaign = NOT STARTED

CURRENT PHASE:
Video Archive Investigation

ALREADY INSPECTED:
- pages/Videos.tsx (full)
- pages/VideoDetail.tsx (partial — archive/restore + library-display sections only)
- services/video/createVideo.ts (full)
- services/video/deleteVideo.ts (full)
- services/asset/getAssetDetail.ts (full)
(plus everything listed as LOCKED-relevant under Assignment/Asset in CODEBASE FILE MAP)

STILL NEEDED (optional, contingent on answers below):
- pages/VideoDetail.tsx remainder (full read)
- services/redirect/buildCampaignRedirectJobs.ts

CURRENT UNRESOLVED QUESTIONS:
1. Should Video archive cascade into its linked Asset — owner-only, all-collaborators, or label-only — given Asset archive is already locked as personal/zero-outward-cascade?
2. Should any such cascade differ based on whether the Asset has ever been added to the library?
3. Should Archive and Delete interact at all on Video?
4. Is deleteVideo.ts (unwired into UI) in scope for this investigation?

NEXT ACTION:
Wait for product owner's answers to Video Q1-4. Do not proceed to Promotion. Do not implement.

DO NOT:
- Implement archiveScope.ts or any archive code
- Modify any picker, page, or analytics file
- Mark Video LOCKED without explicit answers to all 4 questions
- Reopen Assignment or Asset without a proven contradiction
- Treat a recommendation as a locked decision
```

