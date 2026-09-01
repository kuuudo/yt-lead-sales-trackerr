# ARCHIVE SYSTEM — SOURCE OF TRUTH


Status: **Assignment = LOCKED (mechanism; L1/L2 explicitly DEFERRED, not decided) · Asset = LOCKED (mechanism + L1/L2) · Video = LOCKED (mechanism + L1/L2) · Campaign = LOCKED (mechanism + L1/L2) · Promotion = LOCKED (mechanism + L1/L2 + Archive Impact) · Analytics Archive Contract (single-viewer) = LOCKED (P2)**


**IMPLEMENTATION AUTHORIZED — Phases 1–4 (Asset, Video, Campaign, Promotion) COMPLETE. Analytics Archive Contract (P2) LOCKED for single-viewer charts — see §12b.** See "Implementation Status" / §11a for entity phases; §12b for analytics.

Investigation order: Assignment (LOCKED) → Asset (LOCKED) → Video (LOCKED mechanism + L1/L2) → Campaign (LOCKED mechanism + L1/L2) → Promotion (LOCKED mechanism + L1/L2 + Archive Impact) → Assignment L1/L2 decision (DEFERRED) → (doc finalized) → **Implementation (Phases 1–4 complete)**

Design/investigation phase is closed — do not reopen any LOCKED entity's mechanism or L1/L2 design unless a genuine contradiction between this doc and the actual code/schema is found during implementation. The line below is historical (it governed the investigation phase) and is superseded by the Implementation Status section for anything about Phase 1+:

~~Do not create `archiveScope.ts`, modify pickers, modify analytics, or write any archive-related code based on this document until every entity below is marked LOCKED...~~ — implementation phase is now authorized; see Implementation Status.

---

## Core Architecture Principle (LOCKED — applies to all entities)
Archive
→ Detect Impact
→ Explain Impact
→ Guide User
→ User explicitly performs Remove / Revoke
text**Forbidden:**
Archive
→ Automatically Remove / Revoke
textArchive is never a permission action. Permission actions (Remove Collaborator, Revoke Access) remain separate and must be performed explicitly by the user. Impact Guides only detect, explain, and navigate — they never execute permission changes.

This principle was confirmed during the Promotion phase and is binding for all entities (including Campaign).

---

## 1. Objective (provisional — do not finalize until all entities locked)

Archive is a visibility/state mechanism, not deletion. Archived entities are recoverable and should generally not appear in active/operational contexts, while historical analytics/revenue/session/conversion data must survive archiving.

## 2. Non-goals

- No permanent-delete/trash lifecycle beyond what already exists in the DB today (see known technical notes).
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
├── campaign_assets (campaign-picker usage)
└── promotion_assets (promotion usage — many-to-many, confirmed)
Assignment
└── assignment_collaborators → Promotion (promotions.assignment_id, promotions.assignment_collaborator_id)
textImported/Resource assets (Type 3) have **no campaign provenance** — confirmed, no `campaign_id` anywhere in their chain.

## 5. Archive semantics — Global vs Personal (CONFIRMED, cross-entity)

| Mechanism | Entities | Storage | Scope |
|---|---|---|---|
| **Global** | Campaign | `archived_at` column on the entity row itself | Shared fact — same answer for every viewer |
| **Personal** | Asset, Assignment, Promotion, Video *(migrated — see §8a)* | separate `*_user_states` table, `(entity_id, user_id)` unique | View-level annotation — one viewer's answer may differ from another's |

This split is confirmed by code (three `*Archive.ts` service files inspected), not assumed.

---

## 6. Assignment — **LOCKED**

- Personal, scoped `(assignment_id, user_id)`, via `assignment_user_states`.
- Zero cascade in any direction — confirmed, `assignmentArchive.ts` never touches `assignments.status`, `assignment_collaborators`, `assignment_invitations`, `promotions`, or any asset/tracking table.
- Does not cancel pending invitations, does not affect the other party, no notification.
- Per product confirmation: in the UI, an Assignment disappears once the invitation is accepted, and this is already supported by existing code. No further investigation needed unless a future phase surfaces a contradiction.
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


- **Single-viewer contexts**: soft filter, "Archived" label (distinguishing "by owner" vs "by you" once built), optional "Hide Archived," historical numbers never suppressed. **Concrete contract + implementation pattern: §12b Analytics Archive Contract (P2) — LOCKED.**
- **Org-shared/multi-viewer contexts**: **DEFERRED.** Deferred globally across all five entities at once (Promotion has the identical owner/collaborator structure), not solved per-entity, to avoid two different answers to the same structural question later.

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

## 8. Video — **LOCKED** (mechanism section below is HISTORICAL — see §8a for the implemented, current mechanism)

> **⚠ Superseded January–September 2026 migration:** everything in this §8 that says Video's archive mechanism is "Global" / stored on `videos.archived_at` describes the **original locked design**, not the current implementation. Video was migrated to a **Personal** mechanism (`video_user_states`), matching Asset/Assignment/Promotion. See **§8a** immediately following this section for the current mechanism, the reason for the change, and what's still deferred. This §8 body is preserved as historical record of the original design rationale (cascade rules, derived-impact rules, restore principles) — most of those rules are still conceptually accurate, only the storage location changed. Where a rule below specifically says `videos.archived_at` is *the* source of truth, read that as historical.

### Mechanism (historical — see §8a for current)
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
- Campaign relationships (Campaign phase — now LOCKED).

### Confirmed code facts that support the lock
- `createVideo.ts`: Asset is always created with the Video; there is no “video without asset” window.
- `VideoDetail.tsx`: archive/restore touch only `videos.archived_at`; “View Asset” link appears only when `added_to_library_at` is set.
- `getAssetDetail.ts`: already resolves the linked video origin; natural place to feed a central context resolver.
- Asset archive remains personal and zero-outward-cascade (already LOCKED); Video rules do not violate it.

### Video does **not** adopt Promotion's "Remove Collaborator first" prerequisite
Video is source content; requiring cleanup of all downstream Promotions would create unacceptable UX. Video may Archive directly + derived impact + optional Guide. This boundary was explicitly reconfirmed during the Promotion phase and remains LOCKED.

---

## 8a. Video Personal Archive Migration — **IMPLEMENTED** (supersedes §8's "Global" classification)

### What changed and why
Video archive was changed from **Global** (`videos.archived_at`, same answer for every viewer) to **Personal** (`video_user_states`, one row per `(video_id, user_id)`), matching the existing Asset/Assignment/Promotion pattern. Product requirement: if one user archives a Video, that must be that user's own view only — it must not appear archived to other users who can also see that Video (e.g. a different org member, or a viewer the Video was shared to).

