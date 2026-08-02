import { createPageCache } from './pageCache';
import { Video, Campaign } from './supabase';

export type DashboardPageCacheData = {
  videos: Video[];
  campaigns: Campaign[];
  rawEvents: any[];
  stripePurchases: any[];
  pixelPurchases: any[];
};

export const dashboardPageCache = createPageCache<DashboardPageCacheData>();
