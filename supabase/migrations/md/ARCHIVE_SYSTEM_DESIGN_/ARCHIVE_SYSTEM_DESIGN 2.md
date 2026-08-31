Archive is never a permission action. Permission actions (Remove Collaborator, Revoke Access) remain separate and must be performed explicitly by the user. Impact Guides only detect, explain, and navigate — they never execute permission changes.

This principle was confirmed during the Promotion phase and is binding for all entities.

---

## 1. Objective (provisional — do not finalize until all entities locked)

Archive is a visibility/state mechanism, not deletion. Archived entities are recoverable and should generally not appear in active/operational contexts, while historical analytics/revenue/session/conversion data must survive archiving.

## 2. Non-goals

- No permanent-delete/trash lifecycle beyond what already exists in the DB today (see §9 / known technical notes).
- No automatic cascade unless explicitly proven necessary by product decision, not inferred by convenience.
- No unification of Global vs Personal archive mechanisms into one shape — they are different by design (see §5).

## 3. Entity model

Confirmed entities requiring archive semantics: **Campaign, Video, Asset, Assignment, Promotion**.
Not yet evaluated: Marketer/Sponsor as first-class archive subjects, Tracking Domain.

## 4. Relationship map (as verified by code so far — not finalized)
Campaign
├── Videos (videos.campaign_id)
│     └── Video Library Assets (videos.asset_id → assets.id, asset_type='video')
├── Campaign Element Assets (campaign_element_assets.campaign_id → assets.id, asset_type='campaign_element')
└── Promotions (promotions.campaign_id)
Asset (3 provenance types, 1 archive mechanism — see §7)
├── assignment_assets (sharing/assignment)
├── campaign_assets (campaign-picker usage — NOT YET fully traced for Campaign phase)
└── promotion_assets (promotion usage — many-to-many, confirmed)
Assignment
└── assignment_collaborators → Promotion (promotions.assignment_id, promotions.assignment_collaborator_id)
textImported/Resource assets (Type 3) have **no campaign provenance** — confirmed, no `campaign_id` anywhere in their chain.

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
- Per product confirmation: in the UI, an Assignment disappears once the invitation is accepted, and this is already supported by existing code. No further investigation needed unless a future phase (Campaign) surfaces a contradiction.
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
5. **Recommended separation (unchanged):** `archived_by_role` is *state*, belongs on `asset_user_states`. Notifying collaborators when an owner archives is a *side-effect*, to live in a future service — proposed location `services/asset/assetNotifications.ts`, or a shared `services/notifications/` module if Video/Promotion/Campaign need the same "owner action informs downstream party" pattern (confirmed relevant in Promotion phase; still not built).

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

### Asset → Promotion downstream policy (LOCKED during Promotion phase — does not reopen Asset mechanism)

Asset Archive remains Personal + Zero Outward Cascade. The following is **downstream impact policy only**:

- Owner Archive Asset does **not** Archive any Promotion, does **not** modify `promotion_user_states`, does **not** automatically Remove Collaborator, does **not** automatically Revoke Access, does **not** write other users' `asset_user_states`.
- **Asset Archive Impact Guide** (only for Promotions that still have **active Collaborator access**):
  1. Detect Promotions using this Asset with active Collaborator
  2. Explain that archiving does not automatically remove access
  3. List affected active Promotions
  4. Navigate Owner to each PromotionDetail
  5. Owner uses existing **Revoke Access**
  6. No automatic execution, no new permission mechanism
- Already-removed-Collaborator Promotions do not appear in the Guide and do not block Asset Archive.
- **Collaborator active picker eligibility (MVP derived operational rule)**: Owner-archived Asset must not appear in Collaborator active Asset pickers / Track New Content pickers. This is **not** writing Collaborator `asset_user_states`. Collaborator personal archive remains independent. Owner Restore Asset restores eligibility only; previously manual Revokes are not auto-restored.
- Asset Restore: only restores Owner's own `asset_user_states`; never auto-restores Access / Collaborator / Promotion.

---

## 8. Video — **LOCKED**

### Mechanism
- Global: `videos.archived_at`.
- Single write path: archive / restore only ever touch this column.
- Confirmed by code: `VideoDetail.tsx` `handleArchive` / `handleRestore` write only `videos.archived_at`. No Asset writes.

### Cascade
- **Zero outward cascade** into Asset, Assignment, Promotion, Campaign, or any `*_user_states` row.
- Video Archive never writes another user’s personal Asset archive state.

