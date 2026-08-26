import { createPageCache } from './pageCache';
import { Video, Campaign, LeadMagnet } from './supabase';
import { VideoArchiveContext } from '../services/video/getVideoArchiveContext';

export type VideosPageCacheData = {
  videos: Video[];
  campaigns: Campaign[];
  allLeadMagnets: LeadMagnet[];
  // Phase 2 (Video archive): same convention as assetsPageCache.ts's
  // archiveContextMap (Phase 1) — resolver output cached alongside the
  // raw rows so a cache hit doesn't need to re-run getVideoArchiveContexts*
  // before the page can render Active / Level 1 / Level 2 buckets.
  archiveContextMap: Map<string, VideoArchiveContext>;
};

export const videosPageCache = createPageCache<VideosPageCacheData>();
