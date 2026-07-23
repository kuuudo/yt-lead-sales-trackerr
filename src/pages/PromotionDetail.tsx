/**
 * src/pages/PromotionDetail.tsx
 *
 * Promotion Detail — v1, read-only. Represents the EXECUTION layer (what
 * got promoted, by whom, to whom, via which Assignment), distinct from
 * the Assignment (collaboration relationship) layer. No edit, no delete,
 * no status change, no archive — display-only, same restraint as
 * AssetDetail.tsx's original MVP pass.
 *
 * Data comes from getPromotionDetail.ts, which only reads existing
 * relationships (promotions / promotion_assets / assignments /
 * assignment_collaborators / profiles) and reuses getAssetDetail.ts for
 * asset resolution rather than introducing a third asset display
 * resolver alongside getAssetDetail.ts and getAssignmentDetail.ts.
 *
 * ACCESS: this page does not check "is this user the Sponsor or the
 * Collaborator" itself — it simply calls getPromotionDetail(id) and
 * renders whatever comes back. Existing Supabase RLS on
 * promotions/promotion_assets/assignments/assignment_collaborators
 * already determines whether the calling user can see this data; if RLS
 * currently only allows owner_user_id and not the assignment
 * collaborator, that's a policy gap to fix separately (out of scope
 * here — no new permission logic was added).
 *
 * Thumbnail/type resolution per promoted asset is lifted verbatim from
 * AssetDetail.tsx's own thumbnailSrc/typeLabel logic, applied to each
 * asset's `resource` (an AssetResourceView, same shape AssetDetail.tsx
 * already renders) — so this page can never drift into a different
 * display format for the same asset kind.
 */

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  getPromotionDetail,
  type PromotionDetailData,
} from '../services/promotion/getPromotionDetail';
import {
  resolveAssetThumbnail,
  resolveElementThumbnail,
  getElementTypeLabel,
  RESOURCE_TYPE_LABELS,
  type ResourceType,
  type CampaignElementType,
} from '../lib/videoFormatters';
import type { AssetResourceView } from '../services/asset/getAssetDetail';

// Verbatim port of AssetDetail.tsx's thumbnailSrc logic, applied to one
// promoted asset's resource. Kept as a standalone function (not imported)
// since AssetDetail.tsx doesn't export it — duplicated intentionally per
// the "small deliberate duplication over premature abstraction"
// convention already used elsewhere in this codebase (see
// getAssetDetail.ts's own DUPLICATION NOTE), not a new resolver.
function resolveThumbnailSrc(resource: AssetResourceView | null): string | null {
  return resource?.origin === 'campaign_element'
    ? resolveElementThumbnail((resource.resourceType ?? 'landing_page') as CampaignElementType)
    : resource?.thumbnailUrl || resource?.resourceType
    ? resolveAssetThumbnail({
        thumbnail_url: resource?.thumbnailUrl ?? null,
        resource_type: resource?.resourceType ?? 'other',
        platform: resource?.platform ?? null,
      })
    : null;
}

// Verbatim port of AssetDetail.tsx's typeLabel logic.
function resolveTypeLabel(resource: AssetResourceView | null): string {
  if (!resource) return 'Asset';
  return resource.origin === 'campaign_element'
    ? getElementTypeLabel((resource.resourceType ?? 'landing_page') as CampaignElementType)
    : resource.resourceType
    ? RESOURCE_TYPE_LABELS[resource.resourceType as ResourceType] ?? resource.resourceType
    : 'Asset';
}

export default function PromotionDetail() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<PromotionDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getPromotionDetail(id);
        if (!data) {
          setError('Promotion not found.');
        } else {
          setDetail(data);
        }
      } catch (err: any) {
        setError(err.message || 'Could not load this promotion.');
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
    return <div className="text-red-500 text-sm">{error || 'Promotion not found.'}</div>;
  }

  const { promotion, assignment, sponsor, collaborator, assets } = detail;

  return (
    <div className="space-y-6 max-w-4xl">
      <Link
        to="/marketplace"
        className="flex items-center gap-2 text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest"
      >
        <ArrowLeft size={14} /> Back to Marketplace
      </Link>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">
          Promotion Detail
        </p>
        <h1 className="text-2xl font-bold text-white capitalize">{promotion.status}</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Left column — Assignment / Sponsor / Collaborator / Created Date */}
        <div className="md:w-2/5">
          <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Assignment</p>
              {assignment ? (
                <Link
                  to={`/marketplace/assignments/${assignment.id}`}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  {assignment.title}
                </Link>
              ) : (
                <p className="text-sm text-zinc-500">No linked assignment.</p>
              )}
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Sponsor</p>
              {sponsor ? (
                <div>
                  <p className="text-sm text-white">{sponsor.name}</p>
                  {sponsor.email && <p className="text-xs text-zinc-500">{sponsor.email}</p>}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Unknown.</p>
              )}
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Collaborator</p>
              {collaborator ? (
                <div>
                  <p className="text-sm text-white">{collaborator.name}</p>
                  {collaborator.email && <p className="text-xs text-zinc-500">{collaborator.email}</p>}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">Unknown.</p>
              )}
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">Created Date</p>
              <p className="text-sm text-white">
                {new Date(promotion.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </section>
        </div>

        {/* Right column — Promoted Assets */}
        <div className="md:w-3/5">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">
            Promoted Assets
          </p>
          {assets.length === 0 ? (
            <p className="text-sm text-zinc-500">No assets in this promotion.</p>
          ) : (
            <div className="space-y-2">
              {assets.map(a => {
                const thumbnailSrc = resolveThumbnailSrc(a.resource);
                const title = a.resource?.title || 'Untitled Asset';
                return (
                  <Link
                    key={a.promotionAssetId}
                    to={`/assets/${a.assetId}`}
                    className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-3 hover:border-zinc-600 transition-all"
                  >
                    <div className="w-14 h-9 overflow-hidden rounded bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0">
                      {thumbnailSrc && (
                        <img src={thumbnailSrc} className="max-w-full max-h-full object-contain" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{title}</p>
                      <p className="text-[9px] font-black uppercase text-zinc-600 tracking-widest mt-0.5">
                        {resolveTypeLabel(a.resource)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
