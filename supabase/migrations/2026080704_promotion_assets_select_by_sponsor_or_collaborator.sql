CREATE POLICY "promotion_assets_select_by_sponsor_or_collaborator"
ON public.promotion_assets
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM promotions p
    JOIN assignments a
      ON a.id = p.assignment_id
    LEFT JOIN assignment_collaborators ac
      ON ac.id = p.assignment_collaborator_id
    WHERE p.id = promotion_assets.promotion_id
      AND (
        a.created_by_user_id = auth.uid()
        OR ac.user_id = auth.uid()
      )
  )
);