/**
 * src/pages/Assets.tsx
 *
 * Content Library — answers "what do I own, what can I promote"
 * (Design Lock: Videos.tsx vs Assets.tsx responsibility split).
 *
 * Minimal viable version per Design Lock §4:
 *   - One list, one query (listAssetsByOrganization)
 *   - No filter / sort / grid-list toggle / bulk actions
 *   - No custom AssetDetail beyond the empty shell — each row links to
 *     /assets/:id (AssetDetail.tsx), not /videos/:id. VideoDetail.tsx is
 *     untouched by this page.
 *
 * Integration testing found the underlying join was fine, but PostgREST
 * returns the embedded `videos` relation as an array (no UNIQUE constraint
 * on videos.asset_id to prove it's 1:1) — see the fix and full explanation
 * in services/asset/listAssetsByOrganization.ts. This component now consumes
 * the flat `AssetLibraryRow` shape that function normalizes to, so nothing
 * here needs to know about the array/object embed detail.
 *
 * UPDATE (Import Asset pass): added the "Import Asset" entry point
 * (ImportAssetModal) and switched thumbnail resolution to branch between
 * video-domain and resource-domain fallbacks depending on row.resource_type.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Library, Loader2, Plus } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useOrganization } from '../lib/useOrganization';
import { listAssetsByOrganization } from '../services/asset/listAssetsByOrganization';
import type { AssetLibraryRow } from '../services/asset/listAssetsByOrganization';
import { resolveThumbnail, resolveAssetThumbnail } from '../lib/videoFormatters';
import { ImportAssetModal } from '../components/ImportAssetModal';
import type { AssetResource } from '../services/asset/createAssetResource';

export default function Assets() {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [rows, setRows] = useState<AssetLibraryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

  const fetchAssets = async () => {
    if (!organizationId) return;
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
  };

  useEffect(() => {
    if (!user || !organizationId) return;
    fetchAssets();
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
        <button
          onClick={() => setShowImportModal(true)}
          className="mt-4 flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all"
        >
          <Plus size={14} /> Import Asset
        </button>
      </header>

      {loading && (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading...
        </div>
      )}

      {error && <div className="text-red-500 text-sm">{error}</div>}

      {!loading && !error && rows.length === 0 && (
        <p className="text-zinc-500 text-sm">
          Nothing in your Library yet. Add a video to your Library from its detail page, or import a link above.
        </p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map((row) => (
            <Link
              key={row.id}
              to={`/assets/${row.id}`}
              className="flex items-center gap-4 p-4 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-all"
            >
              <div className="w-16 h-10 overflow-hidden rounded-lg border border-zinc-800 flex-shrink-0">
                <img
                  src={
                    row.resource_type
                      ? resolveAssetThumbnail({ thumbnail_url: row.thumbnail_url, resource_type: row.resource_type })
                      : resolveThumbnail(row)
                  }
                  className="w-full h-full object-cover"
                />
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

      {showImportModal && (
        <ImportAssetModal
          onClose={() => setShowImportModal(false)}
          onImported={(_assetResource: AssetResource) => {
            fetchAssets();
          }}
        />
      )}
    </div>
  );
}