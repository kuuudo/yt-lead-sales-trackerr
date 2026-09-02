FILE:
[your migration file — new file, e.g. supabase/migrations/xxxx_fix_operator_sponsor_promotion.sql]

ADD:

ALTER POLICY operator_read_videos_sponsor_promotion ON public.videos
USING (
  EXISTS (
    SELECT 1
    FROM redirect_links rl
    JOIN promotion_assets pa
      ON pa.asset_id = rl.asset_id AND pa.promotion_id = rl.promotion_id
    JOIN promotions p
      ON p.id = rl.promotion_id
    JOIN assignment_collaborators ac
      ON ac.id = p.assignment_collaborator_id AND ac.status = 'active'
    JOIN assets a
      ON a.id = rl.asset_id
    WHERE rl.video_id = videos.id
      AND is_operator_for_user(ac.user_id)
  )
);



READY TO APPLY

text
FILE:
[your migration file]

ADD (apply):

ALTER POLICY operator_read_videos_sponsor_promotion ON public.videos
USING (
  EXISTS (
    SELECT 1
    FROM redirect_links rl
    JOIN promotion_assets pa
      ON pa.asset_id = rl.asset_id AND pa.promotion_id = rl.promotion_id
    JOIN promotions p
      ON p.id = rl.promotion_id
    JOIN assignment_collaborators ac
      ON ac.id = p.assignment_collaborator_id AND ac.status = 'active'
    JOIN assets a
      ON a.id = rl.asset_id
    WHERE rl.video_id = videos.id
      AND is_operator_for_user(ac.user_id)
  )
);

ROLLBACK (if needed):

ALTER POLICY operator_read_videos_sponsor_promotion ON public.videos
USING (
  EXISTS (
    SELECT 1
    FROM redirect_links rl
    JOIN promotion_assets pa
      ON pa.asset_id = rl.asset_id AND pa.promotion_id = rl.promotion_id
    JOIN promotions p
      ON p.id = rl.promotion_id
    JOIN assignment_collaborators ac
      ON ac.id = p.assignment_collaborator_id AND ac.status = 'active'
    JOIN assets a
      ON a.id = rl.asset_id
    WHERE rl.video_id = videos.id
      AND is_operator_for_org(a.organization_id)
  )
);