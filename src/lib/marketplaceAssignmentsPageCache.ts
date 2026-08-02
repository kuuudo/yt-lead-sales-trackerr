import { createPageCache } from './pageCache';
import { type AssignmentSummary } from '../services/assignment/collaborationHub';

export type MarketplaceAssignmentsPageCacheData = {
  assignments: AssignmentSummary[];
};

// Archive-id map is intentionally NOT part of this cache — it's always
// fetched fresh so it can never go stale relative to an archive/restore
// action (those handlers don't call a refetch, they only patch local state).
export const marketplaceAssignmentsPageCache = createPageCache<MarketplaceAssignmentsPageCacheData>();
