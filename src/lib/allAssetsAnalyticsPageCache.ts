import { createPageCache } from './pageCache';
import type { AssetAnalyticsRow } from '../pages/analytics-lego/assetAnalyticsTypes';

export type AllAssetsAnalyticsPageCacheData = {
  rows: AssetAnalyticsRow[];
  organizationId: string | null;
};

// Keyed by user id + the request key (date range, custom range, revenue source,
// read-only viewing ids) — see useAssetAnalyticsRows in AllAssetsAnalytics.tsx.
// Different filters / a different user = cache miss = normal fetch.
export const allAssetsAnalyticsPageCache = createPageCache<AllAssetsAnalyticsPageCacheData>();
