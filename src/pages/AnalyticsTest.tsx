// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsTest.tsx — FIXED WORKING VERSION
// route: /analytics-test
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import { getAnalyticsEngine } from '../lib/analyticsEngine';

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
  // FETCH REAL DATA
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
        console.error('AnalyticsTest fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    if (user) load();
  }, [user]);

  // ─────────────────────────────
  // ENGINE (REAL DATA)
  // ─────────────────────────────
  const engineResult = useMemo(() => {
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
  // LOADING STATE
  // ─────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        Loading analytics...
      </div>
    );
  }

  // ─────────────────────────────
  // UI
  // ─────────────────────────────
  return (
    <div className="p-6 bg-black text-white min-h-screen">

      {/* HEADER */}
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-black">Analytics Test</h1>

        <button
          onClick={() => setShowDebugPanel(v => !v)}
          className="text-xs px-3 py-1 border border-yellow-500 text-yellow-400 rounded"
        >
          Toggle Debug
        </button>
      </div>

      {/* DEBUG PANEL */}
      {showDebugPanel && (
        <div className="mb-6 p-4 border border-yellow-500/30 bg-yellow-500/5 text-xs rounded">
          <div>Debug Panel Active</div>
          <div>Videos loaded: {videos.length}</div>
          <div>Campaigns loaded: {campaigns.length}</div>
          <div>Events loaded: {events.length}</div>
          <div>Stripe rows: {stripePurchases.length}</div>
          <div>Pixel rows: {pixelPurchases.length}</div>
          <div className="mt-2 font-bold text-green-400">
            Engine Videos: {engineResult?.sortedVideos?.length || 0}
          </div>
        </div>
      )}

      {/* MAIN STATS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 border border-zinc-800 rounded">
          <div className="text-xs text-zinc-400">Videos</div>
          <div className="text-lg font-bold">{videos.length}</div>
        </div>

        <div className="p-4 border border-zinc-800 rounded">
          <div className="text-xs text-zinc-400">Campaigns</div>
          <div className="text-lg font-bold">{campaigns.length}</div>
        </div>

        <div className="p-4 border border-zinc-800 rounded">
          <div className="text-xs text-zinc-400">Stripe Purchases</div>
          <div className="text-lg font-bold">{stripePurchases.length}</div>
        </div>

        <div className="p-4 border border-zinc-800 rounded">
          <div className="text-xs text-zinc-400">Pixel Purchases</div>
          <div className="text-lg font-bold">{pixelPurchases.length}</div>
        </div>
      </div>

      {/* ENGINE OUTPUT PREVIEW */}
      <div className="mt-8 text-sm text-zinc-400">
        Engine loaded {engineResult?.sortedVideos?.length || 0} processed videos
      </div>

    </div>
  );
}