### Derived impact (Library-visible Assets only)
- Every Video has a linked Asset from creation (`createVideo.ts` creates Asset then Video atomically). That relationship is permanent.
- Impact rules are gated by library visibility:
  - When `added_to_library_at` **is set** **and** the linked Video has `archived_at` set:
    - AssetDetail surfaces detailed informational state (“Source Video Archived” or equivalent wording).
    - Assets list surfaces practical “Archived” state + Hide affordance.
    - Visible to any viewer who already has legitimate access to that Asset (owner + collaborators who already have access). This is informational only — not a permission change.
  - When `added_to_library_at` is **NULL**: no derived state, no Impact Guide. The linked Asset exists, but when `added_to_library_at` is NULL it is not considered a user-facing Library Asset for purposes of Video Archive impact.
- Derived state is **not** permission state and is **not** personal archive state.

### Personal actions remain personal and independent
- Hide Asset → writes only the current viewer’s `asset_user_states` (existing personal archive mechanism).
- Revoke Access remains the existing Promotion/assignment control. Video Archive does **not** invent a new Revoke Access button or treat Revoke Access as the same action as Archive.
- These personal actions are never performed automatically by Video Archive or Video Restore.

### Restore principle (hard rule)
- Restoring a Video only restores the source global state (`videos.archived_at = null`).
- Derived “Source Video Archived” disappears as a natural consequence of the source state change.
- Any subsequent personal Hide the user performed, and any Revoke Access the user performed, remain exactly as the user left them.
- Restore must **never** automatically undo later personal decisions.

### Central resolver (architectural requirement)
- One authoritative context layer determines an Asset’s personal archive state + source-Video impact.
- Pages and components **must consume** that result; they must not independently join or reconstruct `videos.archived_at`.
- Exact function name / file is an implementation choice (e.g. conceptually `getAssetArchiveContext(assetId, viewerId)`). The single-source-of-truth principle is required.
- Later Promotion-derived context must consume the same underlying source-of-truth architecture rather than re-tracing Video → Asset independently.

### Impact Guides (UX only)
- Archive Impact Guide and Restore Impact Guide are optional, interruptible, resumable, and re-enterable.
- They explain consequences and surface existing actions (Hide, existing Revoke, etc.).
- They are **not** the mechanism that writes archive state and must never secretly perform personal downstream actions.
- Archive Impact Guide is offered only when a Library-visible Asset is actually affected.
- Restore Impact Guide may contain one additional recovery step (e.g. if the Asset was personally Hidden, guide the user to restore it themselves). Exact multi-step copy is deferred; the architectural rule above is locked.

### Distinctions that must stay sharp
1. Global Video archive state (`videos.archived_at`)
2. Derived impact on its Library Asset (“Source Video Archived” / list “Archived”)
3. Personal Asset Hide/archive (`asset_user_states`)
4. Promotion access / existing Revoke
5. Optional Impact Guides

### Explicitly out of scope for Video Archive
- `deleteVideo.ts`, hard-delete paths, any Archive ↔ Delete interaction rules. Users can never hard-delete Videos through the UI; the capability is retained only for possible future developer use and is ignored by this architecture.
- Exact Promotion UI wording and controls (now covered under Promotion LOCKED).
- Campaign relationships (Campaign phase).

### Confirmed code facts that support the lock
- `createVideo.ts`: Asset is always created with the Video; there is no “video without asset” window.
- `VideoDetail.tsx`: archive/restore touch only `videos.archived_at`; “View Asset” link appears only when `added_to_library_at` is set.
- `getAssetDetail.ts`: already resolves the linked video origin; natural place to feed a central context resolver.
- Asset archive remains personal and zero-outward-cascade (already LOCKED); Video rules do not violate it.

### Video does **not** adopt Promotion’s “Remove Collaborator first” prerequisite
Video is source content; requiring cleanup of all downstream Promotions would create unacceptable UX. Video may Archive directly + derived impact + optional Guide. This boundary was explicitly reconfirmed during the Promotion phase and remains LOCKED.

---

## 9. Promotion — **LOCKED**

