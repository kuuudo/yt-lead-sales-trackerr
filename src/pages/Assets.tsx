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
 * TODO (integration testing): listAssetsByOrganization's embedded join has
 * not been verified against the live PostgREST schema cache. If this page
 * fails to load with a 400 from Supabase, see the note in
 * services/asset/listAssetsByOrganization.ts before changing anything here.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Library, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useOrganization } from '../lib/useOrganization';
import { listAssetsByOrganization } from '../services/asset/listAssetsByOrganization';

interface LibraryRow {
  id: string; // asset id
  organization_id: string;
  asset_type: string;
  created_at: string;
  added_to_library_at: string | null;
  videos: {
    id: string;
    video_title: string | null;
    thumbnail_url: string | null;
    platform: string | null;
    deleted_at: string | null;
  };
}

export default function Assets() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [rows, setRows] = useState<LibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !organizationId) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listAssetsByOrganization({ organizationId });
        setRows(data as unknown as LibraryRow[]);
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
              to={`/videos/${row.videos.id}`}
              className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-all"
            >
              <div className="w-16 h-10 overflow-hidden rounded-lg border border-zinc-800 flex-shrink-0">
                {row.videos.thumbnail_url && (
                  <img src={row.videos.thumbnail_url} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  {row.videos.video_title || 'Untitled'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] font-black uppercase text-zinc-600 tracking-widest">
                    {row.videos.platform}
                  </span>
                  {row.videos.deleted_at && (
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
