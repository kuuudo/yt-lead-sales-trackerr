import { createPageCache } from './pageCache';
import type { TreeNode, ContentVideo } from '../pages/CampaignStructureMap';

// Marketers + Own Assets (the slow query chain in useCampaignStructureData).
// Key: `${viewerId}|${readOnlyOrgId}|${campaignId}`.
export type CampaignStructureCacheData = {
  marketerNodes: TreeNode[];
  ownAssetNodes: TreeNode[];
};
export const campaignStructureCache = createPageCache<CampaignStructureCacheData>();

// Content videos (the fast single query in useCampaignContentBuckets).
// Key: `${viewerId}|${campaignId}`.
export type CampaignContentCacheData = {
  contentVideos: ContentVideo[];
};
export const campaignContentCache = createPageCache<CampaignContentCacheData>();