### Mechanism
- Personal: `promotion_user_states (promotion_id, user_id)`.
- Confirmed by code: `promotionArchive.ts` writes only this table; never touches `promotions.status`, `promotion_assets`, assignment_collaborators, redirect_links, tracking, analytics, attribution, or Stripe.
- **LOCKED PRODUCT/DESIGN DECISION (not yet implemented):** `promotion_user_states` will gain `archived_by_role` (`owner` | `collaborator`) as a snapshot written at archive time — never derived later via relationship tracing. Same rationale as Asset’s future `archived_by_role`. Actual migration/implementation is deferred until all entities are LOCKED.
- Meaning: this viewer does not want this Promotion in their own active/operational view.

### Absolute non-actions
Promotion Archive never:
- Archives Asset / Assignment / Campaign
- Modifies `promotions.status` or `promotion_assets`
- Automatically Removes Collaborator
- Automatically Revokes Access / Tracking Domain Access
- Writes other users’ archive state
- Deletes or suppresses historical analytics / revenue / events / conversions

### Sponsor Archive prerequisite
- If an **active Collaborator** exists → Archive button disabled / locked.
- UI: “Please remove the Collaborator before archiving this Promotion.”
- Navigate to existing PromotionDetail → use existing **Remove Collaborator** (confirmed: `removeCollaborator.ts` + PromotionDetail handlers; flips `assignment_collaborators.status` only).
- No requirement to Revoke Assets or Tracking Domains one-by-one.
- After Remove completes, Sponsor may Archive.
- Remove Collaborator and Archive are two completely different actions; Archive never auto-executes Remove.
- Sponsor identity is determined by `assignment.created_by_user_id` (LOCKED boundary, not organization membership).

### Collaborator Archive
- May Archive directly; affects only self.
- Sponsor does not see “Archived by Collaborator”, receives no notification, and their view is unchanged.

### “Archived by Owner”
- Informational / historical label only.
- **Not** a permission state.
- Does **not** mean Collaborator can still use the Promotion (Sponsor must Remove Collaborator before Archiving, so at Archive time there is no active Collaborator).
- May appear on historical minimal view / Marketplace historical surface if useful; do not add complex UI solely for this label.
- MVP: no notification system.

### Promotion Restore
- Only clears current user’s `archived_at = null` (via `restorePromotionForUser`).
- Never auto-restores Collaborator / Access / Asset / Domain.
- To restore collaboration → use existing Restore Collaborator.

### Promotion ↔ Asset independence
- Promotion Archive → Asset = Zero Cascade.
- Asset Archive → Promotion = Zero Automatic Cascade.
- Only informational / Guide impact when needed (see Asset §7 downstream policy, locked during this phase).

### Confirmed code facts that support the lock
- `promotionArchive.ts`: personal only; explicit architecture comment that archive is a view-level annotation, not a business action.
- `PromotionDetail.tsx`: full Remove/Restore Collaborator, Revoke/Restore Access (asset + domain), Allow collaborator domains, Add Asset — all existing and separate from archive.
- `getPromotionDetail.ts`: exposes `assets` (promotion_assets) and `assignedAssets` (assignment_assets + access states) as distinct sets; collaborator status; tracking domains with isRevoked.
- `removeCollaborator.ts` / `restoreCollaborator.ts`: permission actions only; do not touch archive tables.
- `addPromotionAsset.ts`: writes both assignment_assets (if needed) and promotion_assets so Access Management remains usable.
- One Asset can appear in many Promotions (`promotion_assets` many-to-many) — Impact Guide must list all active ones.
- After Remove Collaborator, `isRemovedSelf` in PromotionDetail shows only minimal historical view.

### Analytics
- Soft filter only.
- Historical data always preserved.
- Multi-viewer analytics behavior remains deferred to Analytics phase (same global deferral as Asset).

### Boundaries preserved (explicit)
- Promotion Archive does not Archive Asset.
- Asset Archive does not Archive Promotion.
- Asset Archive downstream effect on Promotion is Impact Guide, not automatic cascade.
- Owner-archived Asset → Collaborator picker is derived operational eligibility, not writing Collaborator archive state.
- Sponsor Archive requires prior Remove Collaborator.
- Promotion Restore does not auto-restore Collaborator / Access.
- Asset Restore does not auto-restore Access.
- Video does not adopt Promotion’s Remove Collaborator prerequisite.
- Analytics always retains historical data.

---

## 10. Campaign — NOT YET INVESTIGATED

## 11. Cascade Matrix

