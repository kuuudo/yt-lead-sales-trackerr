import React, { useState, useMemo } from 'react';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/hooks';
import { getAnalyticsEngine } from '../lib/analyticsEngine';

export default function AnalyticsTest() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const [showDebugPanel, setShowDebugPanel] = useState(true);

  // TEMP MOCK DATA (so page NEVER breaks)
  const videos: any[] = [];
  const campaigns: any[] = [];
  const events: any[] = [];
  const stripePurchases: any[] = [];
  const pixelPurchases: any[] = [];

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
  }, []);

  return (
    <div className="p-6 text-white bg-black min-h-screen">
      <h1 className="text-xl font-black mb-4">Analytics Test Page</h1>

      <button
        onClick={() => setShowDebugPanel(v => !v)}
        className="px-3 py-1 border border-yellow-500 text-yellow-400 text-xs rounded"
      >
        Toggle Debug
      </button>

      {showDebugPanel && (
        <div className="mt-4 p-3 border border-yellow-500/30 text-xs">
          Debug Panel Active
          <br />
          Engine Videos: {engineResult?.sortedVideos?.length || 0}
        </div>
      )}

      <div className="mt-6 text-sm text-zinc-400">
        If you see this, route is working ✅
      </div>
    </div>
  );
}