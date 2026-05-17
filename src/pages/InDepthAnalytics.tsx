import { normalizeEventType } from '../lib/analyticsConfig'; 
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, Campaign, Video, LeadMagnet } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  applyRevenue,
  finalizeMetrics,
  type StripePurchaseRow,
  type PixelPurchaseRow,
} from '../lib/analyticsConfig';
import { 
  BarChart3, Calendar, Filter, ChevronLeft, 
  ArrowUpDown, ExternalLink, Loader2, User, X
} from 'lucide-react';

type DateRange = '7days' | '30days' | '2months' | '6months' | '1year' | 'all';

type MetricType = 
  | 'landing_page_view' 
  | 'purchase_thankyou' 
  | 'lead_magnet_click' 
  | 'lead_magnet_thankyou' 
  | 'newsletter_click' 
  | 'newsletter_thankyou' 
  | 'call_booking_click' 
  | 'call_booking_thankyou' 
  | 'consultation_click' 
  | 'consultation_thankyou'
  | 'direct_offer_sales'
  | 'estimated_call_revenue'
  | 'consultation_revenue'
  | 'total_revenue'
  | 'rpc';

const METRIC_LABELS: Record<MetricType, string> = {
  landing_page_view: 'Landing Page Clicks',
  purchase_thankyou: 'Direct Purchases',
  lead_magnet_click: 'Lead Magnet Clicks',
  lead_magnet_thankyou: 'Lead Magnet Opt-ins',
  newsletter_click: 'Newsletter Clicks',
  newsletter_thankyou: 'Newsletter Opt-ins',
  call_booking_click: 'Call Booking Clicks',
  call_booking_thankyou: 'Call Bookings Confirmed',
  consultation_click: 'Consultation Page Clicks',
  consultation_thankyou: 'Consultation Purchases',
  direct_offer_sales: 'Direct Offer Sales ($)',
  estimated_call_revenue: 'Estimated Call Revenue ($)',
  consultation_revenue: 'Consultation Revenue ($)',
  total_revenue: 'Total Revenue ($)',
  rpc: 'Revenue Per Click ($)'
};

