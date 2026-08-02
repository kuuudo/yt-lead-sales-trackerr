/**
 * Central data cache for VS-Track.
 *
 * Rule: any resource that many pages need (videos, campaigns, lead magnets)
 * lives here. Pages call `useDataStore().fetchVideos()` etc. That function
 * only hits Supabase the FIRST time (or when explicitly forced) — after
 * that it's an instant read from memory. This is what stops the
 * "every page refetches on mount" reload feeling.
 *
 * Usage in a page (replaces a local fetchData()):
 *
 *   const { videos, campaigns, videosLoaded, fetchVideos, fetchCampaigns } = useDataStore();
 *
 *   useEffect(() => {
 *     if (organizationId) {
 *       fetchVideos(organizationId);
 *       fetchCampaigns(organizationId);
 *     }
 *   }, [organizationId]);
 *
 * fetchVideos/fetchCampaigns are no-ops if already loaded, so mounting the
 * page again (route change, remount, StrictMode double-invoke) does not
 * refire Supabase queries.
 */
import { create } from 'zustand';
import { supabase, Video, Campaign, LeadMagnet } from './supabase';

interface DataState {
  // ---- data ----
  videos: Video[];
  campaigns: Campaign[];
  leadMagnets: LeadMagnet[];

  // ---- load-state flags: have we fetched this org's data yet? ----
  videosLoaded: boolean;
  campaignsLoaded: boolean;
  leadMagnetsLoaded: boolean;
  videosLoading: boolean;
  campaignsLoading: boolean;

  // ---- track which org the cache belongs to, so switching orgs invalidates it ----
  loadedOrgId: string | null;

  // ---- actions ----
  fetchVideos: (organizationId: string, force?: boolean) => Promise<void>;
  fetchCampaigns: (organizationId: string, force?: boolean) => Promise<void>;
  fetchLeadMagnetsForCampaigns: (campaignIds: string[], force?: boolean) => Promise<void>;

  // ---- local mutations (no refetch needed) ----
  addVideo: (video: Video) => void;
  updateVideo: (id: string, patch: Partial<Video>) => void;
  removeVideo: (id: string) => void;
  addCampaign: (campaign: Campaign) => void;
  updateCampaign: (id: string, patch: Partial<Campaign>) => void;

  // ---- escape hatch ----
  invalidateAll: () => void;
}

export const useDataStore = create<DataState>((set, get) => ({
  videos: [],
  campaigns: [],
  leadMagnets: [],
  videosLoaded: false,
  campaignsLoaded: false,
  leadMagnetsLoaded: false,
  videosLoading: false,
  campaignsLoading: false,
  loadedOrgId: null,

  fetchVideos: async (organizationId, force = false) => {
    const state = get();
    // switching org? throw the cache away
    if (state.loadedOrgId && state.loadedOrgId !== organizationId) {
      set({ videosLoaded: false, campaignsLoaded: false, leadMagnetsLoaded: false, loadedOrgId: organizationId });
    } else {
      set({ loadedOrgId: organizationId });
    }

    if (get().videosLoaded && !force) return; // <-- the whole fix, in one line
    if (get().videosLoading) return; // avoid duplicate in-flight requests

    set({ videosLoading: true });
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[dataStore] fetchVideos failed:', error);
      set({ videosLoading: false });
      return;
    }
    set({ videos: data || [], videosLoaded: true, videosLoading: false });
  },

  fetchCampaigns: async (organizationId, force = false) => {
    if (get().campaignsLoaded && !force) return;
    if (get().campaignsLoading) return;

    set({ campaignsLoading: true });
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('organization_id', organizationId);

    if (error) {
      console.error('[dataStore] fetchCampaigns failed:', error);
      set({ campaignsLoading: false });
      return;
    }
    set({ campaigns: data || [], campaignsLoaded: true, campaignsLoading: false });
  },

  fetchLeadMagnetsForCampaigns: async (campaignIds, force = false) => {
    if (get().leadMagnetsLoaded && !force) return;
    if (campaignIds.length === 0) return;

    const { data, error } = await supabase
      .from('lead_magnets')
      .select('*')
      .in('campaign_id', campaignIds);

    if (error) {
      console.error('[dataStore] fetchLeadMagnetsForCampaigns failed:', error);
      return;
    }
    set({ leadMagnets: data || [], leadMagnetsLoaded: true });
  },

  addVideo: (video) => set((s) => ({ videos: [video, ...s.videos] })),
  updateVideo: (id, patch) =>
    set((s) => ({ videos: s.videos.map((v) => (v.id === id ? { ...v, ...patch } : v)) })),
  removeVideo: (id) => set((s) => ({ videos: s.videos.filter((v) => v.id !== id) })),

  addCampaign: (campaign) => set((s) => ({ campaigns: [...s.campaigns, campaign] })),
  updateCampaign: (id, patch) =>
    set((s) => ({ campaigns: s.campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),

  invalidateAll: () =>
    set({ videosLoaded: false, campaignsLoaded: false, leadMagnetsLoaded: false, loadedOrgId: null }),
}));
