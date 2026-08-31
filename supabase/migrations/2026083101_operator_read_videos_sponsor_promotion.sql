CREATE POLICY operator_read_videos_sponsor_promotion
ON public.videos
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM redirect_links rl
    JOIN promotion_assets pa
      ON pa.asset_id = rl.asset_id
     AND pa.promotion_id = rl.promotion_id
    JOIN promotions p
      ON p.id = rl.promotion_id
    JOIN assignment_collaborators ac
      ON ac.id = p.assignment_collaborator_id
     AND ac.status = 'active'
    JOIN assets a
      ON a.id = rl.asset_id
    WHERE rl.video_id = videos.id
      AND is_operator_for_org(a.organization_id)
  )
);