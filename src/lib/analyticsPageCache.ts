import { createPageCache } from './pageCache';
import { Campaign, Video, LeadMagnet } from './supabase';

export type AnalyticsPageCacheData = {
  campaigns: Campaign[];
  videos: Video[];
  leadMagnets: LeadMagnet[];
  events: any[];
  stripePurchases: any[];
  pixelPurchases: any[];
};

export const analyticsPageCache = createPageCache<AnalyticsPageCacheData>();
