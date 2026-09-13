# Campaign Creative Creation — Implementation Plan (Overlay)

Status: PLANNING ONLY — no code, no migrations, no files modified yet.
This document sits beside the main VSTRK decision doc. It does not replace it.
Paste this back into a fresh Claude conversation one phase at a time.

---

## A. Architecture Reconciliation

**1. What's now obsolete from the old "Campaign Content Creation Access" proposal**

- The idea that this needs its own broad permission layer ("Campaign Content Creation Access" as a standalone concept sitting outside Assignment) is obsolete. The new direction scopes the permission to the Assignment itself, not a separate Campaign-sharing record.
- The old doc's framing of the Marketer's created content as staying "owned by the Marketer where appropriate" (Section 7) is superseded. New direction: the Video belongs to the Sponsor organization outright, full stop — only the creator identity is tracked separately.
- The old doc deferred this as too complex for MVP, requiring changes across "Campaign permissions, Create Assignment, PromotionDetail, Create New Content, Campaign selectors, Asset visibility..." — that estimate is superseded by the new direction's claim that most of this is reuse, not new architecture.
- Everything else in the old doc — the *rules* (no Campaign-wide access, no Link access by default, no admin rights, revocation ≠ deletion, Asset→Campaign→Domain determinism) — is **not obsolete**. Those rules are restated and preserved by the new direction; they just move from "future permission system" into "an Assignment-scoped mode."

**2. What remains unchanged**

- Every Asset belongs to exactly one Campaign (via `asset_resources.campaign_id`).
- Campaign → one Root Tracking Domain → unlimited subdomains.
- Asset cannot borrow another Campaign's domain.
- Campaign ownership stays with the Sponsor — this feature does not transfer or share ownership.
- Shared Asset ownership model (Sponsor owns, Marketer receives access) — this feature is explicitly modeled as an extension of that, not a replacement.
- Assignment already carries Sponsor↔Marketer scoping, branded-domain permission (`ALLOW COLLABORATOR DOMAIN`, `marketer_branded_tracking_domain_id`) — this is the natural home for the new mode flag too, per your own instinct.
- Asset Campaign resolution rules (don't use `campaignIds[0]`, Video Asset Campaign comes from Video's Campaign relationship, Asset Campaign ≠ Content Campaign) — these matter a lot here since we're creating a Video whose Campaign is the Sponsor's.
- No duplicate attribution system, no Relay changes unless proven necessary.

**3. Assignment / Invitation / Promotion decisions that need to account for this now**

- **Create Assignment**: needs a new mode field (two values: Campaign+Links+Assets vs Asset-only) in addition to existing Asset/domain-permission fields. This should be inspected against the existing Assignment schema before assuming a new column.
- **Accept Invitation**: needs to surface the mode to the Marketer and "activate" it on acceptance — same pattern as existing branded-domain activation, no second permission system.
- **Promotion Detail**: needs a place to show/revoke this capability, analogous to how `ALLOW COLLABORATOR DOMAIN` is already shown/toggled per-Asset. Revocation semantics (no deletion, no attribution rewrite) mirror the already-locked domain-revocation behavior.
- **+Create New Content (Marketer side)**: needs the Sponsor Campaign to appear as a *persistent* Campaign option (not gated behind Asset selection like other flows), plus a forced/auto Promotion selection step.

**4. Can this reuse existing systems instead of new permission architecture?**

Yes, provisionally. The two modes look structurally identical to two things that already exist:

- Mode "Campaign + Links + Assets" ≈ Sponsor creating content in their own Campaign (full context).
- Mode "Asset Only" ≈ the existing "ONLY PROMOTE ASSET" restricted promotion model.

If that mapping holds after inspection, the "new permission" may just be: *which of two already-understood promotion contexts does this Assignment grant, scoped to one Sponsor Campaign*. That would mean no new Campaign-sharing table, no new visibility engine — just a mode enum on Assignment plus a creator-identity field on Video/Asset. This needs to be confirmed against actual code in Phase 1, not assumed.

---

## B. Existing-System Dependency Map (inspect only, do not modify)

