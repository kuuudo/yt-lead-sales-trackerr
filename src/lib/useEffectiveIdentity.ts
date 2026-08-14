// ─────────────────────────────────────────────────────────────────────────
// useEffectiveIdentity.ts
//
// For pages whose queries are scoped by user_id/email rather than (or in
// addition to) organization_id — currently Marketplace.tsx and
// Installation.tsx. Everything org-scoped should keep using
// useOrganization() directly; this hook exists specifically because those
// two pages are NOT purely org-scoped (see ViewingContext / useOrganization
// comments for why).
//
// Deliberately thin — does not re-resolve organization membership itself,
// just reads useOrganization() (already viewing-aware) and ViewingContext
// (source of truth for the member's id/email while viewing) and picks the
// right value for the current mode.
// ─────────────────────────────────────────────────────────────────────────

import { useAuth } from './auth';
import { useOrganization } from './useOrganization';
import { useViewing } from './ViewingContext';

export type EffectiveIdentity = {
  userId: string | null;
  email: string | null;
  organizationId: string | null;
  isReadOnly: boolean;
  loading: boolean;
};

export function useEffectiveIdentity(): EffectiveIdentity {
  const { user } = useAuth();
  const { organizationId, loading: orgLoading } = useOrganization();
  const { viewingMemberId, viewingMemberEmail, isReadOnly } = useViewing();

  if (isReadOnly) {
    return {
      userId: viewingMemberId,
      email: viewingMemberEmail,
      organizationId,
      isReadOnly: true,
      loading: orgLoading,
    };
  }

  return {
    userId: user?.id ?? null,
    email: user?.email ?? null,
    organizationId,
    isReadOnly: false,
    loading: orgLoading,
  };
}
