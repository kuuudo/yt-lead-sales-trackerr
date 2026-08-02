import React, { useState, useEffect, useMemo } from 'react';
import { useLanguage } from '../lib/hooks';
import { supabase, Campaign, Video, LeadMagnet } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  type PixelPurchaseRow,
  type StripePurchaseRow,
} from '../lib/analyticsConfig';
import {
  processVideoMetrics,
  enrichPixelPurchases,
  type RawEvent,
  type CampaignMeta,
} from '../lib/analyticsProcessor';
import { 
  BarChart3, Calendar, Filter, ChevronDown, Check, 
  MousePointer2, DollarSign, Users, Phone, Briefcase, 
  TrendingUp, Activity, User, LayoutDashboard, Search,
  ArrowUpDown, Eye, ExternalLink, Loader2, Menu, X,
  ChevronLeft, ChevronRight, Info, AlertCircle
} from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useOrganization } from '../lib/useOrganization'
import { analyticsPageCache } from '../lib/analyticsPageCache';

type DateRange = '7days' | '28days' | '30days' | '3months' | '6months' | '12months';

type MetricType = 
  | 'landing_page_view' 
  | 'purchase_thankyou' 
  | 'lead_magnet_click' 
  | 'newsletter_click' 
  | 'newsletter_thankyou' 
  | 'call_booking_click' 
  | 'call_booking_thankyou' 
  | 'consultation_click' 
  | 'consultation_thankyou'
  | 'direct_offer_revenue'
  | 'estimated_call_revenue'
  | 'consultation_revenue'
  | 'total_revenue'
  | 'rpc';

const METRIC_LABELS: Record<MetricType, string> = {
  landing_page_view: 'Landing Page Clicks',
  purchase_thankyou: 'Direct Purchases',
  lead_magnet_click: 'Lead Magnet Clicks',
  newsletter_click: 'Newsletter Clicks',
  newsletter_thankyou: 'Newsletter Opt-ins',
  call_booking_click: 'Call Booking Clicks',
  call_booking_thankyou: 'Call Bookings Confirmed',
  consultation_click: 'Consultation Page Clicks',
  consultation_thankyou: 'Consultation Purchases',
  direct_offer_revenue: 'Direct Offer Sales',
  estimated_call_revenue: 'Estimated Call Revenue',
  consultation_revenue: 'Consultation Revenue',
  total_revenue: 'Total Revenue',
  rpc: 'Revenue Per Click'
};

const METRIC_COLORS: Record<string, string> = {
  landing_page_view: '#3b82f6',
  purchase_thankyou: '#22c55e',
  lead_magnet_click: '#6366f1',
  newsletter_click: '#ec4899',
  newsletter_thankyou: '#f97316',
  call_booking_click: '#8b5cf6',
  call_booking_thankyou: '#a855f7',
  consultation_click: '#ef4444',
  consultation_thankyou: '#dc2626',
  direct_offer_revenue: '#16a34a',
  estimated_call_revenue: '#2563eb',
  consultation_revenue: '#9333ea',
  total_revenue: '#dc2626',
  rpc: '#0ea5e9'
};

