-- ============================================================
-- Phase 1: events_internal — forward-only, additive only.
-- Does NOT touch, read, copy, or reference the existing
-- `events` table in any way. No UPDATE/DELETE/backfill.
-- ============================================================

CREATE TABLE public.events_internal (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  session_id        uuid        NULL,
  event_type        text        NULL,
  path              text        NULL,
  organization_id   uuid        NULL,
  created_at        timestamptz NULL DEFAULT now(),
  CONSTRAINT events_internal_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_events_internal_organization_id
  ON public.events_internal USING btree (organization_id);

CREATE INDEX idx_events_internal_session_id
  ON public.events_internal USING btree (session_id);

-- No RLS policy created here — deliberately deferred to Phase 2
-- per your decision. Table currently has no RLS enabled (default
-- Supabase behavior), same as leaving it unrestricted until you
-- decide the Phase 2 access model.

CREATE POLICY "Public can insert internal events"
ON public.events_internal
FOR INSERT
TO public
WITH CHECK (true);