export default function InDepthAnalytics() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [stripePurchases, setStripePurchases] = useState<any[]>([]);
  const [pixelPurchases, setPixelPurchases] = useState<any[]>([]);

  const [dateRange, setDateRange] = useState<DateRange>('30days');
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);
  const [selectedLeadMagnets, setSelectedLeadMagnets] = useState<string[]>([]);

  type RevenueView = 'stripe' | 'pixel' | 'total';
  const [revenueView, setRevenueView] = useState<RevenueView>('stripe');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({
    key: 'total_revenue',
    direction: 'desc'
  });

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);

    try {
      const { data: cData } = await supabase.from('campaigns').select('*').eq('user_id', user?.id);
      const { data: vData } = await supabase.from('videos').select('*').eq('user_id', user?.id);
      const { data: lmData } = await supabase.from('lead_magnets').select('*');

      setCampaigns(cData || []);
      setVideos(vData || []);
      setLeadMagnets(lmData || []);

      if (!vData?.length) return;

      const videoIds = vData.map((v: any) => v.id);
      const campaignIds = vData.map((v: any) => v.campaign_id).filter(Boolean);

      const [eDirectData, eViaSessionData, spData, ppData] = await Promise.all([
        supabase.from('events')
          .select('video_id, campaign_id, event_type, created_at')
          .in('video_id', videoIds),

        supabase.from('events')
          .select('event_type, created_at, sessions!inner(video_id, campaign_id)')
          .is('video_id', null)
          .in('sessions.video_id', videoIds),

        supabase.from('stripe_purchases')
          .select('video_id, campaign_id, amount, session_id')
          .in('video_id', videoIds),

        supabase.from('pixel_purchases')
          .select('video_id, campaign_id, amount, event_type, session_id')
          .in('campaign_id', campaignIds),
      ]);

      const sessionResolvedEvents = (eViaSessionData.data || []).map((e: any) => ({
        video_id: e.sessions?.video_id ?? null,
        campaign_id: e.sessions?.campaign_id ?? null,
        event_type: e.event_type,
        created_at: e.created_at,
      })).filter((e: any) => e.video_id !== null);

      const allEvents = [...(eDirectData.data || []), ...sessionResolvedEvents];

      const pixelRaw = ppData.data || [];

      const nullPixelSessionIds = pixelRaw
        .filter((p: any) => !p.video_id && p.session_id)
        .map((p: any) => p.session_id);

      let pixelSessLookup: Record<string, any> = {};

      if (nullPixelSessionIds.length > 0) {
        const { data: sData } = await supabase
          .from('sessions')
          .select('id, video_id, campaign_id')
          .in('id', nullPixelSessionIds);

        (sData || []).forEach((s: any) => {
          if (s.video_id) pixelSessLookup[s.id] = {
            video_id: s.video_id,
            campaign_id: s.campaign_id
          };
        });
      }

      const enrichedPixel = pixelRaw.map((p: any) =>
        (!p.video_id && p.session_id && pixelSessLookup[p.session_id])
          ? { ...p, ...pixelSessLookup[p.session_id] }
          : p
      );

      const stripeRaw = spData.data || [];

      const nullStripeSessionIds = stripeRaw
        .filter((p: any) => !p.video_id && p.session_id)
        .map((p: any) => p.session_id);

      let stripeSessLookup: Record<string, any> = {};

      if (nullStripeSessionIds.length > 0) {
        const { data: sData } = await supabase
          .from('sessions')
          .select('id, video_id, campaign_id')
          .in('id', nullStripeSessionIds);

        (sData || []).forEach((s: any) => {
          if (s.video_id) stripeSessLookup[s.id] = {
            video_id: s.video_id,
            campaign_id: s.campaign_id
          };
        });
      }

      // ✅ FIXED: single pipeline (NO duplicate variable)
      let enrichedStripe = stripeRaw.map((p: any) =>
        (!p.video_id && p.session_id && stripeSessLookup[p.session_id])
          ? { ...p, ...stripeSessLookup[p.session_id] }
          : p
      );

      enrichedStripe = enrichedStripe.map((p: any) => {
        const campaign = (cData || []).find((c: any) => c.id === p.campaign_id);

        const isConsultation =
          campaign?.has_paid_consultation &&
          campaign?.consultation_fee != null &&
          Number(p.amount) === Number(campaign.consultation_fee);

        return {
          ...p,
          type: isConsultation ? 'consultation' : 'direct'
        };
      });

      setEvents(allEvents);
      setStripePurchases(enrichedStripe);
      setPixelPurchases(enrichedPixel);

    } finally {
      setLoading(false);
    }
  };

  const dateFilteredEvents = useMemo(() => {
    let cutoff = new Date();

    if (dateRange === '7days') cutoff.setDate(cutoff.getDate() - 7);
    if (dateRange === '30days') cutoff.setDate(cutoff.getDate() - 30);
    if (dateRange === '2months') cutoff.setMonth(cutoff.getMonth() - 2);
    if (dateRange === '6months') cutoff.setMonth(cutoff.getMonth() - 6);
    if (dateRange === '1year') cutoff.setFullYear(cutoff.getFullYear() - 1);
    if (dateRange === 'all') cutoff = new Date(0);

    return events.filter(e => new Date(e.created_at) >= cutoff);
  }, [events, dateRange]);

  const filteredVideos = useMemo(() => {
    return videos.filter(v => {
      if (selectedCampaignId !== 'all' && v.campaign_id !== selectedCampaignId) return false;
      return true;
    });
  }, [videos, selectedCampaignId]);

  const videoIds = useMemo(() => filteredVideos.map(v => v.id), [filteredVideos]);

  const processedVideos = useMemo(() => {
    const videoMetrics: Record<string, any> = {};

    filteredVideos.forEach(v => {
      const camp = campaigns.find(c => c.id === v.campaign_id);

      videoMetrics[v.id] = {
        video: v,
        campaign: camp,
        title: v.video_title,
        landing_page_view: 0,
        purchase_thankyou: 0,
        total_revenue: 0,
        rpc: 0,
        revenue_mode: 'hybrid',
        revenue_mode_label: 'Total (Hybrid)',
      };
    });

    dateFilteredEvents.forEach(e => {
      if (!videoIds.includes(e.video_id)) return;

      const v = videoMetrics[e.video_id];
      if (!v) return;

      const canonical = normalizeEventType(e.event_type);
      if (canonical && v[canonical] !== undefined) v[canonical]++;
    });

    filteredVideos.forEach(v => {
      const m = videoMetrics[v.id];
      const campaign = campaigns.find(c => c.id === v.campaign_id);

      const vidPixelPurchases = pixelPurchases.filter(p => p.video_id === v.id);
      const vidStripePurchases = stripePurchases.filter(p => p.video_id === v.id);

      applyRevenue(m, vidStripePurchases, vidPixelPurchases);
      finalizeMetrics(m, campaign);
    });

    return Object.values(videoMetrics);
  }, [filteredVideos, dateFilteredEvents, stripePurchases, pixelPurchases, campaigns, videoIds]);

  const sortedVideos = useMemo(() => {
    const items = [...processedVideos];

    items.sort((a, b) => {
      const key = sortConfig.key;
      const aVal = a[key];
      const bVal = b[key];

      const aNum = typeof aVal === 'string' ? parseFloat(aVal) : aVal;
      const bNum = typeof bVal === 'string' ? parseFloat(bVal) : bVal;

      return sortConfig.direction === 'asc'
        ? aNum - bNum
        : bNum - aNum;
    });

    return items;
  }, [processedVideos, sortConfig]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <Loader2 className="animate-spin text-red-600" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-black text-zinc-300">
      <div className="p-10">Analytics Loaded</div>
    </div>
  );
}