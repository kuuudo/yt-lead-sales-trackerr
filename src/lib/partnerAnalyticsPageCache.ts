import { createPageCache } from './pageCache';
import type { PartnerTableRow } from '../services/promotion/getPartnerAnalytics';

// Key: `${userId}|${orgId}|${mode}|${preset}|${customStart~customEnd}`. In-memory only.
export type PartnerAnalyticsCacheData = {
  partners: PartnerTableRow[];
  selectedIds: string[];
  hasMoreAvailable: boolean;
  showingAllPartners: boolean;
};

// One entry per mode so switching Marketers <-> Sponsors does not evict the other.
export const partnerAnalyticsCaches = {
  marketers: createPageCache<PartnerAnalyticsCacheData>(),
  sponsors: createPageCache<PartnerAnalyticsCacheData>(),
};