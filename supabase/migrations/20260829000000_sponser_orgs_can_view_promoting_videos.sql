CREATE POLICY "Sponsor orgs can view promoting videos for active promotions"
ON public.videos
FOR SELECT
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
      AND a.organization_id IN (
        SELECT organization_members.organization_id
        FROM organization_members
        WHERE organization_members.user_id = auth.uid()
      )
  )
);