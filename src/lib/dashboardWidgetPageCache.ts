import { createPageCache } from './pageCache';
import { Video, Campaign } from './supabase';

export type DashboardWidgetPageCacheData = {
  videos: Video[];
  campaigns: Campaign[];
  rawEvents: any[];
  stripePurchases: any[];
  pixelPurchases: any[];
};

export const dashboardWidgetPageCache = createPageCache<DashboardWidgetPageCacheData>();
