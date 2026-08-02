import { createPageCache } from './pageCache';
import { type InvitationSummary } from '../services/assignment/collaborationHub';

export type MarketplaceInvitationsPageCacheData = {
  invitations: InvitationSummary[];
};

// Keyed by email (that's what listMyInvitations filters on), with a
// fallback key for the edge case where the profile lookup returns no email.
export const marketplaceInvitationsPageCache = createPageCache<MarketplaceInvitationsPageCacheData>();
