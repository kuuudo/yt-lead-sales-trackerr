// src/lib/onboardingProgress.ts
//
// Post-signup onboarding: who sees it, and which step they are on.
//
// WHO SEES IT
//   Any account created at/after ONBOARDING_LAUNCH_AT that has not clicked
//   "Finish" yet. Regular signups and Team Invite users are treated the same.
//   Accounts created before the launch time are never touched.
//   Operator read-only viewing never shows it.
//
// WHERE STATE LIVES (no database changes)
//   - "Finished" flag: auth user metadata (`onboarding_finished_at`), so it
//     follows the account across browsers and devices.
//   - Current step: derived from real data every time (campaign, video, asset, collab),
//     so leaving and coming back always lands on the right step.
//
// WORKSPACE
//   This file never creates a workspace and never calls createUserWorkspace.
//   Right after signup the app can render before createUserWorkspace has
//   finished, so we only READ organization_members, retrying for a few seconds.
//   If no workspace turns up, onboarding is skipped for this page load (fail
//   open, same idea as useAccessStatus) so nobody can get stuck.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { useViewing } from './ViewingContext';

/**
 * Accounts created BEFORE this moment never see the onboarding.
 * Set it to the moment you deploy. (To test with a brand-new account before
 * deploying, make sure this is earlier than that account's creation time.)
 */
export const ONBOARDING_LAUNCH_AT = '2026-10-31T00:00:00.000Z';

const FINISHED_KEY = 'onboarding_finished_at';
const WORKSPACE_RETRIES = 10;
const WORKSPACE_RETRY_MS = 1000;

export type OnboardingStage = 'campaign' | 'track' | 'asset' | 'collab' | 'finish';
export type OnboardingState = 'off' | 'loading' | OnboardingStage;

function isEligibleNewUser(user: User | null): boolean {
  if (!user) return false;
  const created = Date.parse(user.created_at);
  if (!Number.isFinite(created) || created < Date.parse(ONBOARDING_LAUNCH_AT)) return false;
  return !user.user_metadata?.[FINISHED_KEY];
}

/** Same owner-membership lookup the Campaigns page uses (useOrganization), with a short retry. */
async function findOrganizationId(userId: string, shouldStop: () => boolean): Promise<string | null> {
  for (let attempt = 0; attempt < WORKSPACE_RETRIES; attempt++) {
    const { data, error } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('role', 'owner')
      .limit(1);
    if (!error && data && data.length > 0) return data[0].organization_id as string;
    if (shouldStop()) return null;
    await new Promise((resolve) => setTimeout(resolve, WORKSPACE_RETRY_MS));
  }
  return null;
}

/** First missing piece wins: campaign -> tracked video -> asset in the Library -> collaboration -> finish. */
async function deriveStage(organizationId: string, userId: string): Promise<OnboardingStage> {
  const campaigns = await supabase
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('is_system', false)
    .is('archived_at', null);
  if (campaigns.error) throw campaigns.error;
  if (!campaigns.count) return 'campaign';

  const videos = await supabase
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('deleted_at', null);
  if (videos.error) throw videos.error;
  if (!videos.count) return 'track';

  const libraryAssets = await supabase
    .from('assets')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .not('added_to_library_at', 'is', null);
  if (libraryAssets.error) throw libraryAssets.error;
  if (!libraryAssets.count) return 'asset';

  // Start First Collaboration is done once the user owns a Promotion that runs through an
  // Assignment (assignment_collaborator_id set). createPromotion.ts only sets that id for an
  // ACTIVE collaborator, which exists only after the invitation was accepted, so this row
  // means: invited -> accepted -> "Start Promoting" pressed. A Promotion the user made
  // directly for their own Asset has assignment_collaborator_id = null and does not count.
  const collabPromotions = await supabase
    .from('promotions')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('owner_user_id', userId)
    .not('assignment_collaborator_id', 'is', null);
  if (collabPromotions.error) {
    // Fail soft: never trap someone on a step we cannot read. Skip to Finish instead of
    // switching the whole onboarding off.
    console.error('[onboarding] could not read collaboration progress, skipping that step:', collabPromotions.error);
    return 'finish';
  }
  if (!collabPromotions.count) return 'collab';

  return 'finish';
}

export function useOnboarding() {
  const { user } = useAuth();
  const { isReadOnly } = useViewing();
  const userId = user?.id ?? null;
  const eligible = isEligibleNewUser(user) && !isReadOnly;

  const [state, setState] = useState<OnboardingState>('loading');
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const orgRef = useRef<string | null>(null);
  const runId = useRef(0);

  /** Re-reads campaign / video / asset / collaboration data and moves to the matching step. */
  const refresh = useCallback(async () => {
    const orgId = orgRef.current;
    if (!orgId || !userId) return;
    const myRun = ++runId.current;
    try {
      const stage = await deriveStage(orgId, userId);
      if (runId.current === myRun) setState(stage);
    } catch (err) {
      console.error('[onboarding] could not read progress, skipping onboarding for now:', err);
      if (runId.current === myRun) setState('off');
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || !eligible) {
      setState('off');
      return;
    }
    let cancelled = false;
    setState('loading');

    (async () => {
      try {
        // Ask the server once, so finishing on another device is respected
        // even if this device still holds an older session.
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        if (data.user?.user_metadata?.[FINISHED_KEY]) {
          setState('off');
          return;
        }

        const orgId = await findOrganizationId(userId, () => cancelled);
        if (cancelled) return;
        if (!orgId) {
          console.error('[onboarding] no workspace found for this user, skipping onboarding for now');
          setState('off');
          return;
        }
        orgRef.current = orgId;
        setOrganizationId(orgId);
        await refresh();
      } catch (err) {
        console.error('[onboarding] unexpected error, skipping onboarding for now:', err);
        if (!cancelled) setState('off');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, eligible, refresh]);

  /** The only thing that permanently stops the onboarding. Throws if saving fails. */
  const finish = useCallback(async () => {
    const { error } = await supabase.auth.updateUser({
      data: { [FINISHED_KEY]: new Date().toISOString() },
    });
    if (error) throw error;
    setState('off');
  }, []);

  return {
    state: eligible ? state : ('off' as OnboardingState),
    organizationId,
    refresh,
    finish,
  };
}
