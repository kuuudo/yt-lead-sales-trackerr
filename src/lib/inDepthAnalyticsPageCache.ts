import { createPageCache } from './pageCache';
import { Campaign, Video, LeadMagnet } from './supabase';

export type InDepthAnalyticsPageCacheData = {
  campaigns: Campaign[];
  videos: Video[];
  leadMagnets: LeadMagnet[];
  rawEvents: any[];
  stripePurchases: any[];
  pixelPurchases: any[];
};

// Keyed by user id — InDepthAnalytics.tsx's queries filter by user_id, not
// organization_id, so the cache key must match that.
export const inDepthAnalyticsPageCache = createPageCache<InDepthAnalyticsPageCacheData>();
