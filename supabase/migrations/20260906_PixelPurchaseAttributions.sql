CREATE TABLE public.pixel_purchase_attributions (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  pixel_purchase_id             uuid NOT NULL UNIQUE
                                REFERENCES public.pixel_purchases (id)
                                ON DELETE CASCADE,

  first_touch_redirect_link_id  uuid
                                REFERENCES public.redirect_links (id)
                                ON DELETE SET NULL,

  journey_snapshot              jsonb,

  match_method                  text NOT NULL,
  resolution_status             text NOT NULL,

  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pixel_purchase_attributions_match_method_check
    CHECK (match_method IN (
      'forward_journey', 'redirect_link_id', 'bridge_token',
      'session_provenance', 'url_match', 'unresolved'
    )),
  CONSTRAINT pixel_purchase_attributions_resolution_status_check
    CHECK (resolution_status IN ('resolved', 'ambiguous', 'unresolved'))
);

CREATE INDEX pixel_purchase_attributions_first_touch_redirect_link_id_idx
  ON public.pixel_purchase_attributions (first_touch_redirect_link_id);

ALTER TABLE public.pixel_purchase_attributions ENABLE ROW LEVEL SECURITY;
-- No policies added. This table is written only by api/pixel.ts using the
-- service-role key (which bypasses RLS entirely), and there's no
-- client-facing read path for it yet. Locking it down with RLS enabled and
-- zero policies means: even if a future anon/authenticated Supabase client
-- ever touches this table, nothing is exposed until you explicitly add a
-- policy. Flag me if your project's convention is different (e.g. you
-- expect an authenticated read path on this table soon) and I'll adjust.