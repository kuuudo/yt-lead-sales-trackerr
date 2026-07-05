/**
 * src/pages/Assets.tsx
 *
 * Content Library — answers "what do I own, what can I promote"
 * (Design Lock: Videos.tsx vs Assets.tsx responsibility split).
 *
 * Minimal viable version per Design Lock §4:
 *   - One list, one query (listAssetsByOrganization)
 *   - No filter / sort / grid-list toggle / bulk actions
 *   - No AssetDetail.tsx — each row links straight to the existing
 *     VideoDetail.tsx route, since every Asset today is a video. A real
 *     AssetDetail gets built once a second Asset Type exists, not before.
 *
 * Integration testing found the underlying join was fine, but PostgREST
 * returns the embedded `videos` relation as an array (no UNIQUE constraint
 * on videos.asset_id to prove it's 1:1) — see the fix and full explanation
 * in services/asset/listAssetsByOrganization.ts. This component now consumes
 * the flat `AssetLibraryRow` shape that function normalizes to, so nothing
 * here needs to know about the array/object embed detail.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Library, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useOrganization } from '../lib/useOrganization';
import { listAssetsByOrganization } from '../services/asset/listAssetsByOrganization';
import type { AssetLibraryRow } from '../services/asset/listAssetsByOrganization';

export default function Assets() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [rows, setRows] = useState<AssetLibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !organizationId) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listAssetsByOrganization({ organizationId });
        setRows(data);
      } catch (err: any) {
        setError(err.message || 'Could not load your Asset Library.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user, organizationId]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Library className="text-red-600" size={28} /> Asset Library
        </h1>
        <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-1">
          Content you own and can promote
        </p>
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading...
        </div>
      )}

      {error && <div className="text-red-500 text-sm">{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <p className="text-zinc-500 text-sm">
          Nothing in your Library yet. Add a video to your Library from its detail page.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((row) => (
            <Link
              key={row.id}
              to={`/videos/${row.video_id}`}
              className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-all"
            >
              <div className="w-16 h-10 overflow-hidden rounded-lg border border-zinc-800 flex-shrink-0">
                {row.thumbnail_url && (
                  <img src={row.thumbnail_url} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  {row.video_title || 'Untitled'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">
                    {row.platform}
                  </span>
                  {row.deleted_at && (
                    <span className="text-[9px] font-black uppercase text-red-600 tracking-widest">
                      Original content deleted
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
