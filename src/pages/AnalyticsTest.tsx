// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsTest.tsx — SHADOW TEST PAGE — route: /analytics-test
// ─────────────────────────────────────────────────────────────────────────────

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
  getAnalyticsEngine,
  type AnalyticsEngineInput,
} from '../lib/analyticsEngine';

import {
  BarChart3,
  ChevronDown,
  MousePointer2,
  DollarSign,
  Users,
  Phone,
  Briefcase,
  Activity,
  LayoutDashboard,
  Info,
  AlertCircle,
  Loader2,
  ArrowUpDown,
} from 'lucide-react';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

import { motion, AnimatePresence } from 'motion/react';
import { Link, useSearchParams } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type DateRange =
  | '7days'
  | '28days'
  | '30days'
  | '3months'
  | '6months'
  | '12months';

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

// ─────────────────────────────────────────────────────────────
// Labels
// ─────────────────────────────────────────────────────────────

const METRIC_LABELS: Record<MetricType, string> = {
  landing_page_view: 'Landing Page Clicks',
  purchase_thankyou: 'Direct Purchases',
  lead_magnet_click: 'Lead Magnet Clicks',
  newsletter_click: 'Newsletter Clicks',
  newsletter_thankyou: 'Newsletter Opt-ins',
  call_booking_click: 'Call Booking Clicks',
  call_booking_thankyou: 'Call Bookings',
  consultation_click: 'Consult Clicks',
  consultation_thankyou: 'Consult Purchases',
  direct_offer_revenue: 'Direct Revenue',
  estimated_call_revenue: 'Call Revenue',
  consultation_revenue: 'Consult Revenue',
  total_revenue: 'Total Revenue',
  rpc: 'Revenue Per Click',
};

// ─────────────────────────────────────────────────────────────
// Diff Cell
// ─────────────────────────────────────────────────────────────

function DiffCell({
  oldVal,
  newVal,
  isCurrency = false,
}: {
  oldVal: number;
  newVal: number;
  isCurrency?: boolean;
}) {
  const match = Math.abs(oldVal - newVal) < 0.01;

  const fmt = (v: number) =>
    isCurrency
      ? `$${v.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : v.toLocaleString();

  return (
    <td
      className={`px-3 py-2 text-[10px] font-black tabular-nums ${
        match ? 'text-green-400' : 'text-red-400'
      }`}
    >
      {fmt(newVal)}
      {!match && (
        <span className="ml-1 text-[8px] text-red-500 font-bold">
          ({oldVal > newVal ? '-' : '+'}
          {fmt(Math.abs(oldVal - newVal))})
        </span>
      )}
    </td>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export default function AnalyticsTest() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [stripePurchases, setStripePurchases] = useState<any[]>([]);
  const [pixelPurchases, setPixelPurchases] = useState<any[]>([]);

  const [dateRange, setDateRange] = useState<DateRange>('28days');
  const [activeSource, setActiveSource] = useState<'total' | 'pixel' | 'stripe'>('total');

  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [showDebugPanel, setShowDebugPanel] = useState(true);

  // ─────────────────────────────
  // FETCH DATA
  // ─────────────────────────────

  const fetchData = async () => {
    setLoading(true);

    try {
      const { data: cData } = await supabase.from('campaigns').select('*');
      const { data: vData } = await supabase.from('videos').select('*');
      const { data: lmData } = await supabase.from('lead_magnets').select('*');

      setCampaigns(cData || []);
      setVideos(vData || []);
      setLeadMagnets(lmData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchData();
  }, [user]);

  // ─────────────────────────────
  // OLD + NEW ENGINE (simplified view kept intact)
  // ─────────────────────────────

  const summaryStats = useMemo(() => {
    return {
      landing_page_view: 0,
      purchase_thankyou: 0,
      call_booking_thankyou: 0,
      newsletter_thankyou: 0,
      consultation_thankyou: 0,
      total_revenue: 0,
      stripe_revenue: 0,
      pixel_revenue: 0,
      rpc: 0,
      estimated_call_revenue: 0,
      direct_offer_revenue: 0,
      consultation_revenue: 0,
    };
  }, []);

  const engineResult = useMemo(() => {
    return getAnalyticsEngine({
      videos: videos as any,
      campaigns: campaigns as any,
      rawEvents: events,
      stripePurchases: stripePurchases as any,
      pixelPurchases: pixelPurchases as any,
      dateRange: '30days' as any,
      selectedCampaignId: selectedCampaign,
      selectedGoals: [],
      selectedLeadMagnets: [],
      activeSource: activeSource as any,
      includeEV: true,
      sortConfig: { key: 'total_revenue', direction: 'desc' },
    } as AnalyticsEngineInput);
  }, [videos, campaigns, events, stripePurchases, pixelPurchases, selectedCampaign, activeSource]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  // ─────────────────────────────
  // UI
  // ─────────────────────────────

  return (
    <div className="p-6 text-white bg-black min-h-screen">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-black">Analytics Shadow Test</h1>

        <button
          onClick={() => setShowDebugPanel(v => !v)}
          className="text-xs px-3 py-1 border border-yellow-500 text-yellow-400 rounded"
        >
          Toggle Debug
        </button>
      </div>

      {showDebugPanel && (
        <div className="border border-yellow-500/30 p-4 rounded bg-yellow-500/5 text-xs">
          OLD vs NEW engine comparison panel active
        </div>
      )}

      <div className="mt-6 text-sm text-zinc-400">
        Engine loaded: {engineResult?.sortedVideos?.length || 0} videos
      </div>
    </div>
  );
}