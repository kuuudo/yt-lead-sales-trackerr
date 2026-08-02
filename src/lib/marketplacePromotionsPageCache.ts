import { createPageCache } from './pageCache';
import { type PromotionSummary } from '../services/assignment/collaborationHub';

export type MarketplacePromotionsPageCacheData = {
  promotions: PromotionSummary[];
};

// Archive-id map intentionally NOT cached — same reasoning as
// marketplaceAssignmentsPageCache.ts.
export const marketplacePromotionsPageCache = createPageCache<MarketplacePromotionsPageCacheData>();
