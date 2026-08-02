import { createPageCache } from './pageCache';
import { Campaign, Video, LeadMagnet } from './supabase';

export type InDepthAnalyticsWidgetPageCacheData = {
  videos: Video[];
  campaigns: Campaign[];
  leadMagnets: LeadMagnet[];
  rawEvents: any[];
  stripePurchases: any[];
  pixelPurchases: any[];
};

export const inDepthAnalyticsWidgetPageCache = createPageCache<InDepthAnalyticsWidgetPageCacheData>();
