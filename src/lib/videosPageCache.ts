import { createPageCache } from './pageCache';
import { Video, Campaign, LeadMagnet } from './supabase';

export type VideosPageCacheData = {
  videos: Video[];
  campaigns: Campaign[];
  allLeadMagnets: LeadMagnet[];
};

export const videosPageCache = createPageCache<VideosPageCacheData>();