| Archive source | Target | Cascade? | Why | Status |
|---|---|---|---|---|
| Asset | Video | No | Asset archive has zero outward cascade — confirmed | LOCKED |
| Asset | Assignment | No | same | LOCKED |
| Asset | Promotion | No (Impact Guide only) | Zero automatic cascade; Guide leads to existing Revoke Access for active-Collaborator Promotions only | LOCKED |
| Asset | Campaign | No | same | LOCKED |
| Assignment | Asset/Video/Promotion/Campaign | No | Assignment archive has zero cascade — confirmed | LOCKED |
| Video | Asset | No (derived impact only when Library-visible) | Zero write cascade; informational “Source Video Archived” only for Library-visible Assets; personal Hide remains personal | LOCKED |
| Promotion | Asset | No | Zero cascade; independent | LOCKED |
| Campaign | Video | ? | Pending Campaign phase | TBD |
| Campaign | Asset | ? | Pending Campaign phase | TBD |
| Campaign | Promotion | ? | Pending Campaign phase | TBD |

## 12–30. (Picker behavior, Search, Analytics, Historical data, Archive labels/reasons, Restore, Permissions, RLS, SQL/schema, Required code changes, Files that must/must not change, Testing plan, Edge cases, Known risks, Deferred questions, Implementation phases)

Not started for Campaign — populated only after Campaign is locked, per agreed process. Cross-entity finalization (analytics multi-viewer, shared notification patterns, full implementation phases) occurs after Campaign is LOCKED.

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
| `pages/Videos.tsx` | Video list, archive/restore handlers (global `archived_at`), own `videosPageCache`. Contains the confirmed unfiltered-campaign-dropdown picker bug. | Video, Campaign (picker bug) | Full | Audit / Video | Possibly — if picker-bug fix scope is revisited |
| `pages/Assets.tsx` | In-page Asset list/picker, `archivedMap` construction via `getArchivedAssetIdsForUser`, own `assetsPageCache`. Correctly filters archived assets in its own picker. | Asset | Full | Audit / Asset | No — Asset LOCKED |
| `pages/Marketplace.tsx` | Assignment + Promotion lists, two independent personal archive maps, own three page caches. | Assignment, Promotion | Full | Audit / Assignment | Possibly — Marketplace list filter for removed-collaborator historical Promotions if Campaign phase needs it |
| `pages/VideoDetail.tsx` | Archive/restore write only `videos.archived_at`; library section gated on `added_to_library_at`; metrics, tracking links, edit modal. Full content inspected for Video lock. | Video | Full | Video | No — Video LOCKED |
| `pages/PromotionDetail.tsx` | Personal archive badge + Restore; Sponsor-only Remove/Restore Collaborator, Revoke/Restore Access (asset + domain), Allow collaborator domains, Add Asset, Assign Tracking Domain. Full content inspected for Promotion lock. | Promotion | Full | Promotion | No — Promotion LOCKED |

### Services — Asset

| File | Responsibility | Inspection | Needed again? |
|---|---|---|---|
| `services/asset/assetArchive.ts` | Personal archive CRUD: `getArchivedAssetIdsForUser`, `getAssetArchiveState`, `archiveAssetForUser`, `restoreAssetForUser`. Type-agnostic, keyed `(asset_id, user_id)`. | Full | No — Asset LOCKED |
| `services/asset/types.ts` | Shared `AssetType` union (`video`/`campaign_element`/`resource`), input/output shapes. | Full | No |
| `services/asset/resolveAssetType.ts` | Read-only badge lookup: asset id → type + org, graceful null on failure. | Full | No |
| `services/asset/getAssetIdentity.ts` | Diagnostic-only lookup for Asset Analytics debug page. | Full | Possibly — Analytics phase |
| `services/asset/getAsset.ts` | Single-asset fetch by id, no joins. Used by `deleteVideo.ts`. | Full | No |
| `services/asset/getAssetSharingInfo.ts` | Viewer-scoped sharing info per assignment; enforces "collaborator never sees other collaborators" — the only enforcement point for that rule today (RLS off on those tables). | Full | Possibly — Analytics phase |
| `services/asset/publishCampaignElementAsAsset.ts` | Type-1 (Campaign Element) asset creation via RPC `publish_campaign_element_as_asset`. | Full | Yes — Campaign phase |
| `services/asset/addToLibrary.ts` | Sets `assets.added_to_library_at`, idempotent. | Full | No |
| `services/asset/importAsset.ts` | Type-3 (Resource) asset creation pipeline; `addToLibrary: true` hardcoded at creation, unlike Type-2. | Full | No |
| `services/asset/getAssetDetail.ts` | Page loader composing `getAsset` + type-branched resource resolution (video/resource/campaign_element). Already resolves linked video origin — natural feed for central archive context resolver. | Full | Possibly — when implementing central resolver |
| `components/ImportAssetModal.tsx` | UI for Type-3 import flow. | Full | No |
| `services/assignment/listAssetsForAssignmentPicker.ts` | Campaign-scoped asset picker (`listAssetsForCampaign`), Type-1 + Type-2, no `asset_user_states` filter (confirmed gap). | Full | No — gap already recorded |
| `services/assignment/listLibraryAssetsForAssignmentPicker.ts` | Org+library-scoped asset picker, Type-2 + Type-3, no `asset_user_states` filter (confirmed gap). | Full | No — gap already recorded |

