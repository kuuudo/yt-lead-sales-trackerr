// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsTest.tsx — ENGINE MIRROR PAGE (SAFE COPY OF /analytics)
// route: /analytics-test
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import { getAnalyticsEngine } from '../lib/analyticsEngine';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export default function AnalyticsTest() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [showDebugPanel, setShowDebugPanel] = useState(true);

  const [videos, setVideos] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [stripePurchases, setStripePurchases] = useState<any[]>([]);
  const [pixelPurchases, setPixelPurchases] = useState<any[]>([]);

  // ─────────────────────────────
  // LOAD DATA
  // ─────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);

      try {
        const { data: v } = await supabase.from('videos').select('*');
        const { data: c } = await supabase.from('campaigns').select('*');
        const { data: e } = await supabase.from('events').select('*');
        const { data: stripe } = await supabase.from('stripe_purchases').select('*');
        const { data: pixel } = await supabase.from('pixel_purchases').select('*');

        setVideos(v || []);
        setCampaigns(c || []);
        setEvents(e || []);
        setStripePurchases(stripe || []);
        setPixelPurchases(pixel || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    if (user) load();
  }, [user]);

  // ─────────────────────────────
  // ENGINE
  // ─────────────────────────────
  const engineResult = useMemo(() => {
    if (!videos.length && !campaigns.length) return null;

    return getAnalyticsEngine({
      videos,
      campaigns,
      rawEvents: events,
      stripePurchases,
      pixelPurchases,
      dateRange: '30days' as any,
      selectedCampaignId: 'all',
      selectedGoals: [],
      selectedLeadMagnets: [],
      activeSource: 'total',
      includeEV: true,
      sortConfig: { key: 'total_revenue', direction: 'desc' },
    } as any);
  }, [videos, campaigns, events, stripePurchases, pixelPurchases]);

  // ─────────────────────────────
  // LOADING
  // ─────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        Loading analytics...
      </div>
    );
  }

  // ─────────────────────────────
  // ENGINE SAFE DATA
  // ─────────────────────────────
  const topVideos = engineResult?.sortedVideos || [];

  const chartData = topVideos.slice(0, 10).map((v: any) => ({
    name: v.title?.slice(0, 12) || 'video',
    revenue: v.total_revenue || 0,
    clicks: v.landing_page_view || 0,
  }));

  const totals = useMemo(() => {
    if (!topVideos.length) {
      return {
        revenue: 0,
        clicks: 0,
        conversions: 0,
      };
    }

    return topVideos.reduce(
      (acc: any, v: any) => {
        acc.revenue += v.total_revenue || 0;
        acc.clicks += v.landing_page_view || 0;
        acc.conversions += v.purchase_thankyou || 0;
        return acc;
      },
      { revenue: 0, clicks: 0, conversions: 0 }
    );
  }, [topVideos]);

  // ─────────────────────────────
  // UI
  // ─────────────────────────────
  return (
    <div className="p-6 bg-black text-white min-h-screen">

      {/* HEADER */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-black">Analytics Test (ENGINE MIRROR)</h1>

        <button
          onClick={() => setShowDebugPanel(v => !v)}
          className="text-xs px-3 py-1 border border-yellow-500 text-yellow-400 rounded"
        >
          Toggle Debug
        </button>
      </div>

      {/* DEBUG */}
      {showDebugPanel && (
        <div className="mb-6 p-4 border border-yellow-500/30 bg-yellow-500/5 text-xs rounded">
          <div>Debug Panel Active</div>
          <div>Videos loaded: {videos.length}</div>
          <div>Campaigns loaded: {campaigns.length}</div>
          <div>Events loaded: {events.length}</div>
          <div>Stripe rows: {stripePurchases.length}</div>
          <div>Pixel rows: {pixelPurchases.length}</div>
          <div className="mt-2 font-bold text-green-400">
            Engine Videos: {topVideos.length}
          </div>
        </div>
      )}

      {/* SUMMARY */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="p-4 border border-zinc-800 rounded">
          <div className="text-xs text-zinc-400">Revenue</div>
          <div className="text-xl font-bold">${totals.revenue.toFixed(2)}</div>
        </div>

        <div className="p-4 border border-zinc-800 rounded">
          <div className="text-xs text-zinc-400">Clicks</div>
          <div className="text-xl font-bold">{totals.clicks}</div>
        </div>

        <div className="p-4 border border-zinc-800 rounded">
          <div className="text-xs text-zinc-400">Conversions</div>
          <div className="text-xl font-bold">{totals.conversions}</div>
        </div>
      </div>

      {/* CHART */}
      <div className="h-72 border border-zinc-800 rounded p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="revenue" stroke="#22c55e" />
            <Line type="monotone" dataKey="clicks" stroke="#60a5fa" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ENGINE STATUS */}
      <div className="mt-8 text-sm text-zinc-400">
        Engine loaded {topVideos.length} processed videos
      </div>

    </div>
  );
}