### New mechanism
- Personal, scoped `(video_id, user_id)`, via `video_user_states`.
- Schema (verified against live Supabase, matched byte-for-byte to `asset_user_states`'s actual columns/RLS via `information_schema` + `pg_policies` queries, not assumed):
  - `id uuid primary key default gen_random_uuid()`
  - `video_id uuid not null references videos(id)`
  - `user_id uuid not null references auth.users(id)`
  - `archived_at timestamptz` (nullable)
  - `created_at timestamptz not null default now()`
  - unique `(video_id, user_id)`
  - RLS enabled; policies: SELECT/INSERT/UPDATE where `user_id = auth.uid()`; **no DELETE policy** — matches Asset's pattern exactly.
- Restore clears `archived_at` to `null` via UPSERT — **never deletes the row**. Same convention as `asset_user_states`.

### `videos.archived_at` — now legacy, explicitly not deleted
- **Not the source of truth for personal Video archive anymore.** The column still physically exists in the `videos` table and is **not** dropped, **not** backfilled, and has **no new meaning invented for it**. It is simply unused by the current archive/restore write paths.
- **Historical-data gap, intentionally deferred:** rows where `videos.archived_at IS NOT NULL` (archived under the old global mechanism) have **no corresponding `video_user_states` row**. As of this migration, those Videos read back as **NOT archived** for every viewer until a backfill is explicitly decided and run. No backfill SQL has been written. This is a known, visible, deliberate gap — not a bug.

### Files that implement this (verification status noted per file)
| File | Role | Verification status |
|---|---|---|
| `services/video/getVideoArchiveContext.ts` | All 3 entry points (`getVideoArchiveContext`, `getVideoArchiveContextsForViewer`, `computeVideoArchiveContextsFromLoadedData`) now source the `'video'` reason from `video_user_states` scoped to `viewerId`, via new helpers `getPersonalArchivedAt(Bulk)`. Campaign reason logic (still global, `campaigns.archived_at`) and `archive_ui_visibility`/hidden logic untouched. | Mechanically diffed + `tsc --strict` verified in sandbox against a copy matching the delivered patch; product owner confirmed live deployment + testing. |
| `pages/Videos.tsx` | `handleArchiveVideo` / `handleRestoreVideoOwnArchive` write `video_user_states` via upsert (`onConflict: 'video_id,user_id'`). `videosPageCache` key changed from `effectiveOrgId` alone to `` `${effectiveOrgId}:${effectiveUserId}` `` (all 3 get/set call sites) since `archiveContextMap` now holds per-viewer data. | Mechanically diffed + syntax-checked in sandbox; product owner confirmed live deployment + testing (WebMood/Ali acceptance test passed — see below). |
| `pages/VideoDetail.tsx` | `handleArchive` / `handleRestore` write `video_user_states` via the same upsert pattern. | **Not independently re-verified by inspecting the file** — product owner reports it deployed and passed testing, but the uploaded copy of this file in the conversation that produced this doc update was still the pre-migration version. Flagging this gap rather than asserting it as confirmed. |

### Deployment-safety lesson (preserve — prevents repeating a real failure)
An earlier attempt deployed code querying `video_user_states` **before the table existed** in Supabase. `getVideoArchiveContextsForViewer` threw inside `AllAssetsAnalytics.tsx`'s data-loading pipeline; that page's single try/catch converts any exception into `setRows([])`, silently wiping all rows with no visible error. Root cause confirmed via console-log gap analysis, not guessed.
**Prevention rule:** database schema dependencies must be created and verified — `select * from video_user_states limit 1;` succeeding with no error — **before** deploying code that queries them. Table creation and code deploy must never be combined into one step that can be silently skipped.

### Acceptance test — passed (live-tested by product owner)
Scenario: Ali gives Asset A to WebMood. WebMood promotes Asset A using Video A. WebMood archives Video A in `Videos.tsx`.
- WebMood's `AllAssetsAnalytics.tsx` → Video A shows archived. ✅ confirmed.
- Ali's `AllAssetsAnalytics.tsx` → same Video A shows NOT archived. ✅ confirmed.
- `AllAssetsAnalytics.tsx` continues to load normally (no regression of the earlier failure). ✅ confirmed.
- `VideoDetail.tsx` archive/restore reported working by product owner. ⚠ not independently file-verified — see table above.

### Deliberately NOT changed as part of this migration
- `pages/AllAssetsAnalytics.tsx` — confirmed unchanged; generic consumer of the resolver, needed no edits.
- `lib/analyticsArchiveFilter.ts` — confirmed unchanged; pure filter, no DB access.
- `services/video/archiveUiVisibility.ts` — confirmed unchanged; this is the separate Level 1/Level 2 UI-visibility surface and must **not** be conceptually merged with `video_user_states`. It answers "is this hidden by this viewer," never "is this archived."
- `services/asset/getAssetArchiveContext.ts` — **intentionally not changed**, and this is a known open gap, not an oversight: this file has two locations (`resolveProvenanceReasons` single-asset path, `getVideoProvenanceRowsBulk` batch path) that read `video.archived_at` directly with **zero viewer scoping**, gated only by `isLibraryVisible`. Confirmed still present as of this doc update. Practical effect: today, Ali could still see "Source Video Archived" on Asset A's provenance if WebMood's archive were read through this path instead of through `getVideoArchiveContext.ts` directly — this file was out of scope for the current mission but is a real, confirmed, not-yet-closed gap for a future Asset Analytics phase (which may need to represent multiple Videos promoting one Asset, each with independent viewer-specific archive state).

### Known risks / deferred decisions (confirmed, not speculative)
1. Historical `videos.archived_at IS NOT NULL` rows are not backfilled into `video_user_states` — deliberately deferred, not decided.
2. `videos.archived_at` still physically exists on the `videos` table; not dropped.
3. `getAssetArchiveContext.ts`'s two ungated video-provenance reads are unfixed (see above) — real, not hypothetical.
4. `VideoDetail.tsx`'s current state was not independently file-verified in this documentation pass (see table above) — recommend re-upload for byte-level confirmation in a future session.
5. Future Asset Analytics may need one Asset ↔ multiple Videos, each independently viewer-scoped — not built, not part of this migration.

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

## 10. Campaign — **LOCKED**

### Mechanism
- Global: `campaigns.archived_at` (the only Campaign archive state).
- No `campaign_user_states`.
- No `archived_by_role`.
- Authorization: organization write permission / non-read-only users (matches current code). Do not invent single-owner / `owner_user_id` / `created_by_user_id` restriction.

### Absolute non-actions
Campaign Archive never:
- Writes `videos.archived_at`
- Writes any `asset_user_states` / `promotion_user_states`
- Automatically Removes Collaborator
- Automatically Revokes Access
- Automatically Archives Video / Asset / Promotion

### Derived informational states (read-time only)
When a Campaign is archived:
- **Video** (belongs to that Campaign) → `Campaign Archived`
- **Video Library Asset** (source Video belongs to that Campaign) → `Campaign Archived`
- **Campaign Element Asset** (directly belongs to that Campaign) → `Campaign Archived`
- **Promotion** (has Asset(s) from archived Campaign(s)) → derived impact such as “Some assets from archived campaigns” / “All assets from archived campaigns” (prefer non-technical wording)

These are **derived informational states only**. They are not personal archive state and not permission state. They do not mean the Promotion is archived, Collaborator is removed, or Access is revoked.

### Lists / Tabs (MVP intended)
- **Videos**: Active / Archived / Campaign Archived
- **Assets**: Active / Archived / Campaign Archived / Source Video Archived
- **Promotions**: Active / Archived / Campaign Archived Assets (or equivalent affected state)

Filters are derived views; no new archive columns.

### Impact Guide (MVP)
- Detect affected Videos / Assets / Promotions
- Explain impact (counts + navigation)
- Guide user to Videos.tsx / Assets.tsx / Promotions filtered lists/tabs
- Does **not** execute Archive / Hide / Remove / Revoke
- No multi-select cleanup Modal at Archive time (MVP)

### Picker / Operational Eligibility
- Archived Campaigns excluded from active operational Campaign pickers (Create Video Campaign selector, Create Assignment Campaign selector, other active Campaign pickers).
- Promotion creation selects Assets (not a Campaign selector). Archived Campaign’s Assets **may still be selected** into new Promotions.
- **Target / intended behavior**: Personal-archived Assets should be excluded from active Asset pickers for that viewer. Existing implementation gaps (e.g. `listAssetsForCampaign` / `listLibraryAssetsForAssignmentPicker` lack `asset_user_states` filter) are already documented under Asset and remain deferred until implementation phase.

### Restore
- Only: `campaigns.archived_at = null`
- All `Campaign Archived` derived states disappear naturally
- Never restores Video / Asset / Promotion / personal archives / Collaborator / Access / Tracking Domain
- User restores downstream items themselves via the corresponding surfaces

### Analytics
- Soft filter only
- Historical data always retained

### MVP boundaries
- No archive-time multi-select Modal
- Promotion MVP implements only Campaign-Archived derived impact
- Cross-user “My Archived Assets vs other’s Asset archive affecting my Promotions” tabs deferred; do not alter Asset LOCKED personal-archive visibility rules

### Confirmed code facts that support the lock
- `Campaigns.tsx`: archive/restore write only `campaigns.archived_at`; active list filters `archived_at IS NULL` + `is_system = false`
- `CampaignDetail.tsx`: restore + archived badge; no cascade writes
- `saveCampaign.ts`: never touches `archived_at`
- Relationships via `videos.campaign_id`, `campaign_element_assets.campaign_id`, `promotions.campaign_id`, `promotion_assets` (many-to-many across Campaigns)

### Core principle for Campaign
Campaign Archive
→ Global source state
→ No automatic cascade
→ Derived downstream impact
→ Impact Guide explains + navigates
→ User explicitly decides Archive / Hide / Remove / Revoke
text---

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
| Campaign | Video | No (derived informational only) | Global source → derived “Campaign Archived”; no write to videos.archived_at | LOCKED |
| Campaign | Asset | No (derived informational only) | Global source → derived “Campaign Archived”; no write to asset_user_states | LOCKED |
| Campaign | Promotion | No (derived informational only) | Global source → derived impact on assets from archived campaigns; no auto archive/remove/revoke | LOCKED |

## 11a. Implementation Status (living section — update as phases progress)

### Phase 1 — Asset + Central Archive Resolver: **COMPLETE** (per product owner confirmation)

**Built and typechecked (strict-mode `tsc`, zero errors) — implemented, deployed, and confirmed by product owner as done and verified:**

- `migrations/20260825000000_archive_ui_visibility.sql` — creates `archive_ui_visibility` per the Schema section below, with RLS (SELECT/INSERT/UPDATE/DELETE all scoped to `user_id = auth.uid()`).
- `services/asset/getAssetArchiveContext.ts` — the central resolver. `getAssetArchiveContext(assetId, viewerId)` for single-asset use (AssetDetail.tsx); `getAssetArchiveContextsForViewer(assets[], viewerId)` as a batch counterpart for the list page (Assets.tsx) — same reason logic, ~4 bulk queries total regardless of list size instead of N+1. Both are self-sufficient: they bulk-fetch `added_to_library_at` themselves rather than trusting a caller-supplied value.
- `services/asset/archiveUiVisibility.ts` — `hideAssetForUser`, `unhideAssetForUser` (DELETE-based, see Implementation Decision below), `getHiddenAssetIdsForUser`.
- `pages/Assets.tsx` — Level 1 "Archive Tab" (inline section, one row per Asset, each reason with its own action, plus Hide), Level 2 "Hidden" modal (was "Archived" — now Unhide-only). Wired to `assetsPageCache` (see below).
- `pages/AssetDetail.tsx` — consumes the resolver instead of the old single-source `getAssetArchiveState`; renders every applicable reason with its own action; Level 2 collapses to a single Unhide action.
- `lib/assetsPageCache.ts` — `AssetsPageCacheData.archivedMap: Map<string,string>` replaced with `archiveContextMap: Map<string, AssetArchiveContext>`; `updateCachedArchivedMap` replaced with `updateCachedArchiveContextMap`. Cache-hit path now trusts `archiveContextMap` directly, same convention as `rows`/`sharedRows`/`assignedSummary`.

**Historical note — picker gap status:** earlier revisions of this doc flagged the Asset picker gap (`listAssetsForCampaign` / `listLibraryAssetsForAssignmentPicker`, née `listAssetsForAssignmentPicker.ts` naming discrepancy) as "Blocked — not started." Product owner has since confirmed Phase 1 complete as a whole. This investigation (current conversation) did not independently re-inspect the picker files to verify that specific gap was closed — flagging that distinction rather than silently asserting it was re-verified here. If the picker gap resurfaces during Campaign work (§10's Campaign picker gap is separate — `listCampaignsForOrg`, not yet inspected either), treat both as open items to raise, not settled facts.

### Implementation decisions made during Phase 1 (not previously pinned by this doc — recording them here now that they're real)

1. **Unhide = DELETE the `archive_ui_visibility` row** (confirmed by product owner). The Schema section below already said `hidden_at NOT NULL`, which implies this, but the doc hadn't stated the Unhide mechanism explicitly until now.
2. **Primary key shape**: migration uses a surrogate `id uuid primary key default gen_random_uuid()` plus a `unique (entity_type, entity_id, user_id)` constraint, rather than the composite `PRIMARY KEY (entity_type, entity_id, user_id)` shown in the Schema section below. Same uniqueness guarantee either way — flagging the deviation since the Schema section technically shows composite PK. Not re-opened as a design question, just noted so the schema block and the migration file agree going forward.
3. **Campaign-derived reason gating for Video-type Assets**: the "Campaign Archived" reason (reached via `videos.campaign_id`) is gated by the same `added_to_library_at IS NOT NULL` check as the "Source Video Archived" reason, for consistency — a Campaign-Archived impact on an Asset only surfaces once that Asset is actually a visible Library Asset. The Campaign section (§10) didn't pin this down explicitly for the Asset-level reason (it's clear for Video's own derived impact in §8, less so for how that composes through to Asset). Treated as a technical implementation choice, not a design reinterpretation — flagged, not silently assumed.
4. **Type 1 (campaign_element) Campaign-derived reason is NOT gated by `added_to_library_at`** — Campaign Element Assets have no such gate anywhere in this doc; they're native and always visible. Only the Type 2 (video) path above has the gate.

### Phase 2 — Video: **COMPLETE**

**Built, typechecked, and manually patched into the live files by the product owner (Ctrl+F/caveman-mode patch process, verified against re-uploaded post-patch files before being marked complete here):**

- `services/video/getVideoArchiveContext.ts` — central resolver, mirrors `getAssetArchiveContext.ts`'s shape for the Video entity. `getVideoArchiveContext(videoId, viewerId)` (VideoDetail.tsx), `getVideoArchiveContextsForViewer(videos[], viewerId)` (batch, unused in the shipped page in favor of the loaded-data variant below), and `computeVideoArchiveContextsFromLoadedData(videoRows, campaignRows, viewerId)` — the variant actually wired into `Videos.tsx`, reusing rows already in memory from `fetchData()` instead of a second Supabase round trip.
- `services/video/archiveUiVisibility.ts` — `hideVideoForUser`, `unhideVideoForUser` (DELETE-based, same convention as Asset), `getHiddenVideoIdsForUser`. Deliberately duplicated from the Asset version rather than generalized — explicit Phase 2 product decision, not revisited.
- `pages/Videos.tsx` — DB-level `archived_at` filter removed from the active fetch (was excluding Level 1 videos, and Campaign-archived-but-not-self-archived videos, from ever loading); `archiveContextMap` state computed via `computeVideoArchiveContextsFromLoadedData` inside `fetchData`; Active view (`filteredVideos`) excludes any video at `level !== 'normal'`; platform tab row now ends with an `ARCHIVE (n)` tab (Level 1, mutually exclusive with platform filters) and a `HIDDEN (n)` button (Level 2); Level 1 Archive Tab renders one row per video with each applicable reason (`Video Archived` → Restore; `Campaign Archived: <name>` → Go to Campaign, no restore) plus a per-row Hide button; old "Archived Videos" modal repointed to Level 2 only (`level === 'level2'`), its "Restore Selected" rewritten to call `unhideVideoForUser` instead of clearing `archived_at`.
- `pages/VideoDetail.tsx` — consumes `getVideoArchiveContext` instead of reading `video.archived_at` directly; header badge renders every applicable reason independently; Restore button only shows/acts when a `'video'` reason is present; new "Go to Campaign" button (`navigate(\`/campaigns/${campaignId}\`)`, confirmed against `App.tsx`'s actual `/campaigns/:id` route — not guessed) shows only when a `'campaign'` reason is present and never restores anything; new Hide/Unhide toggle button wired to `hideVideoForUser`/`unhideVideoForUser`.
- `lib/videosPageCache.ts` — `VideosPageCacheData.archiveContextMap: Map<string, VideoArchiveContext>` added alongside `videos`/`campaigns`/`allLeadMagnets`; both `fetchData()` cache-write call sites in `Videos.tsx` updated to populate it; cache-hit path reads it back with a `?? new Map()` fallback for any cache entries written before this field existed.

**Verification performed this phase (worth preserving, not summarizing away):** the implementation was delivered as Ctrl+F "caveman mode" patches across several turns because the product owner applies edits manually rather than accepting a full-file rewrite. After each patch round, the product owner re-uploaded the actual post-patch file and it was re-inspected line-by-line (not just grepped for keyword presence) against every LOCKED requirement in §8/§12 before being marked complete — including confirming the old `.is('archived_at', null)` DB filter was actually gone, both `videosPageCache.set()` call sites actually included `archiveContextMap`, Hide/Unhide never touch `archived_at`, and Restore vs. "Go to Campaign" are correctly split by reason type.

**No new implementation decisions beyond what §8/§12 already pinned** — Video's mechanism (global `archived_at`, no `*_user_states`) meant no Campaign-derived-Asset-style gating question arose the way it did for Asset in decision #3 above.

### Phase 3 — Campaign: **COMPLETE** (deployed and manually tested successfully by product owner)

**Built, typechecked, delivered as Ctrl+F/caveman-mode patches, manually applied by the product owner, deployed, and confirmed via manual end-to-end testing:**

- `services/campaign/getCampaignArchiveContext.ts` — central resolver, mirrors `getAssetArchiveContext.ts`/`getVideoArchiveContext.ts`'s shape but simplified for Campaign's single-reason model (no derived upstream reasons, no `*_user_states`). `getCampaignArchiveContext(campaignId, viewerId)` (CampaignDetail.tsx, single) and `getCampaignArchiveContextsForViewer(campaigns[], viewerId)` (Campaigns.tsx, batch — splits fetched archived Campaigns into Level 1 / Level 2 for the viewer).
- `services/campaign/archiveUiVisibility.ts` — `hideCampaignForUser`, `unhideCampaignForUser` (DELETE-based, same convention as Asset/Video), `getHiddenCampaignIdsForUser`. Deliberately duplicated from the Video version rather than generalized.
- `pages/Campaigns.tsx` — active list unchanged (was already correct); archived Campaigns now fetched eagerly so Level 1/Level 2 counts are accurate on load; new inline **Level 1 Archive Tab** (shown only when non-empty), one row per Campaign, **Restore** + **Hide** per row; existing "Archived" modal repointed to the **Level 2 Hidden surface** — header renamed `HIDDEN (n)`, bulk restore rewritten to **Unhide Selected** (never touches `archived_at`); `handleArchive` now refreshes the archived list so newly archived Campaigns appear in Level 1 immediately.
- `pages/CampaignDetail.tsx` — consumes `getCampaignArchiveContext`; header shows **Restore Campaign + Hide** at Level 1, **Unhide only** at Level 2 (never both) — enforces "Level 2 Restore = Unhide only" at the single-entity level.
- No new DB migration — `archive_ui_visibility` already allowed `entity_type='campaign'` per the Phase 1 migration's check constraint.
- No new page cache — explicitly declined by product owner for this phase.

**Verification performed this phase:** delivered as Ctrl+F caveman-mode patches (2 new files + patches across `Campaigns.tsx`/`CampaignDetail.tsx`), manually applied, deployed, and manually tested end-to-end by the product owner — confirmed success (archive → Level 1 → Hide → Level 2 → Unhide → Level 1 → Restore → back to Active). `campaigns.archived_at` confirmed never written by Hide/Unhide during testing.

**Known open item, unchanged from preflight:** the Campaign picker gap (`listCampaignsForOrg` not filtering archived Campaigns out of active pickers) remains unverified — not blocking Phase 3 completion; still deferred.

### Phase 4 — Promotion: **COMPLETE** (deployed; Surface A manually tested successfully by product owner, Surface B deployed/confirmed working with follow-up display polish)

**Built, typechecked, delivered as Ctrl+F/caveman-mode patches, manually applied by the product owner:**

- `services/promotion/archiveUiVisibility.ts` — `hidePromotionForUser`, `unhidePromotionForUser` (DELETE-based, same convention as Asset/Video/Campaign), `getHiddenPromotionIdsForUser`. `entity_type='promotion'`. Surface A only.
- `services/promotion/getPromotionArchiveContext.ts` — central Surface A resolver, mirrors `getCampaignArchiveContext.ts`'s shape but condition is personal (`promotion_user_states.archived_at`, scoped to viewer) rather than global. `getPromotionArchiveContext(promotionId, viewerId)` (PromotionDetail.tsx, single) + batch variant (parity with other entities, not currently called by Marketplace.tsx, which keeps its own `archivedPromotionMap`/`hiddenPromotionSet`).
- `services/promotion/getPromotionAssetArchiveImpact.ts` — Surface B, per-promotion. Takes a promoted asset id list + viewerId, calls the existing single-entry `getAssetArchiveContext` per asset (no second Asset archive calculation), returns `{ archivedAssetCount, impacts[] }`. Diagnostic only — no writes, no L1/L2, no automatic Remove/Revoke.
- `services/promotion/getPromotionArchiveImpactForViewer.ts` — Surface B, Marketplace-level orchestrator. Bulk-reads `promotion_assets` (confirmed many-to-many table) to map `promotionId → assetId[]`, then calls the existing `getPromotionAssetArchiveImpact` once per promotion in parallel. The only new query; does not duplicate Asset archive logic.
- `services/asset/getAssetTitlesBulk.ts` — bulk, read-only Asset title lookup (`asset_resources.title` / `videos.video_title` / `campaign_element_assets.display_name`, same precedence as `getAssetDetail.ts`, deliberately duplicated rather than generalized). Used only to label Archive Impact rows with a real Asset name instead of a truncated id.
- `pages/Marketplace.tsx` — `promotionsView` extended to `'active' | 'level1' | 'impact'`. Level 1 = new inline "Archived" view (Restore + Hide per row). Existing "Archived Promotions" modal repurposed to the **Level 2 Hidden surface** (title → "Hidden Promotions", bulk action → **Unhide Selected**, never Restore). New **Archive Impact** tab/button (Surface B) lists My-Promotions-only rows with `archivedAssetCount > 0`, each with a "⚠ Contains N archived asset(s)" banner, per-asset lines (real title via `getAssetTitlesBulk`, falls back to truncated id), and a "Go to Asset" button (`/assets/${assetId}`). Archive Impact fetch/state is fully independent of `archivedPromotionMap`/`hiddenPromotionSet` — never mutates Surface A state.
- `pages/PromotionDetail.tsx` — swapped `getPromotionArchiveState` for `getPromotionArchiveContext` (adds `level`). Restore + Hide shown at Level 1; Unhide-only shown at Level 2 (never both, never Restore at Level 2). New read-only Archive Impact banner in the Promoted Assets section (Surface B, via `getPromotionAssetArchiveImpact`) — no Hide/Unhide, no Remove/Revoke wiring.
- No new DB migration — `archive_ui_visibility` already allowed `entity_type='promotion'` per the Phase 1 migration's check constraint (same precedent as Campaign's Phase 3).
- `promotionArchive.ts` — **unchanged**. Surface A's underlying archive/restore mechanism was already correct; only the UI-visibility layer and Surface B were added on top.

**Verification performed this phase:** delivered as Ctrl+F caveman-mode patches (5 new files + patches across `Marketplace.tsx`/`PromotionDetail.tsx`), manually applied, deployed. Surface A confirmed via manual end-to-end testing by product owner (archive → Level 1 → Hide → Level 2 → Unhide → Level 1 → Restore → back to Active; `promotion_user_states.archived_at` confirmed untouched by Hide/Unhide). Surface B confirmed deployed and functioning (screenshot-verified: Archive Impact tab correctly showed a Promotion with 1 archived personal-reason Asset, without archiving/removing/revoking anything); two small display-only follow-up patches applied after initial verification (real Asset titles via `getAssetTitlesBulk`, "Go to Asset" navigation button) — no changes to Surface A, Surface B's archive-detection logic, or `getPromotionAssetArchiveImpact.ts`/`getPromotionArchiveImpactForViewer.ts` during those follow-ups.

**Known open items, unchanged from preflight:** Asset picker gap and Campaign picker gap (`listCampaignsForOrg`) both remain deferred/unverified — not part of Phase 4 scope, not blocking Phase 4 completion.

### Next step

All 4 implementation phases (Asset, Video, Campaign, Promotion) are complete and manually tested. Remaining open items are pre-existing and deferred, not new: the Asset picker gap, the Campaign picker gap (`listCampaignsForOrg`), and the Assignment Level 1/Level 2 product decision (explicitly deferred, not an open bug). None block calling the Archive System implementation complete.

## 12. Cross-Entity Archive View Rules — **LOCKED**

This section defines the cross-entity UX and restore-routing rules for Archive surfaces. It does not reopen or modify any entity’s archive mechanism (Global vs Personal, cascade, or storage).

### Core principle

**Derived archive impact is entity-specific.**

- **Assets / Videos** enter their own Archived View when an applicable archive condition makes them excluded from active operational views. The condition may be their own archive state or an applicable derived upstream archive impact.
- **Promotions** are the explicit exception: a Promotion affected only by archived Assets/Campaigns remains in My Promotions and receives only an informational state, unless the Promotion itself is personally archived.

Existing UI already has an **ARCHIVED button + modal/section** (e.g. Assets “ARCHIVED (1)” → Archived Assets modal). These rules align with that surface; they do not invent a third Archive UI.

### Two-level Archive UI
NORMAL (All / My / Shared / Assigned / Active …)
│
│  archive condition applies
▼
┌───────────────────────┐
│  LEVEL 1              │
│  Archive Tab          │  ← new Archive Tab / primary Archive View
└───────────────────────┘
│
│  Hide
▼
┌───────────────────────┐
│  LEVEL 2              │
│  Existing ARCHIVED    │  ← existing ARCHIVED button + modal
│  Modal / Section      │
└───────────────────────┘
│
│  Restore (Modal) = Unhide only
▼
┌───────────────────────┐
│  LEVEL 1              │
│  Archive Tab          │
└───────────────────────┘
│
│  Restore (true source)
▼
NORMAL  (only when Final Leave Rule is satisfied)
text| Level | What it is | Entry condition | Primary actions |
|-------|------------|-----------------|-----------------|
| **Level 1 — Archive Tab** | Primary Archive View | Item has any applicable personal / global / derived archive condition | **Restore [Source]**, **Hide** |
| **Level 2 — Existing ARCHIVED Modal** | Existing ARCHIVED button + modal | User pressed **Hide** on Level 1 | **Restore** = Unhide only → return to Level 1 |

### Hide

- **Hide** moves an item from **Level 1 Archive Tab** to **Level 2 Existing ARCHIVED Modal**.
- Hide does **not** change archive eligibility; the item remains Archived.
- Hide must **never** return the item to NORMAL / Active operational views.
- Hide ≠ Restore of any source state.

Product concept: **Hide from Archive Tab** (move to existing ARCHIVED Modal), not “permanently hide from all Archived surfaces”.

### Two distinct meanings of Restore

**Level 2 Restore (inside Existing ARCHIVED Modal)**  
= **Unhide only**  
- Moves item back to Level 1 Archive Tab  
- Must **never** modify personal / global / derived archive source state  
- Must **never** return the item to NORMAL

**Level 1 Restore (inside Archive Tab)**  
= **Restore the true archive source**

| Displayed reason | Button | Actual action |
|------------------|--------|---------------|
| Archived by You (Asset) | Restore Asset | Clear `asset_user_states` |
| Campaign Archived | Restore Campaign | Navigate to Campaign → clear `campaigns.archived_at` |
| Source Video Archived | Restore Video | Navigate to Video → clear `videos.archived_at` |
| Video itself Archived | Restore Video | Clear `videos.archived_at` |
| Promotion itself Archived | Restore Promotion | Clear `promotion_user_states` |

After any Level 1 Restore, **re-evaluate the Final Leave Rule**.

### Multiple simultaneous archive reasons

An Asset or Video may have **multiple simultaneous archive impacts**.  
Each impact retains its own source and Restore destination.  
Restoring one source removes **only that source’s impact**.  
The item **remains in Level 1 Archive Tab** while any other applicable archive condition still applies.

Example (Asset):
Asset X
├── Campaign Archived     → [Restore Campaign]
└── Source Video Archived → [Restore Video]
textRestore Campaign only → Campaign impact gone, Video impact remains → still Level 1.

Example (Video):
Video X
├── itself Archived (videos.archived_at)
└── Campaign Archived
textRestore Video only → `videos.archived_at = null`, Campaign still archived → still Level 1, show Restore Campaign.

### Final Leave Archived View Rule

> An item leaves **Level 1 Archive Tab** and returns to NORMAL **only when** no applicable personal/global archive state and no applicable derived archive impact remains.

This rule applies to both **Asset** and **Video**.

### Entity-specific behavior summary

**Assets.tsx**  
Active: All / My / Shared / Assigned  
Level 1 Archive (show only when content exists):

| Group | Source | Primary action |
|-------|--------|----------------|
| Archived by You | `asset_user_states` | Restore Asset + Hide |
| Campaign Archived | derived | Restore Campaign + Hide |
| Source Video Archived | derived | Restore Video + Hide |

**Videos.tsx** — Level 1 / Level 2 (**LOCKED**)

Active list: only Videos with **no** applicable archive condition
(`videos.archived_at IS NULL` **and** parent Campaign is not archived).
Campaign Archived is an **excluding** condition (not a mere Active-list label),
per the §12 mutual-exclusion rule. A Video under an archived Campaign leaves Active
and enters Level 1 even if `videos.archived_at` is still null.

Level 1 — Video Archive Tab (show only when content exists):
- One row per Video; multiple reasons may appear on the same row.
- Reasons / actions:

| Group | Source | Primary action |
|-------|--------|----------------|
| Archived | `videos.archived_at` set | Restore Video + Hide |
| Campaign Archived | parent Campaign `archived_at` set | Restore Campaign + Hide |

- Hide → UPSERT `archive_ui_visibility` (`entity_type='video'`, `hidden_at=now()`) → Level 2.
  Never modifies `videos.archived_at` or `campaigns.archived_at`.
- Level 2 = existing Archived Videos modal/section, redefined as visibility surface
  (applicable archive condition **and** viewer has a hidden row). Level 2 Restore = **Unhide only**
  (delete/clear the viewer’s `archive_ui_visibility` row) → return to Level 1.
  Level 2 must never clear `videos.archived_at`.
- Level 1 Restore targets the true source of the displayed reason, then re-evaluates the Final Leave Rule:
  - Restore Video → clear `videos.archived_at`
  - Restore Campaign → navigate to Campaign → clear `campaigns.archived_at`
  - If any applicable condition remains → stay in Level 1; if none remain → return to NORMAL/Active.
- Multiple simultaneous reasons: the Video appears once; each reason keeps its own Restore destination.
  Restoring one reason removes only that impact.

Archive reason determination (explicit):
- Reasons are **read-time derived** by the central archive resolver from the true sources
  (`videos.archived_at`, parent Campaign `archived_at`).
- Do **not** store reasons on the Video row.
- Do **not** add `archive_level`, `archive_reason`, `archived_reason`, or `archive_source_*` columns to `videos`.
- Do **not** create a Video-specific mutable impact/reason table.
- `archive_ui_visibility` controls **only** Level 1 ↔ Level 2 for the current viewer;
  it never answers “why is this archived?”.

Confirmed code gap (implementation later, not now):
- Current modal lists only `videos.archived_at IS NOT NULL` and Restores by clearing `archived_at`.
- Active list does not yet exclude Campaign-archived Videos.
- No Level 1 Tab / Hide yet.

**Campaigns.tsx** — Level 1 / Level 2 (**LOCKED**)

Active list: only Campaigns with **no** applicable archive condition
(`campaigns.archived_at IS NULL`, and existing `is_system = false` rule remains).
Archived Campaign leaves Active and enters Level 1.

Level 1 — Campaign Archive Tab / section (show only when content exists):
- One row per Campaign.
- Single reason only:

| Group | Source | Primary action |
|-------|--------|----------------|
| Archived | `campaigns.archived_at` set | Restore Campaign + Hide |

- Hide → UPSERT `archive_ui_visibility` (`entity_type='campaign'`, `hidden_at=now()`) → Level 2.
  Never modifies `campaigns.archived_at`.
- Level 2 = existing Archived Campaign surface, redefined as visibility surface
  (applicable archive condition **and** viewer has a hidden row). Level 2 Restore = **Unhide only**
  (delete/clear the viewer’s `archive_ui_visibility` row) → return to Level 1.
  Level 2 must never clear `campaigns.archived_at`.
- Level 1 Restore → clear `campaigns.archived_at`, then re-evaluate the Final Leave Rule.
  Because Campaign has only one possible reason, clearing it always returns the item to NORMAL/Active.
- Campaign Archive never automatically Restores / Removes / Revokes / Archives any downstream
  Video / Asset / Promotion / personal state / Collaborator / Access / Tracking Domain.
  Downstream derived “Campaign Archived” states disappear naturally when the source is restored;
  users restore personal/permission states themselves via the corresponding surfaces.

Archive reason determination (explicit):
- Single reason is **read-time derived** by the central archive resolver from `campaigns.archived_at`.
- Campaign is an upstream source in the archive chain; it has no further upstream derived condition.
- Do **not** store reason on the Campaign row.
- Do **not** add `archive_level`, `archive_reason`, `archived_reason`, or `archive_source_*` columns to `campaigns`.
- Do **not** create a Campaign-specific mutable impact/reason table.
- `archive_ui_visibility` controls **only** Level 1 ↔ Level 2 for the current viewer;
  it never answers “why is this archived?”.

Impact Guide (unchanged, remains outside Level 1/Level 2):
- Detect affected Videos / Assets / Promotions
- Explain impact (counts + navigation)
- Guide user to Videos.tsx / Assets.tsx / Promotions filtered lists/tabs
- Does **not** execute Archive / Hide / Remove / Revoke
- No multi-select cleanup Modal at Archive time (MVP)

Confirmed code gap (implementation later, not now):
- `Campaigns.tsx` already writes only `campaigns.archived_at` and filters Active by `archived_at IS NULL`.
- Existing restore path clears the source directly (must become Level-1-only; Level 2 becomes Unhide).
- No Level 1 Archive Tab / Hide / `archive_ui_visibility` yet.

**Marketplace / Promotions** — Level 1 / Level 2 + Archive Impact (**LOCKED**)

Promotion has **two completely separate surfaces**. They must never be merged.

#### Surface A — True personal Promotion archive (uses Level 1 / Level 2)

- Source: current viewer’s `promotion_user_states` only.
- Leaves **My Promotions**.
- Level 1 — **Archived Promotions** Tab (show only when content exists):
  - One row per personally archived Promotion.
  - Single reason: **Archived by You** (read-time from `promotion_user_states`).
  - Actions: Restore Promotion + Hide.
- Hide → UPSERT `archive_ui_visibility` (`entity_type='promotion'`, `hidden_at=now()`) → Level 2.
  Never modifies `promotion_user_states`.
- Level 2 = existing ARCHIVED Promotions modal/section (visibility surface).
  Level 2 Restore = **Unhide only** (delete/clear viewer’s visibility row) → return to Level 1.
  Level 2 must never clear `promotion_user_states`.
- Level 1 Restore → clear current user’s `promotion_user_states` → Final Leave Rule → return to My Promotions.
- Never auto-restores Collaborator / Access / Asset / Domain / Tracking.

#### Surface B — Archive Impact / Affected by archived Assets (NOT Level 1 / Level 2)

- Entry: Promotion has ≥1 Asset with an applicable archive condition (from Asset central resolver).
- **Does not** leave My Promotions.
- **Does not** write `promotion_user_states`.
- **Does not** use Level 1 / Level 2.
- **Does not** use `archive_ui_visibility` (not archive state of the Promotion).
- **No Hide / Unhide in MVP** (avoids dual meaning of Hide).
- Row content (example):
  - Count of archived Assets (1, 2, N)
  - Which Assets + per-Asset reason from **Asset central resolver**
    (Archived by You / Campaign Archived / Source Video Archived, …)
- Actions: navigate to Asset / Campaign / Video surfaces; optional explain.
  Does not execute Restore of those Assets; user restores on the corresponding entity surfaces.
- Name: **Archive Impact** / **Affected by archived Assets** — never call this “Archived Promotions.”

#### My Promotions membership (hard rule)

- My Promotions shows Promotions that are **not** personally archived by the current viewer.
- **Archive Impact is an additional diagnostic/impact surface.** It does **not** replace, filter, or alter My Promotions.
- A Promotion appearing in Archive Impact **must remain independently present in My Promotions**, unless the Promotion itself is personally archived via `promotion_user_states`.
- Even if 1, 2, or **all** Assets on a Promotion are archived, the Promotion is **not** archived and does **not** leave My Promotions.

Example:
```text
My Promotions
   ├── Promotion A
   ├── Promotion B
   └── Promotion C

Archive Impact
   ├── Promotion A → 2 archived Assets
   └── Promotion C → 1 archived Asset

A and C remain in My Promotions at the same time.
Explicit non-actions for Promotion

Do not add promotions.archived_at.
Do not add archive_level, archive_reason, archived_reason, or archive_source_* columns to promotions.
Do not create a Promotion-specific mutable impact/reason table.
Asset impact reasons are always read-time derived by the Asset central resolver — never stored on Promotion.
archive_ui_visibility (entity_type='promotion') is used only for Surface A Level 1 ↔ Level 2.
Derived Asset/Campaign impact never forces Level 1 entry and never removes the Promotion from My Promotions.


### Provenance / “why is this archived?”

- Do **not** add `archived_reason` / `archive_source_*` / `archive_level` / `archive_reason` columns on entity tables (including `videos`, `campaigns`, and `promotions`).
- Source of truth: `campaigns.archived_at`, `video_user_states` (Video — migrated from `videos.archived_at`, see §8a), `asset_user_states`, `promotion_user_states`.
- Central resolver (e.g. `getAssetArchiveContext` / shared archive context) is the single source for UI and Debug: personal/global state + list of derived impacts (type, sourceId, sourceName). Reasons are always read-time derived.
- Do **not** create a second mutable impact table (avoids dual source of truth).
- `archive_ui_visibility` answers only “Level 1 or Level 2 for this viewer?”; it never stores reasons.
- For Promotion Archive Impact (Surface B), per-Asset reasons come from the Asset central resolver only — never stored on the Promotion.

### Implementation order (AUTHORIZED — see §11a for live status)

| Phase | Scope | Status |
|-------|--------|--------|
| 0 | This section LOCKED (done) | Done |
| 1 | Assets.tsx + central resolver | **Complete** — see §11a |
| 2 | Videos.tsx (Level 1/Level 2 design LOCKED in this doc) | **Complete** — see §11a |
| 3 | Campaigns / CampaignDetail (Level 1/Level 2 design LOCKED in this doc) | **Complete** — see §11a |
| 4 | Marketplace / PromotionDetail (Level 1/Level 2 + Archive Impact design LOCKED in this doc) | **Complete** — see §11a |

Do not decide other entities’ UX during Phase 1. Assignment Level 1/Level 2 is explicitly DEFERRED (product owner's call — not an open question, not skipped by omission).


### Consistency with locked entities

No conflict with Asset / Video / Campaign / Promotion LOCKED mechanisms, zero-cascade rules, or the Core Architecture Principle.

### Level 1 / Level 2 UI Visibility Persistence — **LOCKED**

Level 1 and Level 2 are **UI visibility surfaces**, not archive states.

#### Schema (LOCKED design decision — migration deferred until Implementation Phase is authorized)

```sql
archive_ui_visibility
─────────────────────
entity_type   text        NOT NULL   -- 'asset' | 'video' | 'campaign' | 'promotion'
entity_id     uuid        NOT NULL
user_id       uuid        NOT NULL
hidden_at     timestamptz NOT NULL
created_at    timestamptz NOT NULL DEFAULT now()

PRIMARY KEY (entity_type, entity_id, user_id)
- `hidden_at` uses `timestamptz` (not boolean) for debug / audit / future cleanup.
- `entity_type` allowed values are strictly limited to: `'asset' | 'video' | 'campaign' | 'promotion'`.
- RLS: user may only SELECT / INSERT / UPDATE / DELETE rows where `user_id = auth.uid()`. Cross-user access is forbidden.

#### Strict separation

| Concept | Source of Truth |
|---------|-----------------|
| True archive state | `campaigns.archived_at`, `video_user_states.archived_at` (migrated from `videos.archived_at`, see §8a), `asset_user_states.archived_at`, `promotion_user_states.archived_at` |
| Level 1 ↔ Level 2 UI position | `archive_ui_visibility` only |

This table does **not** answer “is this item archived?”. It only answers “where does this viewer currently place an already-archived-condition item?”.

#### Resolver logic (unified)

1. Compute whether any applicable archive condition exists (personal / global / derived per entity rules).
2. If no condition → NORMAL (no visibility row should exist; optional cleanup of orphan rows).
3. If condition exists:
   - no row in `archive_ui_visibility` → **Level 1**
   - row with `hidden_at` set → **Level 2**

#### Existing ARCHIVED Modal

After implementation, the existing ARCHIVED modal becomes the **Level 2 surface**: items that have an applicable archive condition **and** a visibility row for the current viewer. It is no longer a direct list of personal/global `archived_at` rows alone. Pure derived items (e.g. Asset under Campaign Archived) can appear in Level 2 after Hide without being written as personal archive.

#### Entity mapping

| Entity | Archive condition (unchanged) | Level 1/2 controlled by | L1/L2 design status |
|--------|-------------------------------|-------------------------|---------------------|
| Asset | personal + Campaign/Video derived | `archive_ui_visibility` (type=`asset`) | LOCKED |
| Video | global + Campaign derived | `archive_ui_visibility` (type=`video`) | **LOCKED** (see Videos.tsx block above) |
| Campaign | global | `archive_ui_visibility` (type=`campaign`) | **LOCKED** (see Campaigns.tsx block above) |
| Promotion | personal only (`promotion_user_states`); derived Asset impact is separate Archive Impact surface (not L1/L2) | `archive_ui_visibility` (type=`promotion`) **only for Surface A** | **LOCKED** (see Marketplace / Promotions block above) |

#### Hide / Restore write rules

- **Hide (Level 1 → Level 2):** UPSERT `archive_ui_visibility` with `hidden_at = now()`. Underlying archive conditions unchanged.
- **Level 2 Restore:** DELETE (or clear) the viewer’s visibility row only → return to Level 1. Must never touch any `archived_at` or source state.
- **Level 1 Restore:** modify the true archive source per Restore Routing, then re-evaluate Final Leave Rule.

#### Explicit non-actions

- Do not add `archived_reason` / `archive_source_*` / `archive_level` / `archive_reason` columns on entity tables (including `videos`, `campaigns`, and `promotions`).
- Do not add `promotions.archived_at`.
- Do not create `asset_archive_impacts` or Promotion-specific mutable impact/reason tables.
- Do not write Hide into any `archived_at` or `*_user_states`.
- Do not alter any LOCKED archive mechanism.
- Reasons remain read-time derived by the central resolver; `archive_ui_visibility` stores only Level 1 ↔ Level 2 visibility (Promotion: Surface A only).
- Promotion Archive Impact (Surface B) never uses Level 1/Level 2 and never removes a Promotion from My Promotions.


## 12–30. (Picker behavior, Search, Analytics, Historical data, Archive labels/reasons, Restore, Permissions, RLS, SQL/schema, Required code changes, Files that must/must not change, Testing plan, Edge cases, Known risks, Deferred questions, Implementation phases)

Cross-entity finalization (analytics multi-viewer, shared notification patterns, full implementation phases) occurs after product owner authorizes implementation. Known gaps (Asset picker `asset_user_states` filters, listCampaignsForOrg archived filter, etc.) remain deferred until implementation phase.

---
## 12b. Analytics Archive Contract (P2) — **LOCKED (single-viewer)**

**Status:** LOCKED for single-viewer analytics. Multi-viewer / org-shared analytics remains DEFERRED (same global deferral as Asset/Promotion analytics policy).

**Purpose:** One reusable pattern so every future analytics chart can add Hide Archived + Archived badges **without** re-investigating cascade rules, resolvers, or DB schema.

**Core principle (unchanged):** Archive never suppresses historical metrics at the query/engine layer. Soft filter only. Cascade Matrix (§11) still holds: archiving one entity does **not** write another entity’s archive state; analytics may show derived labels via resolvers’ `isArchived` / `reasons` only.

---

### 12b.1 What is in scope / out of scope

| In scope (Entity Archive) | Out of scope (do not mix in) |
|---|---|
| Soft Hide Archived toggles per entity dimension the **page explicitly chooses** | Multi-viewer analytics |
| Read-only **Archived** badges on identity cells | Marketer archive (entity not evaluated — §3) |
| Reuse of central resolvers only | Promotion **Surface B** Archive Impact as an automatic filter on analytics rows |
| In-memory filter **after** metrics are computed | Query-level exclusion of archived entities that would change totals |
| | Writing `archive_ui_visibility` from analytics pages |
| | New archive business rules or cascade logic in charts |

**Hard rule:** Entity Archive filters and Archive Impact (Promotion Surface B) stay **completely separate**. Analytics Hide Archived uses Surface A / global / derived `isArchived` from resolvers only — never `getPromotionArchiveImpactForViewer` / `getPromotionAssetArchiveImpact` as a row filter unless a future product decision explicitly adds a separate optional Impact toggle (not implemented).

---

### 12b.2 Source of truth (do not reimplement)

| Entity | Resolver (batch preferred) | `isArchived` meaning |
|---|---|---|
| Asset | `getAssetArchiveContextsForViewer` / `getAssetArchiveContext` | Personal + derived (Video/Campaign reasons merged) |
| Video / Content | `getVideoArchiveContextsForViewer` / `getVideoArchiveContext` | Personal `video_user_states` (migrated — see §8a) + Campaign-derived as defined by Video resolver |
| Campaign | `getCampaignArchiveContextsForViewer` / `getCampaignArchiveContext` | Global `campaigns.archived_at` |
| Promotion | `getPromotionArchiveContextsForViewer` / `getPromotionArchiveContext` | **Surface A only** — personal `promotion_user_states` |

Charts must **not** invent cascade logic. They attach flags from these resolvers and pass booleans into the shared filter helper.

**Campaign / Promotion batch preload pattern (as used in AllAssetsAnalytics):**

- Campaign: load `campaigns.id, archived_at` for ids on the page → map to `{ id, archivedAt }` → `getCampaignArchiveContextsForViewer`.
- Promotion: load `promotion_user_states` for `(viewerId, promotion_ids)` → map to `{ id, archivedAt }` → `getPromotionArchiveContextsForViewer`.

This is data-feeding the LOCKED resolvers, not a new archive rule.

---

### 12b.3 Shared helper (new file)

**File:** `src/lib/analyticsArchiveFilter.ts`

**Rules for this file:**

- Pure functions only — **no** Supabase, **no** resolvers inside the helper, **no** DB writes.
- Does **not** define archive business rules; only filters rows that already carry archive flags.
- Does **not** touch `archive_ui_visibility`.
- Does **not** implement Marketer archive or Archive Impact.

**Contract (conceptual):**

```ts
// Flags already resolved on the row (or mapped from row)
type AnalyticsEntityArchiveFlags = {
  assetArchived?: boolean;
  videoArchived?: boolean;      // "Content" in AllAssetsAnalytics UI
  campaignArchived?: boolean;
  promotionArchived?: boolean;
};

type AnalyticsArchiveHideOptions = {
  hideArchivedAsset?: boolean;
  hideArchivedVideo?: boolean;
  hideArchivedCampaign?: boolean;
  hideArchivedPromotion?: boolean;
};

applyAnalyticsArchiveFilters(
  rows,
  getFlags,   // (row) => AnalyticsEntityArchiveFlags
  options,    // which Hide toggles are ON
): rows 

## Process rules for this document (do not skip)

1. All five entities are now LOCKED.
2. No implementation code, migrations, or new service files are written until product owner explicitly authorizes the implementation phase.
3. Do not reopen any LOCKED entity without a proven contradiction.
4. This file is updated at the end of every phase; existing evidence is preserved, not summarized away.

---

## CODEBASE FILE MAP

Only files actually inspected in this investigation are listed. "Inspected" means either full content was provided and read, or targeted `grep`/`view` was run against the file on disk. Partial inspection is marked explicitly — do not treat it as equivalent to a full read.

### Pages

| File | Responsibility (as observed) | Entity | Inspection | Phase | Needed again? |
|---|---|---|---|---|---|
| `pages/Campaigns.tsx` | Own local fetch/cache/archive handlers for Campaigns. Filters `is_system=false AND archived_at IS NULL` on fetch. Archive/restore write `campaigns.archived_at`. | Campaign | Full | Audit / Campaign | No — Campaign LOCKED |
| `pages/CampaignDetail.tsx` | Restore + archived badge; saveCampaign; publish elements. No cascade. | Campaign | Full | Campaign | No — Campaign LOCKED |
| `pages/Videos.tsx` | Video list, archive/restore handlers (migrated to personal `video_user_states`, see §8a), own `videosPageCache` (key now includes `effectiveUserId`). Contains the confirmed unfiltered-campaign-dropdown picker bug. | Video, Campaign (picker bug) | Full — pre-migration version only; re-verify post-migration copy if inspected again | Audit / Video | Possibly — if picker-bug fix scope is revisited |
| `pages/Assets.tsx` | In-page Asset list/picker, `archivedMap` construction via `getArchivedAssetIdsForUser`, own `assetsPageCache`. Correctly filters archived assets in its own picker. | Asset | Full | Audit / Asset | No — Asset LOCKED |
| `pages/Marketplace.tsx` | Assignment + Promotion lists, two independent personal archive maps, own three page caches. | Assignment, Promotion | Full | Audit / Assignment | Possibly — Marketplace list filter for removed-collaborator historical Promotions |
| `pages/VideoDetail.tsx` | Archive/restore reportedly migrated to personal `video_user_states` (see §8a) — **not independently file-verified**, product owner reported working; library section gated on `added_to_library_at`; metrics, tracking links, edit modal. | Video | Full — pre-migration version only; not re-inspected post-migration | Video | Possibly — re-upload to confirm migration |
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
| `services/asset/publishCampaignElementAsAsset.ts` | Type-1 (Campaign Element) asset creation via RPC `publish_campaign_element_as_asset`. | Full | No — Campaign LOCKED |
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

### Services — Assignment / Promotion / Campaign

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
| `services/campaign/saveCampaign.ts` | Updates campaign fields, pricing versions, lead magnets, redirect links. Does not touch `archived_at`. | Full | No — Campaign LOCKED |
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

### Uploaded but not yet inspected at all (optional for future)

| File | Status |
|---|---|
| `services/assignment/AssetPicker.tsx` | Uploaded earlier; available if needed for implementation. |
| `pages/AssetDetail.tsx` | Uploaded; Asset already LOCKED. |

All required Campaign files for locking were inspected. Remaining work is implementation-phase only.

---
## CONVERSATION HANDOFF / CURRENT INVESTIGATION STATE

**Overall objective**: Define product + technical Archive semantics for 5 entities (Assignment, Asset, Video, Promotion, Campaign), then implement entity by entity. Design/investigation phase is COMPLETE; this document is now also the implementation status tracker — a new conversation should not need the original chat history.

**Investigation order (complete)**: Assignment → Asset → Video → Campaign → Promotion → Assignment L1/L2 decision (DEFERRED) → doc finalized → **Implementation (Phase 1 in progress — see §11a)**.

**Entity status**:
- Assignment — **LOCKED** (mechanism); Level 1/Level 2 **explicitly DEFERRED** (product owner's call, not an open question)
- Asset — **LOCKED** (mechanism + Level 1/Level 2)
- Video — **LOCKED** (mechanism + Level 1/Level 2); mechanism amended to Personal, see §8a
- Campaign — **LOCKED** (mechanism + Level 1/Level 2)
- Promotion — **LOCKED** (mechanism + Level 1/Level 2 + Archive Impact)

**Level 1 / Level 2 UI status**:
- Asset — LOCKED; **implementation COMPLETE, see §11a**
- Video — LOCKED; **implementation COMPLETE, see §11a**
- Campaign — LOCKED; **implementation COMPLETE, see §11a**
- Promotion — **LOCKED**; **implementation COMPLETE, see §11a**:
  - **Surface A (true personal archive):** Level 1 = inline Archived view in Marketplace.tsx; Level 2 = existing ARCHIVED modal, repurposed to Hidden; Hide/Unhide via `archive_ui_visibility` entity_type='promotion'; Restore clears `promotion_user_states` (Level 1 only — Level 2 has Unhide only, never Restore)
  - **Surface B (Archive Impact):** separate diagnostic surface for Promotions that contain archived Assets, exposed both on PromotionDetail.tsx and as its own Marketplace.tsx tab (My Promotions scope only); does **not** use L1/L2; does **not** leave My Promotions; reasons from Asset resolver only
  - Hard rule: Archive Impact never replaces/filters/alters My Promotions; a Promotion in Impact remains independently in My Promotions unless personally archived
- Assignment — DEFERRED (whether `entity_type='assignment'` belongs in `archive_ui_visibility` is a separate product decision, not decided against)

**Important constraints (still binding during implementation)**:
- Do not reopen Assignment, Asset, Video, Promotion, or Campaign mechanisms or L1/L2 design unless a genuine contradiction between this doc and actual code/schema is found — stop and report, don't silently redesign.
- Do not treat a recommendation as a locked product decision — only the product owner's explicit confirmation locks something.
- Picker gap: **still not fixed** — blocked on the actual picker files, not on authorization (implementation IS authorized). See §11a "Blocked" for the current filename discrepancy that needs resolving before this can proceed.
- Known Campaign picker gap (`listCampaignsForOrg` does not filter archived) is recorded for Phase 3.
- `archive_ui_visibility` is the sole shared persistence for Level 1 ↔ Level 2; reasons remain read-time derived. Built for `entity_type='asset'` in Phase 1 (see §11a); `video`/`campaign`/`promotion` values are allowed by the migration's check constraint already, ready for Phases 2–4.
- Do not add `archive_level` / `archive_reason` / `archived_reason` / `archive_source_*` / `promotions.archived_at` columns. None added in Phase 1.

**What the next conversation should do first**: Read this document in full, especially §11a (Implementation Status). Phases 1–4 (Asset, Video, Campaign, Promotion) are all complete. Surface A (Promotion personal archive) and Surface B (Promotion Archive Impact) are both deployed and confirmed working. If further Promotion work is requested, get the actual current files from the product owner rather than assuming the Codebase File Map entries below (which predate this implementation phase) still match — the same rule that applied to every prior phase. The Asset picker gap and the Campaign picker gap (`listCampaignsForOrg`) both remain unverified/deferred, unchanged.

**What it must not do**: Reopen any LOCKED entity or its L1/L2 design without proven contradiction; treat recommendations as locked decisions; invent archive_level / archive_reason columns; guess at picker file contents instead of asking for them.

---

## LAST CONVERSATION SUMMARY / CONTINUATION PROMPT
CURRENT STATE:
Assignment = LOCKED (mechanism); L1/L2 explicitly DEFERRED
Asset = LOCKED (mechanism + L1/L2) — **IMPLEMENTATION COMPLETE, Phase 1**
Video = LOCKED (mechanism + L1/L2) — **IMPLEMENTATION COMPLETE, Phase 2**
Campaign = LOCKED (mechanism + L1/L2) — **IMPLEMENTATION COMPLETE, Phase 3 — deployed, manually tested successfully**
Promotion = LOCKED (mechanism + L1/L2 + Archive Impact) — **IMPLEMENTATION COMPLETE, Phase 4 — deployed, Surface A manually tested successfully, Surface B deployed and confirmed working**

CORE PRINCIPLE (LOCKED):
Archive → Detect Impact → Explain Impact → Guide User → User explicitly performs Remove / Revoke
FORBIDDEN: Archive → Automatically Remove / Revoke

PROMOTION (§12):
Surface A — True personal archive:
- Source: promotion_user_states
- Leaves My Promotions → Archived Promotions Level 1
- Hide → archive_ui_visibility (entity_type='promotion') → Level 2
- Level 2 Restore = Unhide only
- Level 1 Restore = clear promotion_user_states → My Promotions

Surface B — Archive Impact:
- Promotions with ≥1 archived Asset
- Does NOT leave My Promotions
- Does NOT use L1/L2 or archive_ui_visibility
- No Hide in MVP
- Count + per-Asset reasons from Asset central resolver
- Additional diagnostic surface only; never replaces My Promotions

Explicit bans: no promotions.archived_at, no archive_reason/level/source columns, no Promotion impact table. None violated in Phase 1.

PHASE 1 (Asset) — see §11a for full detail. Summary:
- Built: migration for archive_ui_visibility, central resolver (getAssetArchiveContext.ts, single + batch), archiveUiVisibility.ts (hide/unhide, DELETE-based unhide), Assets.tsx (Archive Tab + Hidden modal), AssetDetail.tsx (multi-reason display), assetsPageCache.ts (archiveContextMap wired through).
- Typechecked clean (strict mode). Confirmed COMPLETE by product owner.
- `/campaigns/:id` route since confirmed directly against `App.tsx` — no longer an open item.

PHASE 2 (Video) — see §11a for full detail. Summary:
- Built: getVideoArchiveContext.ts (single + batch + loaded-data variant), archiveUiVisibility.ts (duplicated from Asset), Videos.tsx (Archive Tab + Hidden modal, Campaign-archived-as-excluding-condition), VideoDetail.tsx (multi-reason display, Go to Campaign action), videosPageCache.ts (archiveContextMap wired through).
- Delivered as Ctrl+F/caveman patches, manually applied, re-verified against re-uploaded post-patch files. Confirmed COMPLETE by product owner.

PHASE 3 (Campaign) — see §11a for full detail. Summary:
- Built: getCampaignArchiveContext.ts (single + batch), archiveUiVisibility.ts (duplicated from Video), Campaigns.tsx (Level 1 Archive Tab inline + Level 2 Hidden modal, eager archived-list fetch), CampaignDetail.tsx (Restore+Hide at Level 1, Unhide-only at Level 2).
- No migration needed (archive_ui_visibility already allows entity_type='campaign'). No page cache built (explicitly declined by product owner).
- Delivered as Ctrl+F/caveman patches, manually applied, deployed, and manually tested end-to-end by product owner. Confirmed COMPLETE.

PHASE 4 (Promotion) — see §11a for full detail. Summary:
- Built: getPromotionArchiveContext.ts (Surface A resolver, single + batch), archiveUiVisibility.ts (duplicated from Campaign, entity_type='promotion'), getPromotionAssetArchiveImpact.ts (Surface B per-promotion, reuses central Asset resolver), getPromotionArchiveImpactForViewer.ts (Surface B Marketplace-level orchestrator, reads promotion_assets), getAssetTitlesBulk.ts (display-only bulk Asset title lookup, duplicated from getAssetDetail.ts's per-type precedence). Marketplace.tsx (Level 1 inline Archived view + Level 2 Hidden modal repurposed from the old flat Archived modal + new Archive Impact tab). PromotionDetail.tsx (Restore+Hide at Level 1, Unhide-only at Level 2, new Archive Impact banner).
- No migration needed (archive_ui_visibility already allows entity_type='promotion'). promotionArchive.ts unchanged — mechanism was already correct.
- Delivered as Ctrl+F/caveman patches, manually applied, deployed. Surface A manually tested end-to-end by product owner (archive → Level 1 → Hide → Level 2 → Unhide → Level 1 → Restore). Surface B deployed and confirmed working (screenshot-verified), then given two display-only follow-up patches (real Asset titles, Go to Asset button) — neither touched Surface A, archive-detection logic, or promotion_user_states/archive_ui_visibility.

NEXT:
1. No Promotion work outstanding. All 4 phases (Asset, Video, Campaign, Promotion) are implementation-complete.
2. Asset picker gap and Campaign picker gap (`listCampaignsForOrg`) both remain deferred/unverified — pre-existing, not introduced by any phase, only in scope if the product owner explicitly pulls them in.
3. Assignment Level 1/Level 2 remains an explicitly DEFERRED product decision, not an open bug.
Assignment L1/L2 remains deferred — do not implement or re-raise unless product owner brings it up.

12b.5 AllAssetsAnalytics reference implementation (pattern to copy)
Data path:

getAssetAnalyticsRows already attaches Asset archive context (archive.isArchived, reasons).
Page hook loads Video + Campaign + Promotion archive maps via batch resolvers (see §12b.2).
Each AssetAnalyticsRow carries:

TypeScriptarchive: { isArchived: boolean; reasons: ... }   // Asset
videoArchive: { isArchived: boolean }
campaignArchive: { isArchived: boolean }
promotionArchive: { isArchived: boolean }        // Surface A only

After existing UI filters (scope, type, platform, campaign, promotion, content owner), call:

TypeScriptapplyAnalyticsArchiveFilters(rows, (row) => ({
  assetArchived: row.archive.isArchived,
  videoArchived: row.videoArchive.isArchived,
  campaignArchived: row.campaignArchive.isArchived,
  promotionArchived: row.promotionArchive.isArchived,
}), { hideArchivedAsset, hideArchivedVideo, hideArchivedCampaign, hideArchivedPromotion })

Sort / table / cards consume the archive-filtered list.

UI:

Sidebar + mobile filters sheet: section Hide Archived with four toggles labeled Asset / Content / Campaign / Promotion (default OFF).
Same four booleans shared across desktop and mobile.

Badges (AllAssetsAnalytics only — product choice; optional on other charts):

Style aligned with existing IN RANGE chip (small pill + dot).
Archived is highest-priority status label on that identity when the entity is archived.
Placement:
Asset identity → row.archive.isArchived (tooltip may list reasons source names).
Promoting Content → row.videoArchive.isArchived.
Campaign column → row.campaignArchive.isArchived.
Promotion column (when real promotion name shown) → row.promotionArchive.isArchived.

Badges are read-only; they do not write archive state.


12b.6 Checklist for adding archive to a new analytics chart

Decide which Hide dimensions the page needs (product, not inference).
Import applyAnalyticsArchiveFilters from lib/analyticsArchiveFilter.ts.
Attach flags via existing batch resolvers only (no new cascade).
Default all Hide toggles OFF.
Apply soft filter after metrics and after other UI filters; before sort/display.
Optional: Archived badges on identity cells (same visual language as AllAssetsAnalytics).
Do not use Surface B Impact helpers as the main row filter.
Do not suppress historical totals at the engine/query layer because of archive.


12b.7 Explicit non-actions (analytics)

No archived_at / *_user_states writes from analytics pages.
No cascade filter that removes child rows because a parent Campaign/Video was archived except via resolver isArchived already including derived reasons on that entity.
No Marketer archive until §3 evaluates Marketer as an archive subject.
No multi-viewer “whose archive wins?” logic until that phase is unlocked.
No automatic Hide of promotions that merely contain archived assets (that is Surface B Impact, not Entity Archive Hide).


12b.8 Files touched by P2 (reference)





















FileRolesrc/lib/analyticsArchiveFilter.tsShared pure filter helpersrc/pages/AllAssetsAnalytics.tsxFirst chart: 4 Hide toggles + resolver attach + badgesResolvers under services/*/get*ArchiveContext.tsUnchanged source of truth (consumed only)

13–30. (Picker behavior, Search, Historical data beyond §12b, Restore UX copy, Permissions, RLS, further phases)
Remaining cross-entity items (picker gaps, multi-viewer analytics, notification patterns) stay deferred unless product owner pulls them in. Known gaps (Asset picker asset_user_states filters, listCampaignsForOrg archived filter) unchanged by §12b.
text---

**Step D — NEXT at bottom (optional but useful)**

**Ctrl+F:**
```md
NEXT:
1. No Promotion work outstanding
Replace that NEXT block with:
MarkdownNEXT:
1. No Promotion work outstanding. All 4 phases (Asset, Video, Campaign, Promotion) are implementation-complete.
2. **Analytics Archive Contract (§12b) LOCKED (single-viewer).** Reference implementation: AllAssetsAnalytics (4 Hide Archived toggles + badges + `lib/analyticsArchiveFilter.ts`). Copy §12b.6 checklist for InDepthAnalytics / future charts — do not re-investigate cascade or invent new archive rules.
3. Asset picker gap and Campaign picker gap (`listCampaignsForOrg`) both remain deferred/unverified — pre-existing, not introduced by any phase, only in scope if the product owner explicitly pulls them in.
4. Assignment Level 1/Level 2 remains an explicitly DEFERRED product decision, not an open bug.
5. Multi-viewer analytics archive behavior remains DEFERRED.

After paste, Ctrl+F 12b. Analytics Archive — you should find the new section once.