### Services — Video

| File | Responsibility | Inspection | Needed again? |
|---|---|---|---|
| `services/video/createVideo.ts` | Creates Asset (`assetType: 'video'`) and Video atomically, with compensation on failure. Confirms every Video has an Asset from creation, not later. | Full | No |
| `services/video/deleteVideo.ts` | Soft/hard delete policy keyed on `asset.added_to_library_at` (not `archived_at`). **Explicitly out of scope for Archive investigation.** | Full (read for context only) | No — out of scope |

### Services — Assignment / Promotion

| File | Responsibility | Inspection | Needed again? |
|---|---|---|---|
| `services/assignment/assignmentArchive.ts` | Personal archive CRUD for Assignment, same shape as Asset's. | Full | No — Assignment LOCKED |
| `services/promotion/promotionArchive.ts` | Personal archive CRUD for Promotion. Confirmed: view-level annotation only; never touches status/assets/collaborators/tracking/analytics. | Full | No — Promotion LOCKED |
| `services/promotion/createPromotion.ts` | Creates promotions + promotion_assets; Campaign membership + optional Assignment scope checks. | Full | No — Promotion LOCKED |
| `services/promotion/getPromotionDetail.ts` | Read-only loader; distinct `assets` vs `assignedAssets`; collaborator status; tracking domains with isRevoked. | Full | No — Promotion LOCKED |
| `services/promotion/addPromotionAsset.ts` | Writes assignment_assets (if needed) + promotion_assets so Access Management remains usable. | Full | No — Promotion LOCKED |
| `services/promotion/promotionAssetDomainPolicy.ts` | `allow_collaborator_domains` boolean on promotion_assets. Independent of archive/revoke. | Full | No — Promotion LOCKED |
| `services/assignment/removeCollaborator.ts` | RPC wrapper; flips status to removed. Permission action only. | Full | No — Promotion LOCKED |
| `services/assignment/restoreCollaborator.ts` | RPC wrapper; flips status back to active. Permission action only. | Full | No — Promotion LOCKED |
| `pages/AcceptInvitation.tsx` | Org member invitation only — not Assignment accept. | Full | No |

### Data layer

| File | Responsibility | Inspection | Needed again? |
|---|---|---|---|
| `lib/dataStore.ts` | Zustand cache with `fetchVideos`/`fetchCampaigns`. **Confirmed unused by all 4 main pages** — no page in this investigation imports it. `fetchCampaigns` has no archive filter at all. | Full | Only if a page outside this investigation is found to use it |

### Database / SQL investigation already done (not files, but confirmed schema facts)

- Full column list for `assets`, `assignments`, `campaigns`, `promotions`, `videos`.
- Confirmed `archived_at` columns on: `campaigns`, `videos`, `asset_user_states`, `assignment_user_states`, `promotion_user_states`.
- Confirmed `deleted_at` only on `videos`.
- Confirmed **no** `promotions.archived_at` (personal model is correct).
- RLS policies for `assets`, `campaigns`, `videos` (org-membership-based; includes a hard-DELETE policy on `assets`, recorded as a known technical risk, not a blocker).
- Triggers: `protect_system_campaign_trigger`, promotion-locking triggers (`trg_lock_promotion`, `trg_lock_promotion_assets`), `trg_promotion_org_boundary`, `trg_require_promotion_campaign`, `trg_backstop_promotion_asset`.
- Functions: `restore_assignment_asset_access`, `restore_assignment_collaborator`, `restore_assignment_tracking_domain_access` — all sponsor-authorized, all restore-only.
- Full table list for the `public` schema (43 tables).
- User-provided conceptual doc mapping the 3 Asset types' provenance chains (Campaign Element / Video Library / Resource) — already fully incorporated into the locked Asset section.
- `promotion_assets` is many-to-many (one Asset can belong to many Promotions) — confirmed and used by Impact Guide design.

