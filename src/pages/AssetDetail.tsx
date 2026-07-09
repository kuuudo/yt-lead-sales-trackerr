/**
 * src/pages/AssetDetail.tsx
 *
 * Empty-shell Asset Detail page. Deliberately minimal per current scope —
 * General Info / Source / Type / Created only. No edit, no delete, no
 * actions yet. Does not touch VideoDetail.tsx or any video-domain logic.
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getAsset } from '../services/asset/getAsset';
import type { Asset } from '../lib/supabase';
import { resolveAssetThumbnail, RESOURCE_TYPE_LABELS, type ResourceType } from '../lib/videoFormatters';

// Not yet a dedicated service file (getAssetResourceByAssetId.ts) — this is
// the one inline query in an otherwise service-layer-only codebase.
// Flagging as a deliberate "empty shell" shortcut: if this page grows past
// read-only display, this query should move into services/asset/ to match
// getAsset.ts's own convention, not stay inline here.
interface AssetResourceRow {
  id: string;
  title: string | null;
  thumbnail_url: string | null;
  platform: string;
  resource_type: string;
  url: string;
  description: string | null;
  created_at: string;
}

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [resource, setResource] = useState<AssetResourceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const assetData = await getAsset(id);
        if (!assetData) {
          setError('Asset not found.');
          return;
        }
        setAsset(assetData);

        const { data: resourceData, error: resourceError } = await supabase
          .from('asset_resources')
          .select('id, title, thumbnail_url, platform, resource_type, url, description, created_at')
          .eq('asset_id', id)
          .maybeSingle();

        if (resourceError) throw resourceError;
        setResource(resourceData);
      } catch (err: any) {
        setError(err.message || 'Could not load this asset.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm">
        <Loader2 size={16} className="animate-spin" /> Loading...
      </div>
    );
  }

  if (error || !asset) {
    return <div className="text-red-500 text-sm">{error || 'Asset not found.'}</div>;
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <Link to="/assets" className="flex items-center gap-2 text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest">
        <ArrowLeft size={14} /> Back to Library
      </Link>

      {resource?.thumbnail_url || resource?.resource_type ? (
        <img
          src={resolveAssetThumbnail({
            thumbnail_url: resource?.thumbnail_url ?? null,
            resource_type: resource?.resource_type ?? 'other',
          })}
          className="w-full h-48 object-cover rounded-xl border border-zinc-800"
        />
      ) : null}

      <h1 className="text-2xl font-bold text-white">
        {resource?.title || 'Untitled Asset'}
      </h1>

      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Type</p>
          <p className="text-sm text-white">
            {resource ? RESOURCE_TYPE_LABELS[resource.resource_type as ResourceType] ?? resource.resource_type : '—'}
          </p>
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Source</p>
          {resource?.url ? (
            <a
              href={resource.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 truncate"
            >
              <ExternalLink size={12} className="shrink-0" />
              <span className="truncate">{resource.url}</span>
            </a>
          ) : (
            <p className="text-sm text-zinc-500">—</p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Created</p>
          <p className="text-sm text-white">
            {new Date(asset.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
      </section>
    </div>
  );
}