| Area | Why it's involved |
|---|---|
| Create Assignment (frontend + backend mutation) | Needs new mode selection; must inspect current Asset/domain-permission field structure |
| Assignment schema/model | Target for the new mode field; must confirm no reusable existing field |
| Invitation acceptance flow | Must surface + activate the mode on accept |
| Promotion / Promotion Detail (UI + backend) | Must display mode, support revoke, must confirm revoke semantics match existing `ALLOW COLLABORATOR DOMAIN` pattern |
| Marketer "+ Create New Content" Campaign selector | Must always show eligible Sponsor Campaigns (not gated like other conditional UI) |
| Promotion selector inside content creation | Must implement auto-select-if-one / force-choice-if-many / block-if-none |
| Video creation mutation/model | Must inspect existing `organization_id`, creator/owner fields, and any existing Campaign/Promotion linkage on Video |
| Asset creation ("+ Asset" from Video) logic | Must inspect to reuse for "automatic Asset creation" simultaneity |
| Shared Asset / assignment-asset linkage logic | Must inspect how an Asset becomes "shared" today, to reuse for automatic sharing |
| Campaign selector components (Sponsor-side and Marketer-side) | To understand how "eligible Campaigns" are currently computed/filtered |
| Asset selector components | To understand how Promotion-scoped Asset visibility is currently filtered (this is the privacy boundary) |
| Content Library | Must confirm Marketer-created-but-Sponsor-owned Video appears correctly without extra work |
| InDepth Analytics (`indepthanalytics.tsx`) | Must confirm Campaign-link-promoting content already surfaces correctly by Campaign, unaffected by creator identity |
| AllAssets Analytics | May need one filter/dimension addition for creator identity — must inspect before assuming |
| Archive logic (wherever Asset archiving is implemented) | Must find exact location to add the "cannot archive while representing this relationship" restriction |
| Permission/access checks (RLS or app-level) around Asset/Campaign visibility | Must confirm no existing check would incorrectly block or incorrectly allow this new path |

---

## C. Database Impact (to determine via inspection, not assumption)

Questions to answer by reading the actual schema/code before deciding on new columns:

- How is Video ownership represented today? (`organization_id` presumably — confirm.)
- How is Video *creator* represented today? Is there a `created_by_user_id` or similar that's separate from `organization_id`? If so, can it already distinguish "Sponsor user created this" vs "Marketer user created this," or does it only store one org's user and thus needs a new field?
- Does Video already have any Campaign relationship? (Needed regardless of this feature, per existing Asset Campaign resolution rules — confirm exact field name.)
- Does Video already have any Promotion relationship? If not, this is likely a genuinely new field, since Promotion-selection-at-creation-time is new *behavior*, not just new bookkeeping.
- How is Campaign ownership represented? (Confirm `organization_id` on `campaigns`.)
- How is Assignment represented, and does it already have room for a mode-like enum, or adjacent boolean flags that suggest a place to extend?
- How is "Shared Asset" represented — is there a join table, a flag, or is sharing implicit in Assignment+Asset linkage? This determines whether "automatic sharing" is just "insert the normal row programmatically" or something new.
- How is Asset creation from Video represented today (the manual "+ Asset" action) — is it a distinct mutation that can be called Video-creation-time, or tightly coupled to a manual UI-only flow?

