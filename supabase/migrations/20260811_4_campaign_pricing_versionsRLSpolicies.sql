-- ============================================================
-- Migration: campaign_pricing_versions RLS policies
-- Date: 2026-08-12
-- Purpose: Allow authenticated org members to SELECT / INSERT / UPDATE
--          pricing versions for campaigns they belong to.
--          No DELETE policy (history is retained).
-- ============================================================

-- RLS is already enabled on the table (confirmed). We only add policies.

-- Helper expression (same logic for all three policies):
-- campaign_pricing_versions.campaign_id
--   → campaigns.id
--   → campaigns.organization_id
--   → organization_members.organization_id
--   → organization_members.user_id = auth.uid()

CREATE POLICY "Users can view pricing versions for campaigns in their organization"
  ON public.campaign_pricing_versions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.organization_members om
        ON om.organization_id = c.organization_id
      WHERE c.id = campaign_pricing_versions.campaign_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert pricing versions for campaigns in their organization"
  ON public.campaign_pricing_versions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.organization_members om
        ON om.organization_id = c.organization_id
      WHERE c.id = campaign_pricing_versions.campaign_id
        AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update pricing versions for campaigns in their organization"
  ON public.campaign_pricing_versions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.organization_members om
        ON om.organization_id = c.organization_id
      WHERE c.id = campaign_pricing_versions.campaign_id
        AND om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.campaigns c
      JOIN public.organization_members om
        ON om.organization_id = c.organization_id
      WHERE c.id = campaign_pricing_versions.campaign_id
        AND om.user_id = auth.uid()
    )
  );