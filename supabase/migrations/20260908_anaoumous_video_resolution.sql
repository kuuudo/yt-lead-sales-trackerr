-- Additive only. Does NOT change videos RLS or existing RPCs.
-- Mirrors tracker.ts resolveDestinationVideoId / getPredictedNextVideoIds exactly
-- (including NO deleted_at filter — current TS does not filter it).

CREATE OR REPLACE FUNCTION public.resolve_destination_video(
  p_youtube_video_id text,
  p_redirect_asset_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
  v_id uuid;
BEGIN
  IF p_youtube_video_id IS NULL OR btrim(p_youtube_video_id) = '' THEN
    RETURN NULL;
  END IF;

  -- Match TS: all rows with this youtube_video_id (no deleted_at filter)
  SELECT COUNT(*)::integer INTO v_count
  FROM public.videos v
  WHERE v.youtube_video_id = p_youtube_video_id;

  IF v_count = 0 THEN
    RETURN NULL;
  END IF;

  -- Exactly one row → return that id (TS does not require asset match here)
  IF v_count = 1 THEN
    SELECT v.id INTO v_id
    FROM public.videos v
    WHERE v.youtube_video_id = p_youtube_video_id;
    RETURN v_id;
  END IF;

  -- 2+ rows: disambiguate with redirect asset_id (TS: asset_id === redirectAssetId)
  -- IS NOT DISTINCT FROM preserves null === null like JS ===
  SELECT COUNT(*)::integer INTO v_count
  FROM public.videos v
  WHERE v.youtube_video_id = p_youtube_video_id
    AND v.asset_id IS NOT DISTINCT FROM p_redirect_asset_id;

  IF v_count = 1 THEN
    SELECT v.id INTO v_id
    FROM public.videos v
    WHERE v.youtube_video_id = p_youtube_video_id
      AND v.asset_id IS NOT DISTINCT FROM p_redirect_asset_id;
    RETURN v_id;
  END IF;

  -- 0 or 2+ after asset filter → null (never LIMIT 1)
  RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_predicted_next_videos(
  p_promoted_asset_id uuid
)
RETURNS TABLE(video_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_promoted_asset_id IS NULL THEN
    RETURN;
  END IF;

  -- Match TS: all ids for asset_id, no LIMIT, no deleted_at filter
  RETURN QUERY
  SELECT v.id AS video_id
  FROM public.videos v
  WHERE v.asset_id = p_promoted_asset_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_destination_video(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_predicted_next_videos(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.resolve_destination_video(text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_predicted_next_videos(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.resolve_destination_video(text, uuid) IS
  'Anonymous-safe destination videos.id for Track journey edges. Not a general videos search API.';

COMMENT ON FUNCTION public.get_predicted_next_videos(uuid) IS
  'Anonymous-safe candidate next video ids by promoted asset_id (journey fallback).';