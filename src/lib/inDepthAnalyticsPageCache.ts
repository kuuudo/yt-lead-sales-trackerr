import { createPageCache } from './pageCache';
import { Campaign, Video, LeadMagnet } from './supabase';

export type InDepthAnalyticsPageCacheData = {
  campaigns: Campaign[];
  videos: Video[];
  leadMagnets: LeadMagnet[];
  rawEvents: any[];
  stripePurchases: any[];
  pixelPurchases: any[];
  // Cached so a cache hit needs zero Supabase queries (was re-queried on every hit).
  campaignLinkGrid: Map<string, Map<string, Set<string>>>;
};

// Keyed by user id — InDepthAnalytics.tsx's queries filter by user_id, not
// organization_id, so the cache key must match that.
export const inDepthAnalyticsPageCache = createPageCache<InDepthAnalyticsPageCacheData>();
