// ─────────────────────────────────────────────────────────────────────────
// ViewingContext.tsx
//
// Operator Read-Only Viewing Mode — frontend representation only.
//
// This context does NOT grant any access. It only tracks which member's
// data the UI should currently display. The actual authorization check
// happens server-side, in Supabase RLS, via the SECURITY DEFINER helper
// functions (is_operator_for_user / is_operator_for_org /
// resolve_member_organization) added in the Phase 1 migration. If a user
// is not really an Operator for the target member, resolve_member_organization
// returns null and every downstream query simply returns no rows — this
// context has no way to force data through that isn't already permitted
// by RLS.
//
// enterViewing() is only ever wired to a real "View account" button on
// MemberDetail.tsx (an authenticated Operator looking at a member row
// that ALREADY passed the operator_for_user check to be visible there).
// There is no route, param, or public API in this file that lets an
// arbitrary user set viewingMemberId to someone else's id and get data —
// the id has to come from a place that already proved the relationship.
// ─────────────────────────────────────────────────────────────────────────

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { supabase } from './supabase';

type ViewingState = {
  viewingMemberId: string | null;
  viewingOrgId: string | null;
  viewingMemberName: string | null;
  viewingMemberEmail: string | null;
};

type ViewingContextValue = ViewingState & {
  isReadOnly: boolean;
  enterViewing: (memberId: string, memberName: string) => Promise<void>;
  exitViewing: () => void;
};

const ViewingContext = createContext<ViewingContextValue | null>(null);

const STORAGE_KEY = 'vstrk_viewing_state';

function loadPersisted(): ViewingState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.viewingMemberId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function ViewingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ViewingState | null>(() => loadPersisted());

  const enterViewing = useCallback(async (memberId: string, memberName: string) => {
    // Server-side authorization check — returns null if the caller is not
    // actually an Operator for this member. We do not fabricate a
    // fallback org id if this comes back empty.
    const { data: orgId, error: orgErr } = await supabase.rpc('resolve_member_organization', {
      member_user_id: memberId,
    });
    if (orgErr) {
      throw new Error(`Could not resolve member organization: ${orgErr.message}`);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', memberId)
      .maybeSingle();

    const next: ViewingState = {
      viewingMemberId: memberId,
      viewingOrgId: orgId ?? null,
      viewingMemberName: memberName,
      // Only what's needed to key Marketplace's email-scoped invitation
      // lookup — no other member profile fields are stored.
      viewingMemberEmail: profile?.email ?? null,
    };

    setState(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // sessionStorage unavailable (private browsing etc.) — viewing mode
      // still works for this tab via React state, it just won't survive
      // a refresh. Not fatal.
    }
  }, []);

  const exitViewing = useCallback(() => {
    setState(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<ViewingContextValue>(() => ({
    viewingMemberId: state?.viewingMemberId ?? null,
    viewingOrgId: state?.viewingOrgId ?? null,
    viewingMemberName: state?.viewingMemberName ?? null,
    viewingMemberEmail: state?.viewingMemberEmail ?? null,
    isReadOnly: !!state?.viewingMemberId,
    enterViewing,
    exitViewing,
  }), [state, enterViewing, exitViewing]);

  return <ViewingContext.Provider value={value}>{children}</ViewingContext.Provider>;
}

export function useViewing(): ViewingContextValue {
  const ctx = useContext(ViewingContext);
  if (!ctx) {
    throw new Error('useViewing must be used within a ViewingProvider');
  }
  return ctx;
}
