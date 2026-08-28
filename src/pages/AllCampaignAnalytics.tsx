/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BarChart3 } from 'lucide-react';

// Blank placeholder — no data wiring yet. Mirrors the shape of
// AllAssetsAnalytics.tsx so it's a drop-in once the real content is built.
export default function AllCampaignAnalytics() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100 tracking-tight">
          Campaign Analytics
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          Aggregate performance across all campaigns.
        </p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 py-24">
        <BarChart3 size={28} className="text-zinc-700" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-600">
          Coming soon
        </p>
      </div>
    </div>
  );
}
