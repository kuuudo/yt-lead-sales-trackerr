/**
 * src/pages/AssetDetail.tsx
 *
 * Asset Detail — General Info / Source / Type / Created only.
 *
 * Loads via getAssetDetail.ts, which resolves display metadata from
 * whichever table backs this Asset today (`videos` legacy, or
 * `asset_resources` native) and normalizes it into a single
 * AssetResourceView shape. This page renders that shape generically — it
 * does not assume every Asset is a Video, even though Video is the only
 * source with its own detail page today.
 *
 * UPDATE (post Import Asset): previously this page ran an inline
 * `asset_resources`-only query, which silently showed "Untitled Asset"
 * for every asset_type: 'video' row (the majority of pre-Import-Asset
 * assets), since those never have an asset_resources row. Replaced with
 * getAssetDetail.ts, which resolves from the correct table per asset_type.
 *
 * No edit, no delete, no analytics, no attribution, no timeline, no
 * comments, no assignment/promotion relationships — explicitly out of
 * scope for this pass.
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, ExternalLink, Video as VideoIcon } from 'lucide-react';
import { getAssetDetail } from '../services/asset/getAssetDetail';
import type { AssetDetail as AssetDetailData } from '../services/asset/getAssetDetail';
import { resolveAssetThumbnail, RESOURCE_TYPE_LABELS, type ResourceType } from '../lib/videoFormatters';

export default function AssetDetail() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<AssetDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getAssetDetail(id);
        if (!data) {
          setError('Asset not found.');
          return;
        }
        setDetail(data);
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

  if (error || !detail) {
    return <div className="text-red-500 text-sm">{error || 'Asset not found.'}</div>;
  }

  const { asset, resource } = detail;

  return (
    <div className="space-y-8 max-w-2xl">
      <Link to="/assets" className="flex items-center gap-2 text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest">
        <ArrowLeft size={14} /> Back to Library
      </Link>

      {resource?.thumbnailUrl || resource?.resourceType ? (
        <img
          src={resolveAssetThumbnail({
            thumbnail_url: resource?.thumbnailUrl ?? null,
            resource_type: resource?.resourceType ?? 'other',
            platform: resource?.platform ?? null,
          })}
          className="w-full h-48 object-cover rounded-xl border border-zinc-800"
        />
      ) : null}

      <div>
        <h1 className="text-2xl font-bold text-white">
          {resource?.title || 'Untitled Asset'}
        </h1>
        {resource?.deletedAt && (
          <span className="inline-block mt-2 text-[9px] font-black uppercase text-red-600 tracking-widest">
            Original content deleted
          </span>
        )}
      </div>

      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
        {/* General Info */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">General Info</p>
          <p className="text-sm text-white">
            Asset ID: <span className="text-zinc-400">{asset.id}</span>
          </p>
          <p className="text-sm text-white mt-1">
            Library status:{' '}
            <span className="text-zinc-400">
              {asset.added_to_library_at ? 'In Library' : 'Not in Library'}
            </span>
          </p>
        </div>

        {/* Source — generic: renders whatever resolved, regardless of origin table */}
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
            <p className="text-sm text-zinc-500">No linked source URL.</p>
          )}

          {/*
            Navigation rule: Asset Detail may optionally link to the source
            object. Only Video has its own detail page today — shown only
            when the resolved resource's origin is the `videos` table.
            Adding a second source detail page later (e.g. a future
            Resource Detail) means adding one more origin check here, not
            restructuring this section.
          */}
          {resource?.origin === 'video' && (
            <Link
              to={`/videos/${resource.originId}`}
              className="mt-2 inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white border border-zinc-800 rounded-lg px-3 py-2 transition-all"
            >
              <VideoIcon size={12} /> Open Video Detail
            </Link>
          )}
        </div>

        {/* Type */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Type</p>
          <p className="text-sm text-white">
            {resource?.resourceType
              ? RESOURCE_TYPE_LABELS[resource.resourceType as ResourceType] ?? resource.resourceType
              : asset.asset_type}
          </p>
        </div>

        {/* Created */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Created</p>
          <p className="text-sm text-white">
            {new Date(asset.created_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
      </section>
    </div>
  );
}