**Working assumption, to be confirmed, not implemented:** the only field very likely to be genuinely new is a Video→Promotion link (since Promotion-at-creation-time doesn't exist today) and possibly a creator-identity marker if the existing creator field can't distinguish cross-org authorship. Everything else (mode flag on Assignment, sharing, Campaign linkage) may reuse existing structures. This must be verified in Phase 1/5, not assumed now.

---

## D. Permission Model (smallest possible representation)

Proposed shape (subject to Phase 1 inspection):

```
Assignment
├── existing fields (asset_id, campaign_id derived from asset, marketer_branded_tracking_domain_id, allow_collaborator_domain, ...)
└── creative_creation_mode: NULL | 'campaign_links_and_assets' | 'asset_only'
```

- Default: NULL (no capability granted) — matches the existing "default OFF" principle from the old doc.
- Scoped to the Assignment record itself — not a new table, not a generic "Campaign share."
- Activation happens implicitly on Assignment acceptance (same as other Assignment-scoped permissions) — no second acceptance flow.
- Revocation = setting the mode back to NULL (or a revoked boolean/timestamp if audit history is wanted) — does not cascade to delete Videos, Assets, or analytics.
- Promotion-scoping is **not** stored as a separate permission — it's resolved live at creation time from "which Promotions under this Assignment/Campaign are eligible," per the existing Promotion structure. This avoids a second privacy system: the Promotion itself remains the privacy boundary, exactly as today.

This must be validated once Phase 1 inspection shows the real Assignment schema — it may turn out a mode belongs on a different existing entity (e.g., directly on the Asset-Assignment join, if one exists separately from Assignment).

---

## E. Phased Implementation Plan

Each phase: inspect → implement → typecheck/build → test → diff → commit. Stop after any phase; resume later in a fresh conversation with this document.

### Phase 1 — Assignment schema & mode inspection/decision
- **Goal:** Confirm exact Assignment schema, decide where the mode field lives, confirm it doesn't collide with existing fields.
- **Inspect:** Assignment model/migration files, Create Assignment mutation, Create Assignment UI form.
- **Likely change:** Add `creative_creation_mode` (or equivalent) to Assignment; add UI control in Create Assignment (default off/NULL).
- **Must NOT change:** Existing Asset/domain-permission fields or their semantics; Campaign/Asset resolution chain.
- **Dependencies:** None (first phase).
- **Testing:** Create an Assignment with mode set/unset; confirm existing Assignment flows (without this feature) are unaffected.
- **Commit scope:** Schema + Create Assignment UI/mutation only.

### Phase 2 — Invitation acceptance activation
- **Goal:** Surface the mode to the Marketer on the invitation, activate it on accept, no new permission system.
- **Inspect:** Existing invitation acceptance flow (esp. how `ALLOW COLLABORATOR DOMAIN` / branded-domain choice is surfaced today).
- **Likely change:** Display mode on invitation screen; no functional gating changes yet (that's Phase 4).
- **Must NOT change:** Existing acceptance semantics for unrelated Assignment fields.
- **Dependencies:** Phase 1.
- **Testing:** Accept an Assignment with mode set; confirm mode is readable post-acceptance; confirm Assignments without mode are unaffected.
- **Commit scope:** Invitation acceptance UI/query only.

### Phase 3 — Promotion Detail: display + revoke
- **Goal:** Sponsor can see and revoke the capability from Promotion Detail.
- **Inspect:** Existing Promotion Detail revoke pattern for `ALLOW COLLABORATOR DOMAIN` to mirror it exactly.
- **Likely change:** New UI block showing mode + revoke action; revoke sets mode back to NULL/revoked, no cascading deletes.
- **Must NOT change:** Existing Asset revoke logic; existing analytics/attribution records.
- **Dependencies:** Phase 1.
- **Testing:** Toggle on/off; confirm no Video/Asset/analytics side effects on revoke; confirm re-enabling doesn't need to "recreate" anything.
- **Commit scope:** Promotion Detail UI/mutation only.

### Phase 4 — Marketer "+ Create New Content": Campaign + Promotion selection
- **Goal:** Sponsor Campaign appears persistently as an option; Promotion is required and auto-selected/forced-choice per rules.
- **Inspect:** Current Campaign selector logic in Marketer's creation flow; current Promotion-only-after-Asset-selection behavior (to understand why this needs to differ); Video creation mutation.
- **Likely change:** Campaign selector includes eligible Sponsor Campaigns whenever an accepted Assignment with a mode exists; new Promotion-selection step (auto-select if 1, force choice if 2+, block if 0) inserted before/alongside Video creation, independent of Asset selection order.
- **Must NOT change:** Existing Marketer-own-Campaign creation flow; existing Asset-first-then-Promotion flows for other Assignment types.
- **Dependencies:** Phases 1–3 (mode must exist and be visible/revocable before wiring the creation-time behavior).
- **Testing:** Marketer with mode='asset_only' sees Campaign but not Links; Marketer with mode='campaign_links_and_assets' sees Links too; 0/1/2+ Promotion eligibility cases all behave correctly; Marketer without an accepted Assignment never sees the Sponsor Campaign.
- **Commit scope:** Campaign selector + Promotion selector components only (not yet Video/Asset persistence — see Phase 5).

### Phase 5 — Video creation, automatic Asset creation, ownership fields
- **Goal:** Video is created under Sponsor org/Campaign/Promotion; creator identity recorded; Asset auto-created; Asset auto-shared.
- **Inspect:** Video creation mutation (ownership fields), the manual "+Asset from Video" mutation (to reuse, not duplicate), Shared Asset/assignment-asset linkage logic.
- **Likely change:** Video creation sets `organization_id` = Sponsor, `campaign_id` = Sponsor Campaign, new Promotion link field, creator-identity field (name TBD after Phase-1-style inspection — do not assume `creative_edit_mode_marketer_id` yet); simultaneous Asset creation call using the existing "+Asset" logic; Asset immediately marked shared to the creating Marketer using existing sharing mechanism.
- **Must NOT change:** Existing Sponsor-created Video behavior; existing Marketer-created-Video-in-own-Campaign behavior; existing manual "+Asset" flow for Sponsors.
- **Dependencies:** Phase 4.
- **Testing:** Create Video via this path; confirm Video ownership/creator fields are correct; confirm Asset is created and appears as shared to the correct Marketer only; confirm no duplicate Asset or duplicate Promotion is created; confirm existing Sponsor/Marketer Video creation paths are unaffected (regression check).
- **Commit scope:** Video + Asset creation mutation changes only.

### Phase 6 — Shared Asset visibility, privacy scoping, archive protection
- **Goal:** Enforce that Marketer sees only Promotion-scoped Assets (not all Sponsor Assets); Sponsor cannot archive this special Asset.
- **Inspect:** Asset selector filtering logic (the actual privacy boundary), archive logic location.
- **Likely change:** Asset selector filter constrained to "assets shared via the selected Promotion" (existing scoping, reused) plus the newly created Asset; add archive-block check for Assets carrying the creator-identity marker.
- **Must NOT change:** Existing Asset visibility for non-collaboration cases; existing archive behavior for all other Assets.
- **Dependencies:** Phase 5.
- **Testing:** Attempt to view/select an unrelated Sponsor Asset as the Marketer (must fail/not appear); attempt to archive the special Asset as Sponsor (must be blocked); confirm other Assets still archivable normally.
- **Commit scope:** Asset selector filter + archive-check only.

### Phase 7 — Analytics & Content Library integration
- **Goal:** Confirm/adjust InDepth Analytics and AllAssets Analytics correctly include this content; add creator filter if needed.
- **Inspect:** `indepthanalytics.tsx`, AllAssets Analytics data source, Content Library query.
- **Likely change:** Possibly none for InDepth/Content Library (if they already key off Campaign/Asset, not creator); possibly one filter/dimension added to AllAssets Analytics for creator identity.
- **Must NOT change:** Existing analytics attribution logic (Asset Campaign vs Content Campaign distinction, `(video_id, asset_id)` identity).
- **Dependencies:** Phase 5.
- **Testing:** Confirm Marketer-created Video promoting Campaign Links shows in InDepth under Sponsor Campaign; confirm Asset-promotion path shows in AllAssets; confirm optional creator filter works and doesn't break existing filters.
- **Commit scope:** Analytics query/UI changes only.

### Phase 8 — Full integration & regression pass
- **Goal:** End-to-end test across both modes, revocation, archive, analytics, and the original MVP path.
- **Inspect:** Nothing new — this is verification.
- **Likely change:** None expected; bug fixes only if regressions found.
- **Must NOT change:** N/A — this phase should produce no architecture changes, only fixes.
- **Dependencies:** Phases 1–7.
- **Testing:** Full walkthrough of both modes, revoke-mid-flow, archive-attempt, analytics-check, and a full run of the original MVP path (Sponsor creates Asset → assigns → Marketer promotes → tracked) to confirm zero regression.
- **Commit scope:** Fix-only commits, clearly scoped per bug.

---

## F. Risks to Watch For Before/During Implementation

- Accidentally exposing all Sponsor Assets to the Marketer instead of only Promotion-scoped ones (Phase 6 is the guard).
- Accidentally granting Campaign-wide access (settings, other Assets, other Links) instead of the narrow creation capability.
- Accidentally setting Video ownership to the Marketer's org instead of the Sponsor's.
- Breaking existing Sponsor-created-Video behavior by conditionally branching creation logic incorrectly.
- Breaking existing Marketer-created-Video-in-own-Campaign behavior via the same shared code path.
- Creating a duplicate Asset if the Video-to-Asset step is retried or double-submitted.
- Creating a duplicate Promotion instead of reusing the selected/auto-selected one.
- Allowing content creation with no valid Promotion selected (must hard-block, not soft-warn).
- Allowing a Marketer to select another Promotion's Asset by leaking an unscoped Asset list into the UI.
- Archive logic living in more than one place (e.g., both a UI check and a backend check) — must patch all of them consistently.
- Analytics attribution accidentally shifting from Asset Campaign to Content Campaign or vice versa for this new path.
- Existing Shared Asset behavior (for the non-this-feature case) accidentally affected by reusing its sharing mechanism.
- RLS / organization-boundary checks incorrectly blocking the Sponsor-org Video/Asset from being written by a Marketer-authenticated request, or incorrectly allowing broader access than intended.

---

## G. MVP Safety

The existing MVP path must remain fully intact and untouched in behavior:

```
Sponsor → creates Asset → assigns Asset → Marketer promotes Asset → VSTRK tracks it
```

This feature is additive: Assignments without the new mode set behave exactly as they do today. No phase in this plan should require touching the default (mode = NULL) code path except to add a conditional branch around it.

---

## Implementation Mode Reminder (for when phases begin)

When implementing any phase:
- Find the exact target via exact string match.
- Make the smallest possible change.
- Do not rewrite or regenerate whole files.
- Run a diff and confirm only intended lines changed.
- If the exact target is missing, stop and report — do not improvise.
