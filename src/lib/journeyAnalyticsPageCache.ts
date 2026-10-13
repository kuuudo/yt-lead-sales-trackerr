import { createPageCache } from './pageCache';
import type { JourneyDataset } from '../pages/JourneyAnalytics';

// Key: `${userId}|${effectiveOrgId}`. In-memory only (Map/Set are kept as-is).
export const journeyAnalyticsPageCache = createPageCache<JourneyDataset>();