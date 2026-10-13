import { createPageCache } from './pageCache';
import type { JourneyContext, ImportAssetItem } from '../pages/CampaignJourneyMap';

// Key: `${viewerId}|${readOnlyOrgId}|${campaignId}`. In-memory only (Maps are stored as arrays).
export type CampaignJourneyMapCacheData = {
  selectedNodeIds: string[];
  panelExpanded: Record<string, boolean>;
  journeyEntryVideoIds: string[];
  journeyContext: JourneyContext;
  titles: Record<string, string>;
  thumbnails: Record<string, string>;
  importAssets: ImportAssetItem[];
  assetVideoEntries: [string, string[]][];
  assetTypeEntries: [string, string][];
};
export const campaignJourneyMapCache = createPageCache<CampaignJourneyMapCacheData>();