---

## FILES NEEDED BUT NOT YET INSPECTED

### Campaign (next phase)

| File | Why needed | Required or optional |
|---|---|---|
| `pages/CampaignDetail.tsx` | Not yet inspected — needed to see current Campaign-level archive UI beyond the list page. | Required |
| `services/campaign/saveCampaign.ts` | Campaign create/update logic — needed to confirm nothing already implicitly cascades on save. | Optional |
| `services/asset/publishCampaignElementAsAsset.ts` | Already inspected (Asset phase) — re-check for the Campaign→Campaign Element Asset cascade question specifically. | Required (re-read with Campaign lens) |
| DB: `campaign_element_assets` RLS, `campaign_assets` schema/RLS | Not yet pulled. | Required |
| `pages/Campaigns.tsx` | Already partially inspected; full archive/restore handlers and filters to be re-confirmed in Campaign phase. | Required |

### Uploaded but not yet inspected at all

| File | Status |
|---|---|
| `services/assignment/AssetPicker.tsx` | Uploaded earlier but never actually read. Available if needed. |
| `pages/AssetDetail.tsx` | Same — uploaded, not read. Asset is already LOCKED without it; only needed if a contradiction requiring Asset's reopening surfaces. |

---

## CONVERSATION HANDOFF / CURRENT INVESTIGATION STATE

**Overall objective**: Define product + technical Archive semantics for 5 entities (Assignment, Asset, Video, Promotion, Campaign) before writing any implementation code. This document is the sole source of truth — a new conversation should not need the original chat history.

**Investigation order**: Assignment → Asset → Video → Promotion → Campaign → cross-entity/cascade/analytics/RLS/SQL finalization → implementation.

**Entity status**:
- Assignment — **LOCKED**
- Asset — **LOCKED** (mechanism + downstream Promotion impact policy)
- Video — **LOCKED**
- Promotion — **LOCKED**
- Campaign — **NOT STARTED**

**Important constraints for the next conversation**:
- Do not implement any code, migrations, or new service files.
- Do not reopen Assignment, Asset, Video, or Promotion unless a genuine contradiction is found in a later phase.
- Do not treat a Claude/Grok recommendation as a locked product decision — only the product owner's explicit confirmation locks something.
- The `listAssetsForCampaign` / `listLibraryAssetsForAssignmentPicker` archive-filter gap is documented, confirmed, and explicitly **not to be fixed** until the full architecture is locked.
- Do not begin Campaign until the product owner explicitly starts that phase and supplies the required files.

**What the next conversation should do first**: Read this document in full. Wait for the product owner to start the Campaign phase and provide the required Campaign files listed above. Do not invent Campaign decisions.

**What it must not do**: Assume Campaign is locked; invent product decisions without explicit confirmation; write implementation code; reopen any LOCKED entity without a proven contradiction.

---

## LAST CONVERSATION SUMMARY / CONTINUATION PROMPT
CURRENT STATE:
Assignment = LOCKED
Asset = LOCKED
Video = LOCKED
Promotion = LOCKED
Campaign = NOT STARTED
CURRENT PHASE:
Ready for Campaign Archive Investigation (do not start until product owner supplies files and explicitly begins the phase)
CORE PRINCIPLE (LOCKED):
Archive → Detect Impact → Explain Impact → Guide User → User explicitly performs Remove / Revoke
FORBIDDEN: Archive → Automatically Remove / Revoke
PROMOTION LOCK SUMMARY:

Personal via promotion_user_states
Sponsor Archive requires prior Remove Collaborator (existing action)
Collaborator may Archive directly (self only)
Zero cascade to Asset / Assignment / Campaign
“Archived by Owner” is informational/historical only
Restore clears only personal archive state
Asset → Promotion Impact Guide uses existing Revoke Access for active-Collaborator Promotions only
Owner-archived Asset → Collaborator picker = derived eligibility (not writing collaborator archive state)
archived_by_role = LOCKED design decision, migration deferred
Analytics soft filter; historical data always retained
Video does not adopt Promotion prerequisite

DO NOT:

Implement any archive code
Reopen Assignment / Asset / Video / Promotion without a proven contradiction
Begin Campaign until product owner starts that phase
Treat recommendations as locked decisions