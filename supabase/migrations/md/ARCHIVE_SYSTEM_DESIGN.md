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

### Future notification design (RECORDED, NOT IMPLEMENTED)

Investigated per product owner's request — findings, not a build:

1. Role (owner vs. collaborator) is **not currently stored** anywhere at archive time. `archiveAssetForUser(assetId, userId)` takes a bare `userId`, no role.
2. Role **is derivable** today, but only at read time: compare archiving user's org membership (`organization_members.organization_id`) against `assets.organization_id` → owner-side; else check `assignment_collaborators` on an assignment referencing this asset → collaborator-side.
3. **Recommended future schema (not built now):** capture role as a snapshot at write time (e.g. an owner/not-owner value on the archive row) rather than deriving it at read time — org membership can change after the fact, and a snapshot avoids the answer silently drifting later. Product owner has confirmed this direction.
4. A simple owner/not-owner value is sufficient — this domain has exactly two roles today, no need for an open-ended enum.
5. **Recommended separation:** the archived-by-role value is *state* (belongs on `asset_user_states`). The act of notifying collaborators is a *side-effect*, and should live in its own future service — proposed location `services/asset/assetNotifications.ts`, or a shared `services/notifications/` module if Video/Promotion/Campaign turn out to need the same "owner action informs downstream party" pattern (plausible, given Promotion's owner/collaborator structure noted in earlier discussion — to be confirmed in the Promotion phase, not assumed now).
6. **Deferred, not blocking Asset lock:** if an org has multiple members, which member's archive action counts as "the owner archived it" for notification purposes is unresolved. Not a blocker since no notification system is being built yet — flagged for whoever eventually designs `assetNotifications.ts`.

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
