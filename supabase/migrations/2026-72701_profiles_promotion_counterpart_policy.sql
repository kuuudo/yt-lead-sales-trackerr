-- Phase 2D — Identity Resolution Fix
--
-- Root cause (confirmed): the existing "Users can view assignment sharer
-- profiles" policy only fires when
--   p.owner_user_id = auth.uid() AND a.created_by_user_id = profiles.id
-- which never actually grants the Collaborator -> Sponsor direction, and
-- only trivially matches the Sponsor viewing their own profile again in
-- the owner_user_id == created_by_user_id case. can_view_member_profile()
-- (org-hierarchy visibility, a different feature entirely) is NOT
-- modified — the only reason Ali<->WebMood ever worked was incidental
-- shared org membership from earlier testing, not this policy.
--
-- Replacement grants exactly the relationship Marketplace collaboration
-- actually needs: the Sponsor (promotions.owner_user_id) and the
-- Collaborator (assignment_collaborators.user_id, via
-- promotions.assignment_collaborator_id) may see each other's profile.
--
-- Deliberately NOT filtered by assignment_collaborators.status. Per the
-- locked Phase 2A/2C behavior, a Sponsor must still see a REMOVED
-- collaborator's name (status is orthogonal to identity — the row and
-- its user_id never disappear on removal), and a removed collaborator's
-- own historical view must still show the Sponsor's name. Filtering on
-- status here would silently re-break the Restore Collaborator UI this
-- same phase already fixed once.
--
-- Direct org-owner promotions (assignment_collaborator_id IS NULL, no
-- Assignment involved) naturally no-op here via the LEFT JOIN — there is
-- no "other party" to resolve for that case.
--
-- Does NOT touch: can_view_member_profile(), organization_members, any
-- table schema. Only the two named `profiles` policies are affected.

drop policy if exists "Users can view assignment sharer profiles" on profiles;

create policy "Users can view promotion counterpart profiles"
on profiles
for select
using (
  exists (
    select 1
    from promotions p
    left join assignment_collaborators ac on ac.id = p.assignment_collaborator_id
    where
      -- Viewer is the Sponsor; target profile is the Collaborator.
      (p.owner_user_id = auth.uid() and ac.user_id = profiles.id)
      or
      -- Viewer is the Collaborator; target profile is the Sponsor.
      (ac.user_id = auth.uid() and p.owner_user_id = profiles.id)
  )
);