export default function Analytics() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [stripePurchases, setStripePurchases] = useState<any[]>([]);
  const [pixelPurchases, setPixelPurchases] = useState<any[]>([]);

  // Filters from Search Params
  const [dateRange, setDateRange] = useState<DateRange>((searchParams.get('dr') as DateRange) || '28days');
  const [selectedGoals, setSelectedGoals] = useState<string[]>(searchParams.get('goals')?.split(',').filter(Boolean) || []);
  const [selectedLeadMagnets, setSelectedLeadMagnets] = useState<string[]>(searchParams.get('lms')?.split(',').filter(Boolean) || []);
  const [selectedVideoIds, setSelectedVideoIds] = useState<string[]>(searchParams.get('vids')?.split(',').filter(Boolean) || []);
  const [warning, setWarning] = useState<string | null>(null);
  
  // Source toggle — global state that drives ALL KPI cards
  // CRITICAL: default must be 'total' on initial render, refresh, and page revisit
  type ActiveSource = 'total' | 'pixel' | 'stripe';
  const [activeSource, setActiveSource] = useState<ActiveSource>('total');

  // Campaign filter
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');

  // UI State
  const [chartType, setChartType] = useState<'line' | 'bar'>('line');
  const [granularity, setGranularity] = useState<'daily' | 'weekly'>('daily');
  const [showChart, setShowChart] = useState(true);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(true);
  const [isVideoSelectorOpen, setIsVideoSelectorOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'total_revenue', direction: 'desc' });

  // Sync state to search params
  useEffect(() => {
    const params: Record<string, string> = {};
    if (dateRange !== '28days') params.dr = dateRange;
    if (selectedGoals.length > 0) params.goals = selectedGoals.join(',');
    if (selectedLeadMagnets.length > 0) params.lms = selectedLeadMagnets.join(',');
    if (selectedVideoIds.length > 0) params.vids = selectedVideoIds.join(',');
    
    setSearchParams(params, { replace: true });
  }, [dateRange, selectedGoals, selectedLeadMagnets, selectedVideoIds]);

  useEffect(() => {
    if (warning) {
      const timer = setTimeout(() => setWarning(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [warning]);

   useEffect(() => {
    if (user && organizationId) {
      const cached = analyticsPageCache.get(organizationId);
      if (cached) {
        console.log('[Analytics] Cache hit', new Date(cached.cachedAt).toLocaleTimeString());
        setCampaigns(cached.data.campaigns);
        setVideos(cached.data.videos);
        setLeadMagnets(cached.data.leadMagnets);
        setEvents(cached.data.events);
        setStripePurchases(cached.data.stripePurchases);
        setPixelPurchases(cached.data.pixelPurchases);
        setLoading(false);
        return;
      }
      console.log('[Analytics] Cache miss — fetching from Supabase');
      fetchData();
    }
  }, [user?.id, organizationId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: cData } = await supabase
        .from('campaigns')
        .select('*')
        .eq('organization_id', organizationId);

      const { data: vData } = await supabase
        .from('videos')
        .select('*')
        .eq('organization_id', organizationId);
      const { data: lmData } = await supabase.from('lead_magnets').select('*');
      
      setCampaigns(cData || []);
      setVideos(vData || []);
      setLeadMagnets(lmData || []);

      if (!vData || vData.length === 0) {
        if (organizationId) {
          analyticsPageCache.set(organizationId, {
            campaigns: cData || [], videos: vData || [], leadMagnets: lmData || [],
            events: [], stripePurchases: [], pixelPurchases: [],
          });
          console.log('[Analytics] Cache updated (no videos)');
        }
        return;
      }

      const videoIds    = vData.map((v: any) => v.id);
      const campaignIds = vData.map((v: any) => v.campaign_id).filter(Boolean);

      // ── Fetch in parallel — mirrors InDepthAnalytics exactly ────────────────
      // NOTE: stripe_purchase_type is the authoritative stripe table (has payment_type).
      //       stripe_purchases does NOT have payment_type and must NOT be used.
      const [eDirectData, eViaSessionData, spData, ppData] = await Promise.all([
        supabase.from('events')
          .select('video_id, campaign_id, event_type, created_at')
          .in('video_id', videoIds),

        supabase.from('events')
          .select('event_type, created_at, sessions!inner(video_id, campaign_id)')
          .is('video_id', null)
          .in('sessions.video_id', videoIds),

        // stripe_purchase_type — HAS payment_type column
        (() => {
          const q = supabase
            .from('stripe_purchase_type')
            .select('video_id, campaign_id, amount, stripe_session_id, payment_type');
          if (campaignIds.length) {
            return q.or(
              `video_id.in.(${videoIds.join(',')}),campaign_id.in.(${campaignIds.join(',')})`,
            );
          }
          return q.in('video_id', videoIds);
        })(),

        // pixel_purchases — fetch by video_id OR campaign_id to catch all rows.
        // Some pixel rows have null video_id but valid campaign_id, and vice versa.
        // Using OR here mirrors the stripe_purchase_type fetch pattern.
        (() => {
          const q = supabase
            .from('pixel_purchases')
            .select('video_id, campaign_id, amount, event_type, session_id, created_at');
          if (campaignIds.length && videoIds.length) {
            return q.or(
              `video_id.in.(${videoIds.join(',')}),campaign_id.in.(${campaignIds.join(',')})`,
            );
          }
          if (campaignIds.length) return q.in('campaign_id', campaignIds);
          return q.in('video_id', videoIds);
        })(),
      ]);

      // Flatten session-resolved events
      const sessionResolvedEvents = (eViaSessionData.data || []).map((e: any) => ({
        video_id:    e.sessions?.video_id    ?? null,
        campaign_id: e.sessions?.campaign_id ?? null,
        event_type:  e.event_type,
        created_at:  e.created_at,
      })).filter((e: any) => e.video_id !== null);

      // Normalize direct events to plain RawEvent shape (strips any Supabase join
      // artefacts like a `sessions` array that would conflict with RawEvent's type).
      const directEvents: RawEvent[] = (eDirectData.data || []).map((e: any) => ({
        video_id:    e.video_id    ?? null,
        campaign_id: e.campaign_id ?? null,
        event_type:  e.event_type  as string,
        created_at:  e.created_at  as string,
      }));

      const allEvents: RawEvent[] = [...directEvents, ...sessionResolvedEvents];

      // ── Session lookup helper (mirrors InDepthAnalytics) ─────────────────────
      const buildSessionLookup = async (
        rows: any[],
      ): Promise<Record<string, { video_id: string; campaign_id: string }>> => {
        const missingIds = rows
          .filter((p: any) => !p.video_id && p.session_id)
          .map((p: any) => p.session_id);
        if (!missingIds.length) return {};
        const { data: sData } = await supabase
          .from('sessions')
          .select('id, video_id, campaign_id')
          .in('id', missingIds);
        const lookup: Record<string, { video_id: string; campaign_id: string }> = {};
        (sData || []).forEach((s: any) => {
          if (s.video_id) lookup[s.id] = { video_id: s.video_id, campaign_id: s.campaign_id };
        });
        return lookup;
      };

      // Map stripe_purchase_type rows — payment_type is on the row directly.
      // Exclude test rows. Coerce amount to number.
      const stripeRaw = (spData.data || [])
        .filter((r: any) => r.payment_type !== 'test')
        .map((r: any) => ({
          video_id:      r.video_id,
          campaign_id:   r.campaign_id,
          amount:        parseFloat(String(r.amount ?? '0')),
          session_id:    r.stripe_session_id ?? null,
          _payment_type: r.payment_type as string | null,
        }));

      const pixelRaw = (ppData.data || []).map((r: any) => ({
        ...r,
        amount: parseFloat(String(r.amount ?? '0')),
      }));

      const [stripeSessLookup, pixelSessLookup] = await Promise.all([
        buildSessionLookup(stripeRaw),
        buildSessionLookup(pixelRaw),
      ]);

      // Build enrichedStripe: resolve null video_ids via session, derive revenue_type
      // from payment_type (mirrors InDepthAnalytics enrichedStripe construction).
      const enrichedStripe: StripePurchaseRow[] = (stripeRaw
        .map((r: any): StripePurchaseRow | null => {
          const resolvedVideoId    = r.video_id    ?? (stripeSessLookup[r.session_id ?? '']?.video_id    ?? '');
          const resolvedCampaignId = r.campaign_id ?? (stripeSessLookup[r.session_id ?? '']?.campaign_id ?? '');
          if (r.amount <= 0) return null;
          const revenue_type: 'offer' | 'consultation' =
            r._payment_type === 'consultation' ? 'consultation' : 'offer';
          return {
            video_id:     resolvedVideoId,
            campaign_id:  resolvedCampaignId,
            amount:       r.amount,
            revenue_type,
            session_id:   r.session_id ?? null,
          };
        })
        .filter((p): p is StripePurchaseRow => p !== null));

      // Enrich pixel: resolve null video_ids via session
      const enrichedPixel = enrichPixelPurchases(pixelRaw, pixelSessLookup);

      console.log('[Analytics] events direct:', eDirectData.data?.length ?? 0,
        '| via session:', sessionResolvedEvents.length,
        '| total:', allEvents.length);
      console.log('[Analytics] stripe_purchase_type enriched:', enrichedStripe.length,
        '| pixel enriched:', enrichedPixel.length);

      setEvents(allEvents);
      setStripePurchases(enrichedStripe);
      setPixelPurchases(enrichedPixel);

      if (organizationId) {
        analyticsPageCache.set(organizationId, {
          campaigns: cData || [], videos: vData || [], leadMagnets: lmData || [],
          events: allEvents, stripePurchases: enrichedStripe, pixelPurchases: enrichedPixel,
        });
        console.log('[Analytics] Cache updated');
      }
    } catch (err) {
      console.error('Error fetching analytics data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to filter by date range
  const dateFilteredEvents = useMemo(() => {
    let cutoff = new Date();
    switch(dateRange) {
      case '7days': cutoff.setDate(cutoff.getDate() - 7); break;
      case '28days': cutoff.setDate(cutoff.getDate() - 28); break;
      case '30days': cutoff.setDate(cutoff.getDate() - 30); break;
      case '3months': cutoff.setMonth(cutoff.getMonth() - 3); break;
      case '6months': cutoff.setMonth(cutoff.getMonth() - 6); break;
      case '12months': cutoff.setFullYear(cutoff.getFullYear() - 1); break;
      default: cutoff.setDate(cutoff.getDate() - 30);
    }
    return events.filter(e => new Date(e.created_at) >= cutoff);
  }, [events, dateRange]);

  // NOTE: stripe and pixel purchases are ALL-TIME — this is an all-time aggregation dashboard.
  // Only events (clicks) are date-filtered. Purchases are passed in full to processVideoMetrics.
  // (stripe_purchase_type has no created_at column; pixel_purchases created_at is secondary)

  // Derived filtered videos
  const filteredVideos = useMemo(() => {
    return videos.filter(v => {
      if (selectedCampaign !== 'all' && v.campaign_id !== selectedCampaign) return false;
      if (selectedGoals.length > 0) {
        const hasMatch = v.video_goal.some(goal => selectedGoals.includes(goal));
        if (!hasMatch) return false;
      }
      if (selectedLeadMagnets.length > 0) {
        if (!v.selected_lead_magnet_ids) return false;
        const hasMatch = v.selected_lead_magnet_ids.some(id => selectedLeadMagnets.includes(id));
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [videos, selectedCampaign, selectedGoals, selectedLeadMagnets]);

  const videoIds = useMemo(() => filteredVideos.map(v => v.id), [filteredVideos]);

  // Deep metrics calculation — all revenue/RPC logic delegated to analyticsProcessor
  const processedData = useMemo(() => {
    const timelineMetrics: Record<string, any> = {};

    // ── Timeline build (behavioral events only) ───────────────────────────────
    dateFilteredEvents.forEach(e => {
      if (!videoIds.includes(e.video_id)) return;

      const date = new Date(e.created_at);
      let key = date.toISOString().split('T')[0];

      if (granularity === 'weekly') {
        const day = date.getDay();
        const weekDate = new Date(date);
        weekDate.setDate(date.getDate() - day);
        key = weekDate.toISOString().split('T')[0];
      }

      if (!timelineMetrics[key]) {
        timelineMetrics[key] = { label: key, dateObj: date };
        if (selectedVideoIds.length > 0) {
          selectedVideoIds.forEach(vidId => { timelineMetrics[key][vidId] = 0; });
        } else {
          filteredVideos.slice(0, 5).forEach(vid => { timelineMetrics[key][vid.id] = 0; });
        }
        Object.keys(METRIC_LABELS).forEach(m => { timelineMetrics[key][m] = 0; });
      }

      if (timelineMetrics[key][e.event_type] !== undefined) {
        timelineMetrics[key][e.event_type]++;
      }
    });

    // ── Per-video metrics — single source of truth via processVideoMetrics ────
    const videoResults = filteredVideos.map(v => {
      const campaign = campaigns.find(c => c.id === v.campaign_id) as CampaignMeta | undefined;

      // CRITICAL: Pass the FULL purchase arrays to processVideoMetrics.
      // The processor filters by videoId internally (e.g. stripePurchases.filter(p => p.video_id === videoId)).
      // Pre-filtering here would silently drop rows whose video_id was unresolvable during enrichment.
      // This matches InDepthAnalytics which also passes full arrays.
      const sourceStripe = activeSource === 'pixel'  ? [] : (stripePurchases as any[]);
      const sourcePixel  = activeSource === 'stripe' ? [] : pixelPurchases;

      const m = processVideoMetrics({
        videoId:         v.id,
        campaignId:      v.campaign_id ?? null,
        campaign,
        activeSource,
        events:          dateFilteredEvents,
        stripePurchases: sourceStripe,
        pixelPurchases:  sourcePixel,
        includeEV:       true,
      });

      console.log(`[Analytics] video="${v.video_title}" => stripe=${m.stripe_revenue} pixel=${m.pixel_revenue} total=${m.total_revenue} rpc=${m.rpc}`);

      return {
        video:    v,
        campaign: campaign ?? null,
        title:    v.video_title,
        ...m,
        // rpc already computed correctly by processVideoMetrics using all 5 click columns
      };
    });

    // ── Orphan purchase aggregation ───────────────────────────────────────────
    const sortedTimeline = Object.values(timelineMetrics)
      .sort((a: any, b: any) => a.label.localeCompare(b.label));

    // processVideoMetrics filters internally by video_id, so any purchase row
    // whose video_id is null or doesn't match any known video is never counted
    // in the per-video loop above. We collect those here and expose them as a
    // synthetic "orphan" entry so summaryStats can accumulate them.
    //
    // A row is "orphan" if its video_id is not in the current filteredVideos set.
    //
    // IMPORTANT: orphan rows must also respect the active campaign filter.
    // Without this gate, a Stripe row belonging to Campaign A bleeds into the
    // totals when the user has filtered to Campaign B, because its video_id is
    // null / unresolved and therefore never matched by filteredVideos.
    const knownVideoIds = new Set(filteredVideos.map(v => v.id));

    // Orphan pixel rows — video_id null or not in known set, scoped to active campaign
    const orphanPixel = pixelPurchases.filter(
      (p: any) =>
        (!p.video_id || !knownVideoIds.has(p.video_id)) &&
        (selectedCampaign === 'all' || p.campaign_id === selectedCampaign),
    ) as PixelPurchaseRow[];

    // Orphan stripe rows — same campaign gate
    const orphanStripe = (stripePurchases as StripePurchaseRow[]).filter(
      (p) =>
        (!p.video_id || !knownVideoIds.has(p.video_id)) &&
        (selectedCampaign === 'all' || p.campaign_id === selectedCampaign),
    );

    // Compute orphan revenue totals (respect activeSource).
    // No intra-pixel dedup: each pixel_purchases row is an authoritative
    // purchase record. session_id is browser identity, not transaction identity —
    // one session can contain multiple real purchases and must not collapse revenue.
    let orphanPixelRevenue      = 0;
    let orphanStripeRevenue     = 0;
    let orphanDirectOffer       = 0;
    let orphanConsultation      = 0;
    let orphanEV                = 0;
    let orphanPurchaseThankyou  = 0;
    let orphanConsultThankyou   = 0;
    let orphanCallThankyou      = 0;
    let orphanNewsletterThankyou = 0;

    if (activeSource !== 'stripe') {
      for (const p of orphanPixel) {
        // Conversion counts (no dedup — each pixel_purchases row is a distinct event)
        switch (p.event_type) {
          case 'purchase':     orphanPurchaseThankyou++;   break;
          case 'sales_call':   orphanCallThankyou++;       break;
          case 'consultation': orphanConsultThankyou++;    break;
          case 'newsletter':   orphanNewsletterThankyou++; break;
        }
        // Revenue — no intra-pixel dedup; each row is an authoritative purchase record
        if ((p.amount ?? 0) > 0 &&
            (p.event_type === 'purchase' || p.event_type === 'consultation')) {
          const amt = p.amount ?? 0;
          orphanPixelRevenue += amt;
          if (p.event_type === 'purchase')     orphanDirectOffer  += amt;
          if (p.event_type === 'consultation') orphanConsultation += amt;
        }
        // EV
        if (p.event_type === 'sales_call' && (p.amount ?? 0) > 0) {
          orphanEV += p.amount ?? 0;
        }
      }
    }

    if (activeSource !== 'pixel') {
      for (const p of orphanStripe) {
        if (p.amount <= 0) continue;
        orphanStripeRevenue += p.amount;
        if (p.revenue_type === 'offer') {
          orphanDirectOffer   += p.amount;
          orphanPurchaseThankyou++;
        }
        if (p.revenue_type === 'consultation') {
          orphanConsultation += p.amount;
          orphanConsultThankyou++;
        }
      }
    }

    const orphanTotalRevenue =
      orphanDirectOffer + orphanConsultation + orphanEV;

    console.log('[Analytics] orphan rows =>', {
      pixelOrphans:  orphanPixel.length,
      stripeOrphans: orphanStripe.length,
      pixelRevenue:  orphanPixelRevenue,
      stripeRevenue: orphanStripeRevenue,
      totalRevenue:  orphanTotalRevenue,
    });

    return {
      videos: videoResults,
      timeline: sortedTimeline,
      // Expose orphan totals so summaryStats can add them
      orphan: {
        pixel_revenue:           orphanPixelRevenue,
        stripe_revenue:          orphanStripeRevenue,
        direct_offer_revenue:    orphanDirectOffer,
        consultation_revenue:    orphanConsultation,
        estimated_call_revenue:  orphanEV,
        total_revenue:           orphanTotalRevenue,
        purchase_thankyou:       orphanPurchaseThankyou,
        consultation_thankyou:   orphanConsultThankyou,
        call_booking_thankyou:   orphanCallThankyou,
        newsletter_thankyou:     orphanNewsletterThankyou,
      },
    };
  }, [filteredVideos, dateFilteredEvents, stripePurchases, pixelPurchases, campaigns, granularity, videoIds, selectedVideoIds, activeSource]);

  const summaryStats = useMemo(() => {
    // Accumulate all VideoMetrics fields explicitly — never rely on METRIC_LABELS key iteration
    // for revenue fields, as key mismatches silently drop values.
    const stats = {
      landing_page_view:      0,
      lead_magnet_click:      0,
      newsletter_click:       0,
      call_booking_click:     0,
      consultation_click:     0,
      newsletter_thankyou:    0,
      call_booking_thankyou:  0,
      consultation_thankyou:  0,
      purchase_thankyou:      0,
      stripe_revenue:         0,
      pixel_revenue:          0,
      direct_offer_revenue:   0,
      consultation_revenue:   0,
      estimated_call_revenue: 0,
      total_revenue:          0,
      rpc:                    0,
    };

    const targetVideos = selectedVideoIds.length > 0 
      ? processedData.videos.filter(v => selectedVideoIds.includes(v.video.id))
      : processedData.videos;

    targetVideos.forEach(v => {
      stats.landing_page_view      += Number(v.landing_page_view)      || 0;
      stats.lead_magnet_click      += Number(v.lead_magnet_click)      || 0;
      stats.newsletter_click       += Number(v.newsletter_click)       || 0;
      stats.call_booking_click     += Number(v.call_booking_click)     || 0;
      stats.consultation_click     += Number(v.consultation_click)     || 0;
      stats.newsletter_thankyou    += Number(v.newsletter_thankyou)    || 0;
      stats.call_booking_thankyou  += Number(v.call_booking_thankyou)  || 0;
      stats.consultation_thankyou  += Number(v.consultation_thankyou)  || 0;
      stats.purchase_thankyou      += Number(v.purchase_thankyou)      || 0;
      stats.stripe_revenue         += Number(v.stripe_revenue)         || 0;
      stats.pixel_revenue          += Number(v.pixel_revenue)          || 0;
      stats.direct_offer_revenue   += Number(v.direct_offer_revenue)   || 0;
      stats.consultation_revenue   += Number(v.consultation_revenue)   || 0;
      stats.estimated_call_revenue += Number(v.estimated_call_revenue) || 0;
      stats.total_revenue          += Number(v.total_revenue)          || 0;
    });

    // Add orphan totals — purchases whose video_id didn't match any known video
    stats.pixel_revenue          += processedData.orphan.pixel_revenue;
    stats.stripe_revenue         += processedData.orphan.stripe_revenue;
    stats.direct_offer_revenue   += processedData.orphan.direct_offer_revenue;
    stats.consultation_revenue   += processedData.orphan.consultation_revenue;
    stats.estimated_call_revenue += processedData.orphan.estimated_call_revenue;
    stats.total_revenue          += processedData.orphan.total_revenue;
    stats.purchase_thankyou      += processedData.orphan.purchase_thankyou;
    stats.consultation_thankyou  += processedData.orphan.consultation_thankyou;
    stats.call_booking_thankyou  += processedData.orphan.call_booking_thankyou;
    stats.newsletter_thankyou    += processedData.orphan.newsletter_thankyou;

    // RPC: total_revenue / sum of all 5 click columns (mirrors analyticsProcessor formula)
    const totalClicks =
      stats.landing_page_view +
      stats.lead_magnet_click +
      stats.newsletter_click +
      stats.call_booking_click +
      stats.consultation_click;
    stats.rpc = totalClicks > 0 ? Number((stats.total_revenue / totalClicks).toFixed(2)) : 0;

    console.log('[Analytics] summaryStats =>', {
      stripe_revenue:       stats.stripe_revenue,
      pixel_revenue:        stats.pixel_revenue,
      direct_offer_revenue: stats.direct_offer_revenue,
      consultation_revenue: stats.consultation_revenue,
      estimated_call_revenue: stats.estimated_call_revenue,
      total_revenue:        stats.total_revenue,
      video_count:          targetVideos.length,
    });

    return stats;
  }, [processedData, selectedVideoIds]);

  const videosForChart = useMemo(() => {
    if (selectedVideoIds.length > 0) {
      return processedData.videos.filter(v => selectedVideoIds.includes(v.video.id));
    }
    // If none selected, return special entry for "Total Revenue"
    return [{ 
      video: { id: 'total_revenue' }, 
      title: 'Total Revenue' 
    } as any];
  }, [processedData.videos, selectedVideoIds]);

  const sortedVideos = useMemo(() => {
    const items = [...processedData.videos];
    items.sort((a, b) => {
      const aVal = (a as any)[sortConfig.key];
      const bVal = (b as any)[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [processedData.videos, sortConfig]);

  // Computed campaign revenue — never stored in DB, always derived from video stats
  const campaignRevenue = (campaignId: string) =>
    processedData.videos
      .filter((v: any) => v.video?.campaign_id === campaignId)
      .reduce((sum: number, v: any) => sum + (v.total_revenue || 0), 0);

  // displayRevenue: revenue shown in the Total Revenue card, responds to activeSource
  // TOTAL = total_revenue (direct_offer + consultation + EV)
  // PIXEL = pixel_revenue (pixel-only component)
  // STRIPE = stripe_revenue (stripe-only component)
  const displayRevenue =
    activeSource === 'stripe'
      ? summaryStats.stripe_revenue ?? summaryStats.total_revenue
      : activeSource === 'pixel'
      ? summaryStats.pixel_revenue ?? summaryStats.total_revenue
      : summaryStats.total_revenue;

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="animate-spin text-red-600" size={32} />
    </div>
  );

  return (
    <div className="flex h-screen bg-black text-zinc-300 overflow-hidden">
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="h-16 border-b border-zinc-900 bg-black flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-black text-white uppercase tracking-tight">Analytics Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
             <Link 
               to="/analytics/indepth" 
               className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white hover:border-red-600/50 hover:bg-red-600/5 transition-all group"
             >
                <LayoutDashboard size={14} className="text-red-500 group-hover:scale-110 transition-transform" />
                In-Depth Analytics
             </Link>
             <Link to="/videos" className="hidden sm:flex px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all">
                My Videos
             </Link>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 lg:px-8 py-8 space-y-12 pb-20 custom-scrollbar">
          {/* 1. Top Summary Cards */}
          <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Landing Page Clicks', value: summaryStats.landing_page_view, icon: MousePointer2, color: 'text-blue-500' },
              { label: 'Direct Purchases', value: summaryStats.purchase_thankyou, icon: DollarSign, color: 'text-green-500' },
              { label: 'Calls Booked', value: summaryStats.call_booking_thankyou, icon: Phone, color: 'text-purple-500' },
              { label: 'Newsletter Opt-ins', value: summaryStats.newsletter_thankyou, icon: Users, color: 'text-orange-500' },
              { label: 'Consultations Booked', value: summaryStats.consultation_thankyou, icon: Briefcase, color: 'text-red-500' },
            ].map(m => (
              <div key={m.label} className="bento-card p-5 flex flex-col justify-between min-h-[100px] hover:border-zinc-700 transition-colors">
                <span className="label-caps !text-[9px] !text-zinc-600 truncate">{m.label}</span>
                <div className="flex items-end justify-between mt-auto">
                  <span className="text-2xl font-black text-white">{m.value}</span>
                  <m.icon size={14} className={`${m.color} opacity-40 mb-1`} />
                </div>
              </div>
            ))}
          </section>

          {/* Source toggle + Campaign filter */}
          <section className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit">
              {(['total', 'pixel', 'stripe'] as ActiveSource[]).map(v => (
                <button
                  key={v}
                  onClick={() => setActiveSource(v)}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    activeSource === v ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <select
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 text-white text-xs p-2 rounded-lg"
            >
              <option value="all">All Campaigns</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>
                  {(c as any).campaign_name || (c as any).name || c.id}
                </option>
              ))}
            </select>
          </section>

          {/* 2. Revenue Section */}
          <section className="bento-card p-10 bg-gradient-to-br from-zinc-900 to-zinc-950 border-zinc-800 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/5 blur-[120px] rounded-full -mr-20 -mt-20 group-hover:bg-red-600/10 transition-colors" />
            <div className="relative z-10 space-y-6">
              <div>
                <span className="label-caps !text-red-600 mb-2 font-black text-[11px]">Total Revenue</span>
                <div className="text-6xl font-black text-white tracking-tighter drop-shadow-2xl">
                  ${displayRevenue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-2">
                  {activeSource === 'stripe' ? 'Verified (Stripe)' : activeSource === 'pixel' ? 'Estimated (Pixel)' : 'Total (Hybrid)'} · Direct Offer + Consultation
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 pt-6 border-t border-zinc-800/50">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Estimated Sales Call Revenue</span>
                  <div className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="text-zinc-400">$</span>{summaryStats.estimated_call_revenue.toLocaleString()}
                  </div>
                  <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">Across all campaigns</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Revenue Per Click</span>
                  <div className="text-xl font-bold text-white">
                    <span className="text-zinc-400">$</span>{summaryStats.rpc}
                  </div>
                  <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">Average from total clicks</p>
                </div>
              </div>
            </div>
          </section>

          {/* 3. Detailed Breakdown & Timeline */}
          <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-4 bento-card p-0 overflow-hidden">
              <button 
                onClick={() => setIsBreakdownOpen(!isBreakdownOpen)}
                className="w-full flex justify-between items-center p-6 border-b border-zinc-900 overflow-hidden bg-zinc-950/20 hover:bg-zinc-950/40 transition-all group"
              >
                <h3 className="label-caps !text-white flex items-center gap-2 font-black uppercase tracking-widest">
                  <Activity size={14} className="text-red-600" /> Event Breakdown
                </h3>
                <ChevronDown 
                  size={16} 
                  className={`text-zinc-600 group-hover:text-white transition-transform duration-300 ${isBreakdownOpen ? 'rotate-180' : ''}`} 
                />
              </button>

              <AnimatePresence>
                {isBreakdownOpen && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                  >
                    <div className="p-6">
                      <div className="relative mb-6">
                        <button 
                          onClick={() => setIsVideoSelectorOpen(!isVideoSelectorOpen)}
                          className="w-full flex items-center justify-between px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all shadow-sm group"
                        >
                          <span className="flex items-center gap-2">
                             <Filter size={12} className={selectedVideoIds.length > 0 ? "text-red-600" : "text-zinc-600"} />
                             {(selectedVideoIds.length === 0 || selectedVideoIds.length === videos.length) ? "All Videos" : `${selectedVideoIds.length} Videos Selected`}
                          </span>
                          <ChevronDown size={14} className={`transition-transform duration-200 ${isVideoSelectorOpen ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                          {isVideoSelectorOpen && (
                            <motion.div 
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              className="absolute top-full left-0 w-full mt-2 bg-zinc-950 border border-zinc-900 rounded-2xl shadow-2xl z-50 p-2 max-h-64 overflow-y-auto custom-scrollbar"
                            >
                              <div className="p-2 border-b border-zinc-900 mb-2 flex justify-between items-center">
                                 <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">Select Videos</span>
                                 <button 
                                   onClick={() => setSelectedVideoIds([])}
                                   className="text-[8px] font-black text-red-600 hover:text-red-500 uppercase tracking-widest transition-colors"
                                 >
                                   Clear All
                                 </button>
                              </div>
                              {videos.map(v => {
                                const isSelected = selectedVideoIds.includes(v.id);
                                return (
                                  <button
                                    key={v.id}
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedVideoIds(prev => prev.filter(id => id !== v.id));
                                      } else {
                                        if (selectedVideoIds.length < 5) {
                                          setSelectedVideoIds(prev => [...prev, v.id]);
                                        } else {
                                          setWarning("Maximum 5 videos");
                                        }
                                      }
                                    }}
                                    className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition-all mb-1 last:mb-0 group ${isSelected ? 'bg-red-600/10 text-white' : 'hover:bg-zinc-900 text-zinc-500'}`}
                                  >
                                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${isSelected ? 'bg-red-600 border-red-600' : 'border-zinc-800 bg-zinc-900'}`}>
                                       {isSelected && <Check size={10} className="text-white" strokeWidth={4} />}
                                    </div>
                                    <div className="min-w-0">
                                      <p className={`text-[9px] font-black uppercase truncate tracking-tight transition-colors ${isSelected ? 'text-white' : 'group-hover:text-zinc-300'}`}>{v.video_title}</p>
                                    </div>
                                  </button>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                      
                      <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                        {[
                          { label: 'Landing Page Clicks', value: summaryStats.landing_page_view },
                          { label: 'Direct Purchases', value: summaryStats.purchase_thankyou },
                          { label: 'Lead Magnet Clicks', value: summaryStats.lead_magnet_click },
                          { label: 'Newsletter Clicks', value: summaryStats.newsletter_click },
                          { label: 'Newsletter Opt-ins', value: summaryStats.newsletter_thankyou },
                          { label: 'Call Booking Clicks', value: summaryStats.call_booking_click },
                          { label: 'Call Bookings Confirmed', value: summaryStats.call_booking_thankyou },
                          { label: 'Consultation Page Clicks', value: summaryStats.consultation_click },
                          { label: 'Consultation Purchases', value: summaryStats.consultation_thankyou },
                        ].map((stat, i, arr) => (
                          <div key={stat.label} className={`flex justify-between items-center py-2 ${i !== arr.length - 1 ? 'border-b border-zinc-900/30' : ''}`}>
                            <span className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider font-mono truncate mr-4">{stat.label}</span>
                            <span className="text-[12px] font-black text-white tabular-nums">{stat.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="lg:col-span-8 flex flex-col gap-6">
              <section className="bento-card p-8 flex flex-col w-full h-[500px]">
                <div className="flex justify-between items-center mb-10">
                  <h3 className="label-caps !text-white flex items-center gap-2 font-black uppercase tracking-widest">
                    <BarChart3 size={14} className="text-red-600" /> Revenue Timeline
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className="flex bg-zinc-950 border border-zinc-900 rounded-xl p-1">
                      <button 
                        onClick={() => setGranularity('daily')}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${granularity === 'daily' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-600'}`}
                      >
                        Daily
                      </button>
                      <button 
                        onClick={() => setGranularity('weekly')}
                        className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${granularity === 'weekly' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-600'}`}
                      >
                        Weekly
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 w-full h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={processedData.timeline} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#18181b" vertical={false} />
                      <XAxis 
                        dataKey="label" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#3f3f46', fontSize: 9, fontWeight: 'bold' }}
                        dy={10}
                        tickFormatter={(val) => {
                          const d = new Date(val);
                          return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                        }}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#3f3f46', fontSize: 9, fontWeight: 'bold' }}
                      />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '12px', border: '1px solid #18181b' }} 
                        itemStyle={{ fontSize: '10px', fontWeight: 'bold' }} 
                        labelStyle={{ color: '#71717a', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px' }}
                        labelFormatter={(label) => new Date(label).toDateString()}
                      />
                      <Legend 
                        iconType="circle" 
                        wrapperStyle={{ paddingTop: '30px', fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      />
                      {videosForChart.map((v, idx) => (
                        <Line 
                          key={v.video.id} 
                          type="monotone" 
                          dataKey={v.video.id} 
                          name={v.title || `Video ${idx + 1}`}
                          stroke={[
                            '#dc2626', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'
                          ][idx % 5]} 
                          strokeWidth={3} 
                          dot={false} 
                          activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </div>
          </section>

          {/* 4. Video Selection Table & Filters */}
          <section className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2">
                <label className="label-caps !text-zinc-600">Date Range</label>
                <div className="relative">
                  <select 
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value as DateRange)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase text-zinc-400 tracking-widest outline-none focus:border-red-600 transition-all cursor-pointer hover:bg-zinc-800 appearance-none pr-10"
                  >
                    <option value="7days">Last 7 Days</option>
                    <option value="28days">Last 28 Days</option>
                    <option value="30days">Last 30 Days</option>
                    <option value="3months">Last 3 Months</option>
                    <option value="6months">Last 6 Months</option>
                    <option value="12months">Last 12 Months</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <label className="label-caps !text-zinc-600">Filter by Goal</label>
                <div className="relative group">
                   <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase text-zinc-400 tracking-widest min-h-[42px] flex items-center gap-2 flex-wrap overflow-hidden">
                      {selectedGoals.length === 0 ? "Select Goals" : `${selectedGoals.length} Goals Selected`}
                   </div>
                   <div className="absolute top-full left-0 w-full mt-1 bg-zinc-950 border border-zinc-900 rounded-xl p-2 hidden group-hover:block z-50">
                      {[
                        { id: 'sales', label: 'Direct Sales' },
                        { id: 'newsletter', label: 'Newsletter' },
                        { id: 'calls', label: 'Sales Calls' },
                        { id: 'consult', label: 'Paid Consult' },
                        { id: 'viral', label: 'Awareness' }
                      ].map(goal => (
                        <button
                          key={goal.id}
                          onClick={() => {
                            setSelectedGoals(prev => 
                              prev.includes(goal.id) ? prev.filter(g => g !== goal.id) : [...prev, goal.id]
                            );
                          }}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all mb-1 last:mb-0 ${
                            selectedGoals.includes(goal.id) ? 'bg-red-600 text-white' : 'hover:bg-zinc-900 text-zinc-500'
                          }`}
                        >
                          {goal.label}
                        </button>
                      ))}
                   </div>
                </div>
              </div>

              <div className="flex-1 space-y-2">
                <label className="label-caps !text-zinc-600">Filter by Lead Magnet</label>
                <div className="relative group">
                   <div className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase text-zinc-400 tracking-widest min-h-[42px] flex items-center gap-2 flex-wrap overflow-hidden">
                      {selectedLeadMagnets.length === 0 ? "Select Lead Magnets" : `${selectedLeadMagnets.length} Selected`}
                   </div>
                   <div className="absolute top-full left-0 w-full mt-1 bg-zinc-950 border border-zinc-900 rounded-xl p-2 hidden group-hover:block z-50 max-h-64 overflow-y-auto custom-scrollbar">
                      {leadMagnets.map(lm => (
                        <button
                          key={lm.id}
                          onClick={() => {
                            setSelectedLeadMagnets(prev => 
                              prev.includes(lm.id) ? prev.filter(id => id !== lm.id) : [...prev, lm.id]
                            );
                          }}
                          className={`w-full text-left px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all mb-1 last:mb-0 truncate ${
                            selectedLeadMagnets.includes(lm.id) ? 'bg-red-600 text-white' : 'hover:bg-zinc-900 text-zinc-500'
                          }`}
                        >
                          {lm.lead_magnet_name}
                        </button>
                      ))}
                   </div>
                </div>
              </div>

              <div className="flex items-center gap-4 h-[42px]">
                <button 
                  onClick={() => {
                    setSelectedGoals([]);
                    setSelectedLeadMagnets([]);
                    setSelectedVideoIds([]);
                    setDateRange('28days');
                  }}
                  className="px-6 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-white transition-all"
                >
                  Reset All
                </button>
              </div>
            </div>

            <div className="bento-card overflow-hidden">
              <div className="p-6 border-b border-zinc-900 flex justify-between items-center">
                <h3 className="label-caps !text-white flex items-center gap-2 font-black uppercase tracking-widest">
                  Video Selection Table
                </h3>
                <div className="flex items-center gap-4">
                  {warning && (
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest animate-pulse flex items-center gap-2">
                       <AlertCircle size={12} /> {warning}
                    </span>
                  )}
                  <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">
                    {selectedVideoIds.length}/5 SELECTED
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[1200px]">
                  <thead className="bg-zinc-950/50 sticky top-0 z-10">
                    <tr>
                      <th className="p-4 w-12 text-center">
                         <div className="flex items-center justify-center">
                           <input 
                             type="checkbox" 
                             checked={selectedVideoIds.length === Math.min(filteredVideos.length, 5) && filteredVideos.length > 0}
                             onChange={() => {
                               if (selectedVideoIds.length > 0) {
                                 setSelectedVideoIds([]);
                               } else {
                                 const toSelect = filteredVideos.slice(0, 5).map(v => v.id);
                                 setSelectedVideoIds(toSelect);
                                 if (filteredVideos.length > 5) {
                                   setWarning("Maximum 5 videos");
                                 }
                               }
                             }}
                             className="w-4 h-4 rounded border-zinc-800 bg-zinc-900 text-red-600 focus:ring-0 cursor-pointer"
                           />
                         </div>
                      </th>
                      <th className="p-4 label-caps !text-zinc-600 !text-[9px] whitespace-nowrap min-w-[200px]">Video</th>
                      {[
                        { key: 'landing_page_view', label: 'Landing Page Clicks' },
                        { key: 'purchase_thankyou', label: 'Direct Purchases' },
                        { key: 'lead_magnet_click', label: 'Lead Magnet Clicks' },
                        { key: 'newsletter_click', label: 'Newsletter Clicks' },
                        { key: 'newsletter_thankyou', label: 'Newsletter Opt-ins' },
                        { key: 'call_booking_click', label: 'Call Booking Clicks' },
                        { key: 'call_booking_thankyou', label: 'Call Bookings Confirmed' },
                        { key: 'consultation_click', label: 'Consultation Page Clicks' },
                        { key: 'consultation_thankyou', label: 'Consultation Purchases' }
                      ].map(col => (
                        <th 
                          key={col.key}
                          onClick={() => setSortConfig({
                            key: col.key,
                            direction: sortConfig.key === col.key && sortConfig.direction === 'desc' ? 'asc' : 'desc'
                          })}
                          className="p-4 label-caps !text-zinc-600 !text-[9px] cursor-pointer hover:text-white transition-colors group whitespace-nowrap"
                        >
                          <div className="flex items-center gap-2">
                             {col.label}
                             <ArrowUpDown size={10} className={sortConfig.key === col.key ? 'text-red-600' : 'text-zinc-800 group-hover:text-zinc-600'} />
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {sortedVideos.map(v => {
                      const isSelected = selectedVideoIds.includes(v.video.id);
                      return (
                        <tr 
                          key={v.video.id} 
                          className={`hover:bg-zinc-900/50 transition-colors ${isSelected ? 'bg-red-600/5' : ''}`}
                        >
                          <td className="p-4 w-12 text-center">
                             <div className="flex items-center justify-center">
                               <input 
                                 type="checkbox" 
                                 checked={isSelected}
                                 onChange={() => {
                                   if (isSelected) {
                                     setSelectedVideoIds(prev => prev.filter(id => id !== v.video.id));
                                   } else {
                                     if (selectedVideoIds.length < 5) {
                                       setSelectedVideoIds(prev => [...prev, v.video.id]);
                                     } else {
                                       setWarning("Maximum 5 videos");
                                     }
                                   }
                                 }}
                                 className="w-4 h-4 rounded border-zinc-800 bg-zinc-900 text-red-600 focus:ring-0 cursor-pointer"
                               />
                             </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-3 group/vid">
                              <Link 
                                to={`/videos/${v.video.id}`}
                                className="w-12 h-8 rounded bg-zinc-900 border border-zinc-800 overflow-hidden flex-shrink-0 hover:border-zinc-500 transition-all group/vid-thumb"
                              >
                                <img src={v.video.thumbnail_url} className="w-full h-full object-cover group-hover/vid-thumb:scale-110 transition-all" />
                              </Link>
                              <div className="min-w-0">
                                 <Link 
                                   to={`/videos/${v.video.id}`}
                                   className="text-[10px] font-black text-white uppercase truncate tracking-tight hover:text-red-500 transition-all"
                                 >
                                   {v.title}
                                 </Link>
                                 <p className="text-[8px] font-bold text-zinc-600 uppercase mt-0.5">{(v.campaign as any)?.campaign_name}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.landing_page_view}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.purchase_thankyou}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.lead_magnet_click}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.newsletter_click}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.newsletter_thankyou}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.call_booking_click}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.call_booking_thankyou}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.consultation_click}</td>
                          <td className="p-4 text-[10px] font-bold text-zinc-400 tabular-nums">{v.consultation_thankyou}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
