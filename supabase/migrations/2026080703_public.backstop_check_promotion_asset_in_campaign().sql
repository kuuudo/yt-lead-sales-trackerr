CREATE OR REPLACE FUNCTION public.backstop_check_promotion_asset_in_campaign()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_assignment_id uuid;
  v_org_id uuid;
  v_is_eligible boolean;
  v_assignment_creator uuid;
BEGIN

  SELECT
    assignment_id,
    organization_id
  INTO
    v_assignment_id,
    v_org_id
  FROM promotions
  WHERE id = NEW.promotion_id;

  IF v_assignment_id IS NOT NULL THEN

    /*
     * Sponsor path:
     * If the caller is the Assignment creator, allow them to add
     * any Asset belonging to the Promotion's organization.
     *
     * This is the Promotion Detail "Add Asset" MVP.
     * It deliberately does NOT require assignment_assets.
     */
    SELECT created_by_user_id
    INTO v_assignment_creator
    FROM assignments
    WHERE id = v_assignment_id;

    IF v_assignment_creator = auth.uid() THEN

      SELECT EXISTS (
        SELECT 1
        FROM assets
        WHERE id = NEW.asset_id
          AND organization_id = v_org_id
      )
      INTO v_is_eligible;

      IF NOT v_is_eligible THEN
        RAISE EXCEPTION
          'Asset % does not belong to organization % (Promotion %).',
          NEW.asset_id,
          v_org_id,
          NEW.promotion_id;
      END IF;

    ELSE

      /*
       * Collaborator path:
       * Preserve the existing Assignment authorization rule.
       */
      SELECT EXISTS (
        SELECT 1
        FROM assignment_assets
        WHERE assignment_id = v_assignment_id
          AND asset_id = NEW.asset_id
      )
      INTO v_is_eligible;

      IF NOT v_is_eligible THEN
        RAISE EXCEPTION
          'Asset % is not authorized by Assignment % (Promotion %).',
          NEW.asset_id,
          v_assignment_id,
          NEW.promotion_id;
      END IF;

    END IF;

  ELSE

    /*
     * Non-Assignment / organization-owner path.
     * Preserve existing behavior.
     */
    SELECT EXISTS (
      SELECT 1
      FROM assets
      WHERE id = NEW.asset_id
        AND organization_id = v_org_id
    )
    INTO v_is_eligible;

    IF NOT v_is_eligible THEN
      RAISE EXCEPTION
        'Asset % does not belong to organization % (Promotion %).',
        NEW.asset_id,
        v_org_id,
        NEW.promotion_id;
    END IF;

  END IF;

  RETURN NEW;
END;
$function$;