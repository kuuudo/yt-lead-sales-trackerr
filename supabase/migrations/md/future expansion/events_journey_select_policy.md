# events_journey — SELECT RLS Policy (MVP Decision)

**Status:** Intentional MVP decision — not an accidental security gap.
**Date:** 2026-09-20
**Table:** `public.events_journey`
**Related tables:** `redirect_links`, `organization_members`

## Background

`events_journey` originally had only one RLS policy: an `INSERT` policy for
`{anon,authenticated}`. There was **no `SELECT` policy** on the table. Under
Postgres RLS, a command with no matching policy is denied by default, so
every client-side `SELECT` against `events_journey` silently returned
`{ data: [], error: null }` — not an error, just zero rows — regardless of
whether the underlying data existed. This was discovered while debugging
`PromotionJourneyMap` failing to discover an `events_journey` row that was
confirmed to exist via direct SQL (SQL-editor queries run as the Postgres
role and bypass RLS entirely, which is why the gap wasn't visible there).

## The decision

For the MVP, we added an open `SELECT` policy:

```sql
create policy "Public can read events_journey"
on events_journey
for select
to public
using (true);
```

This is **Option A** of two options considered. It was chosen deliberately,
not as an oversight.

## Why `using (true)` is acceptable for now

1. This mirrors the existing pattern already used on `redirect_links`
   (`"Public can read redirect links"`, `qual: true`), so it's consistent
   with how reads are currently handled elsewhere in the schema.
2. VSTRK has an **Operator Mode** where cross-organization data visibility
   is intentionally required, so a fully open read policy does not
   introduce a new capability that the product doesn't already need in
   some form.
3. It unblocks `PromotionJourneyMap` (and any other `events_journey`
   consumer) immediately, with the smallest possible change.

## What this policy currently allows

- **Any** client with `anon` or `authenticated` role can read **every**
  row in `events_journey`, across **all** organizations, not just rows
  belonging to the requesting user's own org.
- There is currently no row-level scoping by `organization_id`,
  `redirect_link_id` ownership, or any other tenant boundary on
  `events_journey` reads.

## Future Security Hardening

**This is a flagged item to revisit later, not a closed decision.**

The MVP-open policy above should eventually be replaced with an
organization-scoped policy once Operator Mode's cross-org requirements are
formally separated from normal tenant-scoped access. The leading candidate
is:

### Option B (not implemented yet)

Scope `events_journey` reads through `redirect_links.organization_id` via
`organization_members`, mirroring the org-membership pattern already used
by the existing `redirect_links` `DELETE` policy:

```sql
create policy "Users can read events_journey in their org"
on events_journey
for select
to public
using (
  redirect_link_id in (
    select id from redirect_links
    where organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid()
    )
  )
);
```

Trade-offs to weigh when this is revisited:
- Correctly scopes reads to the requesting user's org(s), closing the
  cross-org exposure described above.
- Adds a subquery join on every `events_journey` read (`redirect_links` →
  `organization_members`), which is more query overhead than `using (true)`.
- Will need an explicit carve-out for Operator Mode if Operator Mode is
  expected to see across organizations — Option B as written would remove
  that visibility, so it cannot simply replace Option A without also
  handling the Operator Mode case.

**No architecture change and no Option B implementation is being made
now.** This document exists solely to record that the current open policy
is intentional, and to make sure it gets revisited before this table is
treated as holding sensitive per-org data.
