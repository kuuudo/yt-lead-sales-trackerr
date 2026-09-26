/**
 * src/pages/CampaignStructureMap.tsx
 *
 * Route: /marketplace/campaigns/:campaignId/structure
 *
 * Purpose: a Miro/FigJam-style canvas showing a Campaign's ORGANIZATIONAL
 * STRUCTURE — Campaign at the root, branching down into Content / Own Assets
 * / Marketers, with Marketers branching further into Promotions and then
 * Assets.
 *
 * This is explicitly NOT a user/visitor journey view. It does not use and
 * must never be wired to: events_journey, journeyDiscovery.ts,
 * journeyGraph.ts, journeyDownstreamResolver.ts, click paths, attribution,
 * or any downstream/conversion analytics. See CampaignJourneyMap.tsx for
 * that concept — it is a separate page and is not touched by this file.
 *
 * Current state: 100% static mock data. No Supabase. No queries. No
 * aggregation. The goal of this pass is the visual hierarchy / canvas UX,
 * not real data — swapping MOCK_CAMPAIGN for a resolved campaign tree is a
 * future, separate change.
 *
 * Reused from CampaignJourneyMap.tsx (generic canvas infra only, not its
 * journey-specific layout):
 *   1. The canvas-space coordinate model (translate+scale transform,
 *      screen<->canvas conversion, wheel-to-zoom-at-cursor math).
 *   2. <CanvasGrid /> — stateless dot-grid background.
 *   3. curvePath() — bezier connector between two points.
 *   4. The card visual language (color dot + label, dim-on-hover).
 *
 * The layout itself is new: a layered top-down tree (root at top, rows by
 * depth), not the hub-and-spoke radial layout CampaignJourneyMap uses.
 *
 * This page does NOT use useWorkspaceStore and does NOT write to the
 * `widgets` table — same as CampaignJourneyMap.tsx / PromotionJourneyMap.tsx.
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, Network, Sparkles, Loader2, Search } from 'lucide-react'
import CanvasGrid from '../components/analytics/canvas/CanvasGrid'
import type { CanvasTransform } from '../components/analytics/store/useWorkspaceStore'
import { Campaign, supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useViewing } from '../lib/ViewingContext'
// Phase 1B-a: same asset↔campaign resolver AllAssetsAnalytics.tsx uses.
// Reusing the function directly (not re-deriving its join) so this page
// can never define campaign-membership differently from AllAssetsAnalytics.
import { getAssetAnalyticsRows } from '../services/asset/getAssetAnalyticsRows'
// Phase 1 thumbnail correction: reuse the existing generic-thumbnail
// resolvers AllAssetsAnalytics.tsx already uses for campaign_element /
// resource assets, instead of inventing a new naming/lookup system.
// Phase 2: resolveThumbnail (the video platform-image *fallback*) IS
// needed here, unlike the Marketer/Promotion asset nodes above — Content
// videos are multi-platform (FB/IG/Threads/etc, not guaranteed YouTube),
// so a null videos.thumbnail_url is expected and falls back to the
// matching /platform-thumbnails/*.jpg via PLATFORM_THUMBNAILS.
import {
  resolveAssetThumbnail,
  resolveElementThumbnail,
  resolveThumbnail,
  type ResourceType,
  type CampaignElementType,
} from '../lib/videoFormatters'

// ─── Real-data hooks (Phase 1A only: name + switcher) ───────────────────
// Copied from AllAssetsAnalytics.tsx's useCampaignOptions — same query,
// same viewer-id resolution. Not imported because it isn't exported from
// that file; kept identical on purpose so both pages stay in sync.
function useCampaignOptions(viewerId: string | null): Campaign[] {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  useEffect(() => {
    if (!viewerId) return
    let cancelled = false
    supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', viewerId)
      .then(({ data }) => {
        if (!cancelled) setCampaigns(data ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [viewerId])
  return campaigns
}

// ─── Phase 1B-a: real Marketer / Promotion nodes ────────────────────────
// Copied from AllAssetsAnalytics.tsx's resolveOrgAndViewer — same
// operator-mode-aware org/viewer resolution. Not imported because it isn't
// exported from that file (same situation as useCampaignOptions above).
async function resolveOrgAndViewer(viewing?: {
  viewingMemberId: string | null
  viewingOrgId: string | null
}): Promise<{ organizationId: string; viewerId: string }> {
  if (viewing?.viewingMemberId && viewing?.viewingOrgId) {
    return { organizationId: viewing.viewingOrgId, viewerId: viewing.viewingMemberId }
  }
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) {
    throw new Error('Not authenticated')
  }
  const viewerId = auth.user.id
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', viewerId)
    .limit(1)
    .maybeSingle()
  if (membership?.organization_id) {
    return { organizationId: membership.organization_id as string, viewerId }
  }
  const { data: asset } = await supabase
    .from('assets')
    .select('organization_id')
    .limit(1)
    .maybeSingle()
  if (!asset?.organization_id) {
    throw new Error('Could not resolve organizationId')
  }
  return { organizationId: asset.organization_id as string, viewerId }
}

const MARKETER_PALETTE = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#0ea5e9', '#ef4444']

/**
 * Phase 1 deterministic ordering: Recent first. Sorts ids by a created_at
 * lookup map, newest first. Missing/null created_at sorts last (stable,
 * never throws) rather than being silently treated as "oldest" or dropped.
 */
function sortByCreatedAtDesc(ids: string[], createdAtById: Map<string, string | null>): string[] {
  return [...ids].sort((a, b) => {
    const ta = createdAtById.get(a)
    const tb = createdAtById.get(b)
    if (!ta && !tb) return 0
    if (!ta) return 1
    if (!tb) return -1
    return new Date(tb).getTime() - new Date(ta).getTime()
  })
}

interface CampaignStructureData {
  marketerNodes: TreeNode[] | null
  ownAssetNodes: TreeNode[] | null
  loading: boolean
  error: string | null
}

/**
 * Real Marketer -> Promotion -> Asset nodes, plus real Own Assets, for the
 * current campaign. null (per field) = loading/unavailable, caller falls
 * back to MOCK_CAMPAIGN's own mock children in that case. [] = resolved,
 * genuinely empty (renders as a childless branch — layoutTree already
 * treats an empty children array the same as no children at all, so this
 * never produces broken/junk nodes).
 *
 * Semantics (nothing invented — see chat audit for each source):
 *  - Reuses getAssetAnalyticsRows() verbatim, filtered to rows whose LOCKED
 *    r.assetCampaign.campaignId matches this campaign (never
 *    redirect_links.campaign_id).
 *  - Promotion id per row = r.promotionIds[0], falling back to the
 *    promoting video's creative_promotion_id — same fallback
 *    AllAssetsAnalytics uses (row.promotion_id ||
 *    row.promoting_video.creative_promotion_id) for Creative-flow
 *    promotions. Missing this fallback is why a Creative-created marketer
 *    was silently dropped in the previous pass.
 *  - Marketer = promoting video's owner (videos.user_id) — same identity
 *    source as AllAssetsAnalytics' Content Owner column.
 *  - Promotion -> Asset = every r.asset_id sharing that same promotion id,
 *    from the same rows already loaded above — no second query, no new
 *    "belongs to this promotion" definition.
 *  - Own Asset = organizationId != null && r.assetOrganizationId ===
 *    organizationId — the exact "isMy" check AllAssetsAnalytics already
 *    uses for its "My Asset" badge (row 3563). NOTE: this only covers
 *    assets that appear in getAssetAnalyticsRows' rows, i.e. assets that
 *    have at least one promoting video. An owned asset with zero
 *    promotions anywhere would not show here yet — flagged, not silently
 *    special-cased.
 */
function useCampaignStructureData(
  campaignId: string | undefined,
  viewerId: string | null,
  isReadOnly: boolean,
  viewingMemberId: string | null,
  viewingOrgId: string | null,
): CampaignStructureData {
  const [marketerNodes, setMarketerNodes] = useState<TreeNode[] | null>(null)
  const [ownAssetNodes, setOwnAssetNodes] = useState<TreeNode[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!campaignId || !viewerId) {
      setMarketerNodes(null)
      setOwnAssetNodes(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const { organizationId, viewerId: resolvedViewerId } = await resolveOrgAndViewer(
          isReadOnly ? { viewingMemberId, viewingOrgId } : undefined,
        )
        const result = await getAssetAnalyticsRows({
          organizationId,
          viewerId: resolvedViewerId,
          dateRange: 'all',
          customRange: null,
          activeSource: 'total',
        })

        const campaignRows = (result.rows as any[]).filter(
          (r) => r.assetCampaign?.campaignId === campaignId,
        )
        if (campaignRows.length === 0) {
          if (!cancelled) {
            setMarketerNodes([])
            setOwnAssetNodes([])
          }
          return
        }

        const videoIds = Array.from(new Set(campaignRows.map((r) => r.video_id)))
        const { data: videoRows } = videoIds.length
          ? await supabase
              .from('videos')
              .select('id, user_id, creative_promotion_id')
              .in('id', videoIds)
          : { data: [] as any[] }
        const videoInfoByVideoId = new Map(
          (videoRows ?? []).map((v: any) => [
            v.id,
            {
              ownerId: v.user_id as string | null,
              creativePromotionId: v.creative_promotion_id as string | null,
            },
          ]),
        )
        const promoIdForRow = (r: any): string | null =>
          r.promotionIds?.[0] || videoInfoByVideoId.get(r.video_id)?.creativePromotionId || null

        const ownerIds = Array.from(
          new Set(
            Array.from(videoInfoByVideoId.values())
              .map((v) => v.ownerId)
              .filter((id): id is string => !!id),
          ),
        )
        const { data: ownerProfiles } = ownerIds.length
          ? await supabase.from('profiles').select('id, email, full_name').in('id', ownerIds)
          : { data: [] as any[] }
        const profileByUserId = new Map((ownerProfiles ?? []).map((p: any) => [p.id, p]))

        const promotionIds = Array.from(
          new Set(campaignRows.map((r) => promoIdForRow(r)).filter((id): id is string => !!id)),
        )
        const { data: promoRows } = promotionIds.length
          ? await supabase.from('promotions').select('id, assignment_id, campaign_id, created_at').in('id', promotionIds)
          : { data: [] as any[] }
        const assignmentIds = Array.from(
          new Set((promoRows ?? []).map((p: any) => p.assignment_id).filter(Boolean)),
        )
        const promoCampaignIds = Array.from(
          new Set((promoRows ?? []).map((p: any) => p.campaign_id).filter(Boolean)),
        )
        const [{ data: assignmentRows }, { data: campaignNameRows }] = await Promise.all([
          assignmentIds.length
            ? supabase.from('assignments').select('id, title').in('id', assignmentIds)
            : Promise.resolve({ data: [] as any[] }),
          promoCampaignIds.length
            ? supabase.from('campaigns').select('id, campaign_name').in('id', promoCampaignIds)
            : Promise.resolve({ data: [] as any[] }),
        ])
        const titleByAssignmentId = new Map(
          (assignmentRows ?? []).map((a: any) => [a.id, a.title as string]),
        )
        const nameByCampaignId = new Map(
          (campaignNameRows ?? []).map((c: any) => [c.id, c.campaign_name as string]),
        )
        const promotionNameById = new Map<string, string>()
        const promoCreatedAtById = new Map<string, string | null>()
        for (const p of promoRows ?? []) {
          const name =
            (p.assignment_id && titleByAssignmentId.get(p.assignment_id)) ??
            (p.campaign_id && nameByCampaignId.get(p.campaign_id)) ??
            null
          if (name) promotionNameById.set(p.id, name)
          promoCreatedAtById.set(p.id, (p as any).created_at ?? null)
        }

        // Promotion -> Assets, from the rows already loaded above.
        const assetIdsByPromotionId = new Map<string, Set<string>>()
        for (const r of campaignRows) {
          const promoId = promoIdForRow(r)
          if (!promoId) continue
          if (!assetIdsByPromotionId.has(promoId)) assetIdsByPromotionId.set(promoId, new Set())
          assetIdsByPromotionId.get(promoId)!.add(r.asset_id)
        }

        // Asset display titles — same embed shape + field-priority order as
        // AllAssetsAnalytics' assetDisplay map (row ~548-582): PostgREST
        // embeds can come back as an array OR a single object, so both are
        // normalized the same way AllAssetsAnalytics does (its own comment
        // there notes asset_resources silently broke once from skipping
        // this). No thumbnail resolution — not needed on this map.
        const allAssetIds = Array.from(new Set(campaignRows.map((r) => r.asset_id)))
        const { data: assetRows } = allAssetIds.length
          ? await supabase
              .from('assets')
              .select(
                'id, created_at, asset_type, videos(video_title, thumbnail_url, platform), asset_resources(title, thumbnail_url, resource_type, platform), campaign_element_assets(display_name, element_type)',
              )
              .in('id', allAssetIds)
          : { data: [] as any[] }
        const assetTitleById = new Map<string, string>()
        const assetCreatedAtById = new Map<string, string | null>()
        // Priority: YouTube video asset -> real videos.thumbnail_url only
        // (never a generic fallback). Campaign element -> existing generic
        // element-thumbnail resolver. Resource / other non-video asset ->
        // existing generic asset-thumbnail resolver. asset_type is the
        // discriminator (same one AllAssetsAnalytics.tsx's assetDisplay map
        // uses), not thumbnail_url presence.
        const assetThumbnailById = new Map<string, string | null>()
        for (const row of assetRows ?? []) {
          const v = Array.isArray((row as any).videos) ? (row as any).videos[0] : (row as any).videos
          const res = Array.isArray((row as any).asset_resources)
            ? (row as any).asset_resources[0]
            : (row as any).asset_resources
          const el = Array.isArray((row as any).campaign_element_assets)
            ? (row as any).campaign_element_assets[0]
            : (row as any).campaign_element_assets
          const title = v?.video_title ?? res?.title ?? el?.display_name ?? null
          if (title) assetTitleById.set((row as any).id, title)
          assetCreatedAtById.set((row as any).id, (row as any).created_at ?? null)

          const assetType = (row as any).asset_type
          let thumbnailUrl: string | null = null
          if (assetType === 'campaign_element') {
            thumbnailUrl = resolveElementThumbnail((el?.element_type ?? 'landing_page') as CampaignElementType)
          } else if (assetType === 'resource') {
            thumbnailUrl = resolveAssetThumbnail({
              thumbnail_url: res?.thumbnail_url ?? null,
              resource_type: (res?.resource_type ?? 'other') as ResourceType,
              platform: res?.platform ?? null,
            })
          } else if ((v?.platform ?? 'youtube') === 'youtube') {
            thumbnailUrl = v?.thumbnail_url ?? null
          }
          assetThumbnailById.set((row as any).id, thumbnailUrl)
        }

        // Marketer (owner) -> set of promotion ids.
        const marketerMap = new Map<string, Set<string>>()
        for (const r of campaignRows) {
          const ownerId = videoInfoByVideoId.get(r.video_id)?.ownerId ?? null
          const promoId = promoIdForRow(r)
          if (!ownerId || !promoId) continue
          if (!marketerMap.has(ownerId)) marketerMap.set(ownerId, new Set())
          marketerMap.get(ownerId)!.add(promoId)
        }

        const marketers: TreeNode[] = Array.from(marketerMap.entries()).map(([ownerId, promoIdSet], i) => {
          const color = MARKETER_PALETTE[i % MARKETER_PALETTE.length]
          const profile = profileByUserId.get(ownerId)
          const marketerName = profile?.full_name?.trim() || profile?.email || 'Marketer'
          // Phase 3: month-bucket a marketer by its MOST RECENT promotion's
          // created_at — sortedPromoIds[0], since sortByCreatedAtDesc already
          // orders recent-first. No new date source invented.
          const sortedPromoIds = sortByCreatedAtDesc(Array.from(promoIdSet), promoCreatedAtById)
          return {
            id: `marketer_${ownerId}`,
            label: marketerName,
            kind: 'marketer',
            color,
            createdAt: sortedPromoIds.length ? promoCreatedAtById.get(sortedPromoIds[0]) ?? null : null,
            children: sortedPromoIds.map((promoId) => ({
              id: `promo_${promoId}`,
              label: promotionNameById.get(promoId) ?? 'Promotion',
              kind: 'promotion',
              color,
              children: sortByCreatedAtDesc(
                Array.from(assetIdsByPromotionId.get(promoId) ?? []),
                assetCreatedAtById,
              ).map((assetId) => ({
                id: `asset_${promoId}_${assetId}`,
                label: assetTitleById.get(assetId) ?? assetId,
                kind: 'asset',
                color,
                thumbnailUrl: assetThumbnailById.get(assetId) ?? null,
              })),
            })),
          }
        })

        const ownAssetIds = new Set(
          campaignRows
            .filter((r) => organizationId != null && r.assetOrganizationId === organizationId)
            .map((r) => r.asset_id),
        )
        const ownAssets: TreeNode[] = sortByCreatedAtDesc(Array.from(ownAssetIds), assetCreatedAtById).map(
          (assetId) => ({
            id: `own_asset_${assetId}`,
            label: assetTitleById.get(assetId) ?? assetId,
            kind: 'asset',
            color: '#10b981',
            // Phase 3: needed to bucket this asset into a Month circle.
            createdAt: assetCreatedAtById.get(assetId) ?? null,
            thumbnailUrl: assetThumbnailById.get(assetId) ?? null,
          }),
        )

        if (!cancelled) {
          setMarketerNodes(marketers)
          setOwnAssetNodes(ownAssets)
        }
      } catch (err) {
        console.error('[CampaignStructureMap] useCampaignStructureData failed:', err)
        if (!cancelled) {
          setMarketerNodes(null)
          setOwnAssetNodes(null)
          setError(err instanceof Error ? err.message : 'Failed to load campaign structure.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [campaignId, viewerId, isReadOnly, viewingMemberId, viewingOrgId])

  return { marketerNodes, ownAssetNodes, loading, error }
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** One row from `videos`, trimmed to exactly what the Content month-circle
 *  UI needs: enough to bucket by month, filter by title, and (once a month
 *  circle is expanded) render an individual video node. */
interface ContentVideo {
  id: string
  title: string
  createdAt: string
  thumbnailUrl: string | null
  platform: string | null
}

/**
 * Real Content videos for the current campaign — one row per video, NOT
 * pre-bucketed. Phase 2A: bucketing/search/date-range are UI-state concerns
 * that change on every keystroke or filter click, so grouping now happens
 * per render in buildContentMonthNodes() below, not once here at fetch
 * time — this hook's only job is fetching the flat video list.
 *
 * Deliberately a SEPARATE data source from useCampaignStructureData above:
 * Content = the campaign's own video content, i.e. videos.campaign_id
 * (what AllAssetsAnalytics resolves as promoting_video.content_campaign_id
 * for its own, separate "Content Campaign" column) — not the asset-
 * provenance campaign_id used for Marketers/Promotions/Own Assets. This
 * mirrors AllAssetsAnalytics' own Asset Campaign vs Content Campaign split,
 * not a new distinction invented here.
 */
function useCampaignContentBuckets(
  campaignId: string | undefined,
  viewerId: string | null,
): { contentVideos: ContentVideo[] | null; loading: boolean; error: string | null } {
  const [contentVideos, setContentVideos] = useState<ContentVideo[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!campaignId || !viewerId) {
      setContentVideos(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const { data: videoRows } = await supabase
          .from('videos')
          .select('id, created_at, video_title, thumbnail_url, platform')
          .eq('campaign_id', campaignId)

        const videos: ContentVideo[] = (videoRows ?? [])
          .filter((v: any) => !!v.created_at)
          .map((v: any) => ({
            id: v.id as string,
            title: (v.video_title as string | null) ?? 'Untitled video',
            createdAt: v.created_at as string,
            thumbnailUrl: (v.thumbnail_url as string | null) ?? null,
            platform: (v.platform as string | null) ?? null,
          }))

        if (!cancelled) setContentVideos(videos)
      } catch (err) {
        console.error('[CampaignStructureMap] useCampaignContentBuckets failed:', err)
        if (!cancelled) {
          setContentVideos(null)
          setError(err instanceof Error ? err.message : 'Failed to load content.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [campaignId, viewerId])

  return { contentVideos, loading, error }
}

// ─── Static mock data model ─────────────────────────────────────────────
// Deliberately NOT fetched from anywhere. Swapping this for a real,
// resolved campaign/marketer/promotion/asset tree is future work.

type NodeKind = 'campaign' | 'branch' | 'marketer' | 'promotion' | 'asset' | 'month' | 'video'

interface TreeNode {
  id: string
  label: string
  kind: NodeKind
  color: string
  children?: TreeNode[]
  /** Phase 1 collapse: marks a synthetic "+ Show N more" control node.
   *  Never produced by real data — only sliceWithShowMore() sets this. */
  isShowMore?: boolean
  /** Phase 1 thumbnails: optional thumbnail URL, populated for kind: 'asset'
   *  nodes only. undefined/null means "no thumbnail available". */
  thumbnailUrl?: string | null
  /** Phase 2: optional second line of text under a node's main label — used 
   *  by Content month-circle nodes to show "N videos" without baking the 
   *  count into the label string. */ 
  subtitle?: string 
  /** Phase 3: ISO date string used to bucket a node into a Month circle
   *  (Marketers' marketer nodes, Own Assets' asset nodes). Undefined/null on
   *  nodes that are never month-bucketed themselves (branch/campaign/
   *  promotion/asset-within-a-promotion/video — video keeps its date in
   *  ContentVideo.createdAt until buildContentMonthNodes converts it). */
  createdAt?: string | null
}

// Per-marketer accent colors so each Marketer -> Promotions -> Assets
// branch reads as its own visual lane on the canvas.
const MARKETER_A = '#6366f1' // indigo
const MARKETER_B = '#ec4899' // pink
const MARKETER_C = '#f59e0b' // amber

const MOCK_CAMPAIGN: TreeNode = {
  id: 'campaign_a',
  label: 'Campaign A',
  kind: 'campaign',
  color: '#111827',
  children: [
    { id: 'content', label: 'Content', kind: 'branch', color: '#0ea5e9' },
    { id: 'own_assets', label: 'Own Assets', kind: 'branch', color: '#10b981' },
    {
      id: 'marketers',
      label: 'Marketers',
      kind: 'branch',
      color: '#8b5cf6',
      children: [
        {
          id: 'marketer_a',
          label: 'Marketer A',
          kind: 'marketer',
          color: MARKETER_A,
          children: [
            {
              id: 'promo_a',
              label: 'Promotion A',
              kind: 'promotion',
              color: MARKETER_A,
              children: [
                { id: 'asset_a', label: 'Asset A', kind: 'asset', color: MARKETER_A },
                { id: 'asset_b', label: 'Asset B', kind: 'asset', color: MARKETER_A },
              ],
            },
            {
              id: 'promo_b',
              label: 'Promotion B',
              kind: 'promotion',
              color: MARKETER_A,
              children: [{ id: 'asset_c', label: 'Asset C', kind: 'asset', color: MARKETER_A }],
            },
          ],
        },
        {
          id: 'marketer_b',
          label: 'Marketer B',
          kind: 'marketer',
          color: MARKETER_B,
          children: [
            {
              id: 'promo_c',
              label: 'Promotion C',
              kind: 'promotion',
              color: MARKETER_B,
              children: [
                { id: 'asset_d', label: 'Asset D', kind: 'asset', color: MARKETER_B },
                { id: 'asset_e', label: 'Asset E', kind: 'asset', color: MARKETER_B },
              ],
            },
            {
              id: 'promo_d',
              label: 'Promotion D',
              kind: 'promotion',
              color: MARKETER_B,
              children: [{ id: 'asset_f', label: 'Asset F', kind: 'asset', color: MARKETER_B }],
            },
          ],
        },
        {
          id: 'marketer_c',
          label: 'Marketer C',
          kind: 'marketer',
          color: MARKETER_C,
          children: [
            {
              id: 'promo_e',
              label: 'Promotion E',
              kind: 'promotion',
              color: MARKETER_C,
              children: [{ id: 'asset_g', label: 'Asset G', kind: 'asset', color: MARKETER_C }],
            },
          ],
        },
      ],
    },
  ],
}

// ─── Layout constants ───────────────────────────────────────────────────────

const ROW_HEIGHT = 190
const LEAF_GAP = 190
const PADDING_X = 100
const PADDING_TOP = 70
const PADDING_BOTTOM = 120
// Phase 2: an expanded month's video children wrap into a grid instead of
// stretching one row wider per video — see the 'month' case in place()
// below. Columns reuse LEAF_GAP so a grid never overlaps a sibling month's
// own leaf slot; VIDEO_ROW_GAP is tighter than ROW_HEIGHT since these are
// small leaf nodes, not another full tree row.
const VIDEO_GRID_COLS = 6
const VIDEO_ROW_GAP = 64
const NODE_SIZE: Record<NodeKind, { w: number; h: number }> = {
  campaign: { w: 230, h: 72 },
  branch: { w: 190, h: 60 },
  marketer: { w: 118, h: 118 },
  promotion: { w: 104, h: 104 },
  asset: { w: 148, h: 46 },
  month: { w: 108, h: 108 },
  video: { w: 148, h: 46 },
}

const NODE_KIND_LABEL: Record<NodeKind, string> = {
  campaign: 'Campaign',
  branch: 'Branch',
  marketer: 'Marketer',
  promotion: 'Promotion',
  asset: 'Asset',
  month: 'Month',
  video: 'Video',
}

const MIN_SCALE = 0.4
const MAX_SCALE = 2.2
const ZOOM_STEP = 0.15

// ─── Geometry helpers ───────────────────────────────────────────────────────

type Pt = { x: number; y: number }

/** Smooth cubic bezier between two points, curving along whichever axis dominates. */
function curvePath(a: Pt, b: Pt): string {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const midX = (a.x + b.x) / 2
    return `M ${a.x} ${a.y} C ${midX} ${a.y} ${midX} ${b.y} ${b.x} ${b.y}`
  }
  const midY = (a.y + b.y) / 2
  return `M ${a.x} ${a.y} C ${a.x} ${midY} ${b.x} ${midY} ${b.x} ${b.y}`
}

interface PositionedNode {
  id: string
  label: string
  kind: NodeKind
  color: string
  center: Pt
  w: number
  h: number
  depth: number
  /** id of the top-level lane this node belongs to (content / own_assets /
   *  a specific marketer) — used to dim unrelated branches on hover. */
  branchId: string
}

interface Edge {
  fromId: string
  toId: string
  color: string
  branchId: string
}

/**
 * Layered top-down tree layout: y = depth * row height. x is assigned by
 * walking the tree depth-first — each leaf gets the next slot on a fixed
 * horizontal grid, and each internal node is centered over its children.
 */
function layoutTree(root: TreeNode) {
  const nodes: PositionedNode[] = []
  const edges: Edge[] = []
  let leafCursor = 0

  function place(node: TreeNode, depth: number, parentBranch: string | null): { x: number; branchId: string } {
    // Depth-1 nodes (Content / Own Assets / Marketers) start their own lane.
    // Marketer nodes (children of the "marketers" branch) start their own
    // sub-lane so each marketer's promotions/assets read as one branch.
    // Phase 3: was `parentBranch === 'marketers'`, which assumed marketer
    // nodes were DIRECT children of the Marketers branch. Now they're
    // grandchildren (Marketers -> Month -> Marketer), so lane-splitting is
    // keyed off the marketer's own kind instead of its parent id — this is
    // what keeps each marketer's hover-dim lane working once a Month layer
    // sits in between.
    const branchId = depth === 1 ? node.id : node.kind === 'marketer' ? node.id : parentBranch ?? node.id

    let x: number
    if (!node.children || node.children.length === 0) {
      x = leafCursor * LEAF_GAP
      leafCursor += 1
    } else if (
      (node.kind === 'month' || node.kind === 'promotion') &&
      node.children.every((child) => child.kind === 'video' || child.kind === 'asset')
    ) {
      // Grid-wrap: place every video directly (they have no children of
      // their own, so no further recursion needed), VIDEO_GRID_COLS per
      // row, wrapping down instead of stretching sideways.
      const cols = Math.min(VIDEO_GRID_COLS, node.children.length)
      const gridStartCursor = leafCursor
      node.children.forEach((child, i) => {
        const col = i % cols
        const row = Math.floor(i / cols)
        const { w: cw, h: ch } = NODE_SIZE[child.kind]
        nodes.push({
          id: child.id,
          label: child.label,
          kind: child.kind,
          color: child.color,
          center: { x: (gridStartCursor + col) * LEAF_GAP, y: depth * ROW_HEIGHT + ROW_HEIGHT + row * VIDEO_ROW_GAP },
          w: cw,
          h: ch,
          depth: depth + 1,
          branchId,
        })
      })
      leafCursor += cols
      x = ((gridStartCursor + 0) * LEAF_GAP + (gridStartCursor + cols - 1) * LEAF_GAP) / 2
    } else {
      const childCenters = node.children.map((child) => place(child, depth + 1, branchId).x)
      x = (childCenters[0] + childCenters[childCenters.length - 1]) / 2
    }

    const { w, h } = NODE_SIZE[node.kind]
    nodes.push({
      id: node.id,
      label: node.label,
      kind: node.kind,
      color: node.color,
      center: { x, y: depth * ROW_HEIGHT },
      w,
      h,
      depth,
      branchId,
    })
    return { x, branchId }
  }

  place(root, 0, null)

  const byId = new Map(nodes.map((n) => [n.id, n]))
  function walkEdges(node: TreeNode) {
    node.children?.forEach((child) => {
      const c = byId.get(child.id)!
      edges.push({ fromId: node.id, toId: child.id, color: c.color, branchId: c.branchId })
      walkEdges(child)
    })
  }
  walkEdges(root)
    

  // Normalize so the leftmost node starts at PADDING_X, and the root row
  // starts at PADDING_TOP, regardless of tree shape.
  const minX = Math.min(...nodes.map((n) => n.center.x - n.w / 2))
  const maxX = Math.max(...nodes.map((n) => n.center.x + n.w / 2))
  const maxY = Math.max(...nodes.map((n) => n.center.y + n.h / 2))
  const offsetX = PADDING_X - minX

  const shift = (p: Pt) => ({ x: p.x + offsetX, y: p.y + PADDING_TOP })
  const shiftedNodes = nodes.map((n) => ({ ...n, center: shift(n.center) }))
  

  return {
    nodes: shiftedNodes,
    edges,
    canvasW: maxX - minX + PADDING_X * 2,
    canvasH: maxY + PADDING_TOP + PADDING_BOTTOM,
  }
}

// ─── Phase 1: collapse / "Show More" ─────────────────────────────────────
// Deliberately separate from layoutTree() above — layoutTree() is untouched
// and never knows collapsing exists. These helpers shape `children` arrays
// *before* the tree is handed to layoutTree(), so layoutTree() only ever
// sees whatever is currently meant to be visible.

/**
 * Caps `items` to `limit` and appends a synthetic "+ Show N more" node when
 * collapsed and there's overflow. Pure — no state, no side effects.
 *  - expanded, or items.length <= limit -> return items unchanged
 *  - collapsed + overflow -> first `limit` items + one isShowMore node
 * The Show More node reuses items[0].kind so it gets the same NODE_SIZE
 * (and thus layout box) as its siblings, without layoutTree needing a new
 * NodeKind or any special-casing.
 */
function sliceWithShowMore(
  items: TreeNode[],
  limit: number,
  expanded: boolean,
  showMoreId: string,
  showMoreColor: string,
): TreeNode[] {
  if (expanded || items.length <= limit) return items
  const remaining = items.length - limit
  return [
    ...items.slice(0, limit),
    {
      id: showMoreId,
      label: `+ Show ${remaining} more`,
      kind: items[0]?.kind ?? 'asset',
      color: showMoreColor,
      isShowMore: true,
    },
  ]
}

/**
 * Applies the Marketer -> Promotions (limit 4) and Promotion -> Assets
 * (limit 3) collapse independently for every marketer/promotion, using the
 * per-id expanded state maps. Runs on the already Recent-sorted children
 * from useCampaignStructureData — this function only decides visibility,
 * never ordering.
 */
/**
 * Phase 3: Marketer -> Promotion -> Asset circles. Replaces the old
 * sliceWithShowMore flat list: a collapsed marketer/promotion shows ZERO
 * children (same convention as a collapsed month) instead of "first N + Show
 * more"; clicking the circle itself toggles expandedMarketers/
 * expandedPromotions directly (see handleClusterClick) — no synthetic
 * show-more node involved anymore. sliceWithShowMore is no longer called
 * from here (still defined, still used by nothing else after this patch —
 * see flagged items).
 */
function applyStructureCollapse(
  marketerNodes: TreeNode[],
  expandedMarketers: Record<string, boolean>,
  expandedPromotions: Record<string, boolean>,
): TreeNode[] {
  return marketerNodes.map((marketer) => {
    const promoCount = marketer.children?.length ?? 0
    const isMarketerExpanded = !!expandedMarketers[marketer.id]
    const promotions = isMarketerExpanded
      ? (marketer.children ?? []).map((promotion) => {
          const assetCount = promotion.children?.length ?? 0
          const isPromotionExpanded = !!expandedPromotions[promotion.id]
          return {
            ...promotion,
            subtitle: `${assetCount} asset${assetCount === 1 ? '' : 's'}`,
            children: isPromotionExpanded ? promotion.children ?? [] : [],
          }
        })
      : []
    return {
      ...marketer,
      subtitle: `${promoCount} promo${promoCount === 1 ? '' : 's'}`,
      children: promotions,
    }
  })
}

/**
 * PositionedNode (built by layoutTree/place()) only carries {id, label,
 * kind, color, center, w, h, depth, branchId} — it does not pass through
 * arbitrary TreeNode fields, and layoutTree()/PositionedNode are not being
 * modified for this change. So isShowMore/thumbnailUrl are looked up here,
 * by node id, from the pre-layout TreeNode tree instead of expected to be
 * present on the positioned node itself.
 */
function collectNodeMeta(
  root: TreeNode,
  out: Map<string, { isShowMore?: boolean; thumbnailUrl?: string | null; subtitle?: string }> = new Map(),
) {
  if (root.isShowMore || root.thumbnailUrl !== undefined || root.subtitle !== undefined) {
    out.set(root.id, { isShowMore: root.isShowMore, thumbnailUrl: root.thumbnailUrl, subtitle: root.subtitle })
  }
  root.children?.forEach((child) => collectNodeMeta(child, out))
  return out
}

/**
 * Phase 2B: groups Content videos into per-month circle nodes, applying the
 * search + date-range filters (Layer 1+2 from the plan) before bucketing,
 * and only turning a month's videos into TreeNodes if that month's circle
 * is currently expanded (Layer 3) — a collapsed month's videos are never
 * built into nodes at all, so a 200-video campaign never mounts 200 DOM
 * nodes. An expanded month is additionally capped at 30 video nodes as a
 * safety ceiling; there is no further "show more" control inside a month
 * yet (flagged, not silently solved — narrow the date range or search to
 * see the rest for now).
 */
/**
 * Phase 3: generalized month-circle bucketer. Takes ALREADY-BUILT TreeNode
 * children (each must carry createdAt) instead of a bespoke row type, so the
 * exact search + date-range + expand/collapse machinery Content shipped with
 * now backs Own Assets and Marketers too — no second implementation.
 *  - matchesSearch: per-branch predicate. Content: video title contains
 *    query. Own Assets: asset label contains query. Marketers: ANY nested
 *    promotion's label contains query (not the marketer's own label) — per
 *    spec, search filters Marketers by promotion name.
 *  - idPrefix: keeps month-circle ids collision-free across branches
 *    (content_month_*, own_assets_month_*, marketer_month_*) so all three
 *    branches can share ONE expandedMonths state map.
 *  - mapExpandedChildren: post-processes an EXPANDED month's exposed,
 *    recent-first items only. Content caps to 30 + converts nothing further
 *    (already TreeNodes). Marketers re-runs applyStructureCollapse so the
 *    Promotion/Asset circles underneath keep working. Own Assets passes
 *    through unchanged (identity, the default).
 *  - Items missing createdAt are dropped from every month (flagged, not
 *    silently bucketed as "now" or "unknown" — matches this file's existing
 *    convention of flagging gaps instead of guessing).
 */
function buildMonthClusterNodes(
  items: TreeNode[],
  matchesSearch: (item: TreeNode, query: string) => boolean,
  search: string,
  dateRange: DateRangeValue,
  expandedMonths: Record<string, boolean>,
  idPrefix: string,
  color: string,
  countLabel: (count: number) => string,
  mapExpandedChildren: (monthItems: TreeNode[]) => TreeNode[] = (x) => x,
): TreeNode[] {
  const cutoff = dateRangeCutoff(dateRange)
  const query = search.trim().toLowerCase()
  const filtered = items.filter((item) => {
    if (!item.createdAt) return false
    if (cutoff !== null && new Date(item.createdAt).getTime() < cutoff) return false
    if (query && !matchesSearch(item, query)) return false
    return true
  })

  const buckets = new Map<string, { year: number; month: number; items: TreeNode[] }>()
  for (const item of filtered) {
    const d = new Date(item.createdAt!)
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth()
    const key = `${year}_${month}`
    if (!buckets.has(key)) buckets.set(key, { year, month, items: [] })
    buckets.get(key)!.items.push(item)
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.year - a.year || b.month - a.month)
    .map(({ year, month, items: monthItems }) => {
      const id = `${idPrefix}_${year}_${month}`
      const sorted = [...monthItems].sort(
        (a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime(),
      )
      return {
        id,
        label: `${MONTH_LABELS[month]} ${year}`,
        kind: 'month',
        color,
        subtitle: countLabel(monthItems.length),
        children: expandedMonths[id] ? mapExpandedChildren(sorted) : [],
      }
    })
}

/** Content's own month bucketer, now a thin wrapper over buildMonthClusterNodes
 *  — converts the raw video rows to TreeNodes once, then defers to the shared
 *  engine. Behavior and ids (content_month_*, content_video_*) are unchanged. */
function buildContentMonthNodes(
  videos: ContentVideo[],
  search: string,
  dateRange: DateRangeValue,
  expandedMonths: Record<string, boolean>,
  color: string,
): TreeNode[] {
  const videoNodes: TreeNode[] = videos.map((v) => ({
    id: `content_video_${v.id}`,
    label: v.title,
    kind: 'video',
    color,
    createdAt: v.createdAt,
    thumbnailUrl: resolveThumbnail({ thumbnail_url: v.thumbnailUrl, platform: v.platform }),
  }))
  return buildMonthClusterNodes(
    videoNodes,
    (video, q) => video.label.toLowerCase().includes(q),
    search,
    dateRange,
    expandedMonths,
    'content_month',
    color,
    (n) => `${n} video${n === 1 ? '' : 's'}`,
    (sorted) => sorted.slice(0, 30),
  )
}
type DateRangeValue = 'all' | '7' | '30' | '90' | 'year'

function dateRangeCutoff(dateRange: DateRangeValue): number | null {
  const now = Date.now()
  return dateRange === '7'
    ? now - 7 * 86400000
    : dateRange === '30'
    ? now - 30 * 86400000
    : dateRange === '90'
    ? now - 90 * 86400000
    : dateRange === 'year'
    ? new Date(new Date().getUTCFullYear(), 0, 1).getTime()
    : null
}

  const query = search.trim().toLowerCase()
  const filtered = videos.filter((v) => {
    if (cutoff !== null && new Date(v.createdAt).getTime() < cutoff) return false
    if (query && !v.title.toLowerCase().includes(query)) return false
    return true
  })

  const buckets = new Map<string, { year: number; month: number; videos: ContentVideo[] }>()
  for (const v of filtered) {
    const d = new Date(v.createdAt)
    const year = d.getUTCFullYear()
    const month = d.getUTCMonth()
    const key = `${year}_${month}`
    if (!buckets.has(key)) buckets.set(key, { year, month, videos: [] })
    buckets.get(key)!.videos.push(v)
  }

  return Array.from(buckets.values())
    .sort((a, b) => b.year - a.year || b.month - a.month)
    .map(({ year, month, videos: monthVideos }) => {
      const id = `content_month_${year}_${month}`
      const sorted = [...monthVideos].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      const videoNodes: TreeNode[] = sorted.slice(0, 30).map((v) => ({
        id: `content_video_${v.id}`,
        label: v.title,
        kind: 'video',
        color,
        thumbnailUrl: resolveThumbnail({ thumbnail_url: v.thumbnailUrl, platform: v.platform }),
      }))
      return {
        id,
        label: `${MONTH_LABELS[month]} ${year}`,
        kind: 'month',
        color,
        subtitle: `${monthVideos.length} video${monthVideos.length === 1 ? '' : 's'}`,
        children: expandedMonths[id] ? videoNodes : [],
      }
    })
}

// ─── Component ──────────────────────────────────────────────────────────────

interface CampaignStructureMapProps {
  embedded?: boolean;
}

export default function CampaignStructureMap({ embedded = false }: CampaignStructureMapProps) {
  const { campaignId } = useParams<{ campaignId: string }>()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)

  // Phase 1A: real campaign name + switcher only. Same viewer-id
  // resolution as AllAssetsAnalytics (Operator-Mode-aware).
  const { user } = useAuth()
  const { viewingMemberId, viewingOrgId, isReadOnly } = useViewing()
  const effectiveViewerId = isReadOnly ? viewingMemberId : (user?.id ?? null)
  const campaignOptions = useCampaignOptions(effectiveViewerId)
  const currentCampaignName = useMemo(
    () => campaignOptions.find((c) => c.id === campaignId)?.campaign_name ?? null,
    [campaignOptions, campaignId]
  )

  // Phase 1B-a: real Marketer/Promotion nodes, everything else from
  // MOCK_CAMPAIGN unchanged. null (loading/unavailable) falls back to
  // MOCK_CAMPAIGN's own mock marketers -> no blank/broken state.
  const structureData = useCampaignStructureData(
    campaignId,
    effectiveViewerId,
    isReadOnly,
    viewingMemberId,
    viewingOrgId,
  )
  const contentData = useCampaignContentBuckets(campaignId, effectiveViewerId)
  // Full-map gate: only swap in real branches once ALL three are ready at
  // the same time — never a mix of some-real/some-mock. While not ready,
  // the tree stays pure MOCK_CAMPAIGN; canvasContainer below covers it with
  // an opaque loading state so nothing partially-built is ever visible.
  const isRealDataReady =
    structureData.marketerNodes !== null &&
    structureData.ownAssetNodes !== null &&
    contentData.contentVideos !== null
  const isRealDataError = !!(structureData.error || contentData.error)

  // Phase 1: collapse / "Show More" state. Keyed by node id so each
  // marketer's and each promotion's expanded state is independent, and
  // survives re-renders of the same campaign. Two-state toggle only
  // (collapsed <-> fully expanded), per spec.
  const [expandedMarketers, setExpandedMarketers] = useState<Record<string, boolean>>({})
  const [expandedPromotions, setExpandedPromotions] = useState<Record<string, boolean>>({})
  // Phase 1: global thumbnail toggle, default OFF.
  const [showThumbnails, setShowThumbnails] = useState(false)
  // Phase 2: Content search + date-range filters, and per-month circle
  // expand state. A month circle starts collapsed (no video nodes built)
  // and only gets video children once expanded — see buildContentMonthNodes.
  const [contentSearch, setContentSearch] = useState('')
  const [contentDateRange, setContentDateRange] = useState<DateRangeValue>('90')
  // Phase 3: same chip mechanism, now also on Marketers and Own Assets.
  // Both default to "All time" (Content keeps its 90-day default) per spec.
  const [marketersSearch, setMarketersSearch] = useState('')
  const [marketersDateRange, setMarketersDateRange] = useState<DateRangeValue>('all')
  const [ownAssetsSearch, setOwnAssetsSearch] = useState('')
  const [ownAssetsDateRange, setOwnAssetsDateRange] = useState<DateRangeValue>('all')
  // Intentionally ONE shared map for all three branches' month circles — ids
  // are already prefixed per branch (content_month_ / marketer_month_ /
  // own_assets_month_) so keys never collide.
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({})

  const campaignTree = useMemo<TreeNode>(() => {
    if (!isRealDataReady) return MOCK_CAMPAIGN
    return {
      ...MOCK_CAMPAIGN,
      label: currentCampaignName ?? MOCK_CAMPAIGN.label,
      children: MOCK_CAMPAIGN.children!.map((branch) => {
        if (branch.id === 'marketers') {
          return {
            ...branch,
            children: buildMonthClusterNodes(
              structureData.marketerNodes!,
              (marketer, q) => (marketer.children ?? []).some((promo) => promo.label.toLowerCase().includes(q)),
              marketersSearch,
              marketersDateRange,
              expandedMonths,
              'marketer_month',
              branch.color,
              (n) => `${n} mktr${n === 1 ? '' : 's'}`,
              (monthMarketers) => applyStructureCollapse(monthMarketers, expandedMarketers, expandedPromotions),
            ),
          }
        }
        if (branch.id === 'own_assets') {
          return {
            ...branch,
            children: buildMonthClusterNodes(
              structureData.ownAssetNodes!,
              (asset, q) => asset.label.toLowerCase().includes(q),
              ownAssetsSearch,
              ownAssetsDateRange,
              expandedMonths,
              'own_assets_month',
              branch.color,
              (n) => `${n} asset${n === 1 ? '' : 's'}`,
            ),
          }
        }
        if (branch.id === 'content') {
          return {
            ...branch,
            children: buildContentMonthNodes(
              contentData.contentVideos!,
              contentSearch,
              contentDateRange,
              expandedMonths,
              branch.color,
            ),
          }
        }
        return branch
      }),
    }
  }, [
    isRealDataReady,
    currentCampaignName,
    structureData.marketerNodes,
    structureData.ownAssetNodes,
    contentData.contentVideos,
    expandedMarketers,
    expandedPromotions,
    contentSearch,
    contentDateRange,
    marketersSearch,
    marketersDateRange,
    ownAssetsSearch,
    ownAssetsDateRange,
    expandedMonths,
  ])
  const { nodes, edges, canvasW, canvasH } = useMemo(() => layoutTree(campaignTree), [campaignTree])
  const nodeMetaById = useMemo(() => collectNodeMeta(campaignTree), [campaignTree])

  const [transform, setTransform] = useState<CanvasTransform>({ x: 0, y: 0, scale: 0.85 })
  const [hoveredBranchId, setHoveredBranchId] = useState<string | null>(null)
  const [hasCentered, setHasCentered] = useState(false)
  const [dragPositions, setDragPositions] = useState<Record<string, Pt>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragState = useRef<{ id: string; startClientX: number; startClientY: number; startCenter: Pt } | null>(null)
  // Center the tree in the viewport on first mount, once we know the
  // container's actual size (tree width varies with mock-data shape).
  useLayoutEffect(() => {
    if (hasCentered) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const scale = 0.85
    const x = rect.width / 2 - (canvasW / 2) * scale
    const y = 24
    setTransform({ x, y, scale })
    setHasCentered(true)
  }, [canvasW, hasCentered])

  const pan = useCallback((dx: number, dy: number) => {
    setTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }))
  }, [])

  const zoom = useCallback((delta: number, originX: number, originY: number) => {
    setTransform((t) => {
      const factor = delta > 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, t.scale * factor))
      const canvasX = (originX - t.x) / t.scale
      const canvasY = (originY - t.y) / t.scale
      return { scale: newScale, x: originX - canvasX * newScale, y: originY - canvasY * newScale }
    })
  }, [])

  const resetView = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect()
    const scale = 0.85
    const x = (rect?.width ?? 1200) / 2 - (canvasW / 2) * scale
    setTransform({ x, y: 24, scale })
  }, [canvasW])

  const panState = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false,
    lastX: 0,
    lastY: 0,
  })

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    panState.current = { active: true, lastX: e.clientX, lastY: e.clientY }
  }, [])

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!panState.current.active) return
      const dx = e.clientX - panState.current.lastX
      const dy = e.clientY - panState.current.lastY
      panState.current.lastX = e.clientX
      panState.current.lastY = e.clientY
      pan(dx, dy)
    },
    [pan]
  )

  const handlePointerUp = useCallback(() => {
    panState.current.active = false
  }, [])


  const handleNodePointerDown = useCallback(
    (e: React.PointerEvent, node: PositionedNode) => {
      e.stopPropagation()
      dragState.current = { id: node.id, startClientX: e.clientX, startClientY: e.clientY, startCenter: dragPositions[node.id] ?? node.center }
      setDraggingId(node.id)
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [dragPositions]
  )
  const handleNodePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragState.current
      if (!drag) return
      e.stopPropagation()
      const dx = (e.clientX - drag.startClientX) / transform.scale
      const dy = (e.clientY - drag.startClientY) / transform.scale
      setDragPositions((prev) => ({ ...prev, [drag.id]: { x: drag.startCenter.x + dx, y: drag.startCenter.y + dy } }))
    },
    [transform.scale]
  )
  const handleNodePointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    dragState.current = null
    setDraggingId(null)
  }, [])

  // Phase 1: Show More toggle. Plain onClick, intentionally not wired
  // through handleNodePointerDown/Move/Up (that's the drag system — Show
  // More nodes never receive those handlers, see render block below).
  const handleShowMoreClick = useCallback((showMoreId: string) => {
    if (showMoreId === 'showmore:own_assets') {
      setOwnAssetsExpanded((prev) => !prev)
      return
    }
    const promoMatch = showMoreId.match(/^showmore:assets:(.+)$/)
    if (promoMatch) {
      const promotionId = promoMatch[1]
      setExpandedPromotions((prev) => ({ ...prev, [promotionId]: !prev[promotionId] }))
      return
    }
    const marketerMatch = showMoreId.match(/^showmore:promotions:(.+)$/)
    if (marketerMatch) {
      const marketerId = marketerMatch[1]
      setExpandedMarketers((prev) => ({ ...prev, [marketerId]: !prev[marketerId] }))
    }
  }, [])

  // Phase 3: generalized circle expand/collapse — one handler for Month,
  // Marketer, and Promotion circles, dispatching to the right state map by
  // kind. handleShowMoreClick below is left in place but is no longer
  // called by Marketer/Promotion/Own Assets after this patch.
  const handleClusterClick = useCallback((node: PositionedNode) => {
    if (node.kind === 'month') {
      setExpandedMonths((prev) => ({ ...prev, [node.id]: !prev[node.id] }))
    } else if (node.kind === 'marketer') {
      setExpandedMarketers((prev) => ({ ...prev, [node.id]: !prev[node.id] }))
    } else if (node.kind === 'promotion') {
      setExpandedPromotions((prev) => ({ ...prev, [node.id]: !prev[node.id] }))
    }
  }, [])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      zoom(e.deltaY > 0 ? -1 : 1, e.clientX - rect.left, e.clientY - rect.top)
    },
    [zoom]
  )

  const zoomIn = () => {
    const rect = containerRef.current?.getBoundingClientRect()
    zoom(1, (rect?.width ?? 800) / 2, (rect?.height ?? 500) / 2)
  }
  const zoomOut = () => {
    const rect = containerRef.current?.getBoundingClientRect()
    zoom(-1, (rect?.width ?? 800) / 2, (rect?.height ?? 500) / 2)
  }

  const scalePercent = Math.round(transform.scale * 100)

  // Legend = one chip per top-level lane (Content, Own Assets, each Marketer).
  const legendItems = useMemo(
    () => [
      { branchId: 'content', label: 'Content', color: '#0ea5e9' },
      { branchId: 'own_assets', label: 'Own Assets', color: '#10b981' },
      { branchId: 'marketer_a', label: 'Marketer A', color: MARKETER_A },
      { branchId: 'marketer_b', label: 'Marketer B', color: MARKETER_B },
      { branchId: 'marketer_c', label: 'Marketer C', color: MARKETER_C },
    ],
    []
  )

  const liveNodes = nodes.map((n) => ({ ...n, center: dragPositions[n.id] ?? n.center }))
  const liveNodeById = new Map(liveNodes.map((n) => [n.id, n]))

  // Phase 3: the same anchored search+date chip Content already had, now
  // parameterized so any top-level branch id can get one — still exactly
  // one chip per branch, anchored to that branch node's live screen
  // position, same math as before.
  const renderBranchFilterChip = (
    branchId: string,
    search: string,
    setSearch: (v: string) => void,
    placeholder: string,
    dateRange: DateRangeValue,
    setDateRange: (v: DateRangeValue) => void,
  ) => {
    const branchNode = liveNodes.find((n) => n.id === branchId)
    if (!branchNode) return null
    const anchorLeft = transform.x + branchNode.center.x * transform.scale + (branchNode.w / 2) * transform.scale + 12
    const anchorTop = transform.y + branchNode.center.y * transform.scale - 15
    return (
      <div key={branchId} style={{ ...styles.contentFilterAnchor, left: anchorLeft, top: anchorTop }}>
        <div style={styles.contentSearchWrap}>
          <Search size={13} color="#9ca3af" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={placeholder}
            style={styles.contentSearchInput}
          />
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as DateRangeValue)}
          style={styles.contentDateSelect}
        >
          <option value="all">All time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="year">This year</option>
        </select>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <Link to={`/campaigns/${campaignId ?? ''}`} style={styles.backLink}>
          <ArrowLeft size={14} /> Back to campaign
        </Link>
        <div style={styles.titleBlock}>
          <span style={styles.title}>Campaign Structure Map</span>
          <span style={styles.subtitle}>{currentCampaignName ?? campaignId ?? 'Untitled Campaign'}</span>
        </div>
        <span style={styles.phaseBadge}>
          <Sparkles size={12} /> Structure preview — static mock data, not connected to live data
        </span>
               <button
          type="button"
          onClick={() => setShowThumbnails((prev) => !prev)}
          style={{
            ...styles.legendChip,
            borderColor: showThumbnails ? '#6366f1' : '#e5e7eb',
            background: showThumbnails ? '#6366f10f' : '#ffffff',
            color: showThumbnails ? '#6366f1' : '#374151',
          }}
        >
          Thumbnails: {showThumbnails ? 'On' : 'Off'}
        </button>
        <div style={styles.campaignSwitcherWrap}>
          <select
            value={campaignId ?? ''}
            onChange={(e) => navigate(`/marketplace/campaigns/${e.target.value}/structure`)}
            style={styles.campaignSwitcher}
          >
            {campaignId && !campaignOptions.some((c) => c.id === campaignId) && (
              <option value={campaignId}>{currentCampaignName ?? 'Untitled Campaign'}</option>
            )}
            {campaignOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.campaign_name}
              </option>
            ))}
          </select>
          <ChevronDown size={12} style={styles.campaignSwitcherIcon} />
        </div>
      </div>

      <div
        ref={containerRef}
        style={styles.canvasContainer}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      >
        {!isRealDataReady && (
          <div style={styles.fullMapLoading}>
            {isRealDataError ? (
              <span style={styles.fullMapLoadingText}>
                Couldn't load real campaign data. Try refreshing the page.
              </span>
            ) : (
              <>
                <Loader2 size={22} className="animate-spin" color="#6366f1" />
                <span style={styles.fullMapLoadingText}>Loading campaign structure…</span>
              </>
            )}
          </div>
        )}

        <CanvasGrid transform={transform} />

        <div
          style={{
            ...styles.canvasLayer,
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: '0 0',
          }}
        >
          <svg style={{ ...styles.edgesLayer, width: canvasW, height: canvasH }}>
            <defs>
              {legendItems.map((item) => (
                <marker
                  key={item.branchId}
                  id={`arrow-${item.branchId}`}
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L6,3 L0,6 Z" fill={item.color} />
                </marker>
              ))}
              <marker id="arrow-default" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill="#9ca3af" />
              </marker>
            </defs>

                        {edges.map((e, i) => {
              const parent = liveNodeById.get(e.fromId)!
              const child = liveNodeById.get(e.toId)!
              const from = { x: parent.center.x, y: parent.center.y + parent.h / 2 }
              const to = { x: child.center.x, y: child.center.y - child.h / 2 }
              const dimmed = hoveredBranchId !== null && hoveredBranchId !== e.branchId
              const hasMarker = legendItems.some((l) => l.branchId === e.branchId)
              return (
                <path
                  key={i}
                  d={curvePath(from, to)}
                  fill="none"
                  stroke={e.color}
                  strokeWidth={dimmed ? 1.4 : 2}
                  strokeOpacity={dimmed ? 0.18 : 0.55}
                  markerEnd={`url(#${hasMarker ? `arrow-${e.branchId}` : 'arrow-default'})`}
                  style={{ transition: 'stroke-opacity 150ms ease, stroke-width 150ms ease' }}
                />
              )
            })}
          </svg>

          {liveNodes.map((node) => {
            const dimmed = hoveredBranchId !== null && hoveredBranchId !== node.branchId
            const isRoot = node.kind === 'campaign'
            const isDragging = draggingId === node.id
            const meta = nodeMetaById.get(node.id)
            const isShowMore = !!meta?.isShowMore
            const thumbnailUrl =
              showThumbnails && !isShowMore && (node.kind === 'asset' || node.kind === 'video')
                ? meta?.thumbnailUrl
                : null

            // Phase 1: Show More is a control, not a draggable data node — no
            // onPointerDown/Move/Up (the drag system) is attached to it, and
            // it gets a plain onClick toggle instead.
            if (isShowMore) {
              return (
                <div
                  key={node.id}
                  role="button"
                  onClick={() => handleShowMoreClick(node.id)}
                  style={{
                    ...styles.showMoreNode,
                    left: node.center.x - node.w / 2,
                    top: node.center.y - node.h / 2,
                    width: node.w,
                    height: node.h,
                    borderColor: `${node.color}66`,
                    opacity: dimmed ? 0.35 : 1,
                  }}
                >
                  <span style={{ ...styles.showMoreLabel, color: node.color }}>{node.label}</span>
                </div>
              )
            }

            // Phase 2: Content month circle — a clickable cluster/container,
            // not a draggable data node, same treatment as Show More above.
            if (node.kind === 'month' || node.kind === 'marketer' || node.kind === 'promotion') {
              const isExpanded =
                node.kind === 'month'
                  ? !!expandedMonths[node.id]
                  : node.kind === 'marketer'
                  ? !!expandedMarketers[node.id]
                  : !!expandedPromotions[node.id]
              return (
                <div
                  key={node.id}
                  role="button"
                  onClick={() => handleClusterClick(node)}
                  onMouseEnter={() => setHoveredBranchId(node.branchId)}
                  onMouseLeave={() => setHoveredBranchId(null)}
                  style={{
                    ...styles.monthNode,
                    left: node.center.x - node.w / 2,
                    top: node.center.y - node.h / 2,
                    width: node.w,
                    height: node.h,
                    borderColor: node.color,
                    opacity: dimmed ? 0.35 : 1,
                  }}
                >
                  <span style={styles.monthLabel}>{node.label}</span>
                  <span style={{ ...styles.monthSubtitle, color: node.color }}>{meta?.subtitle ?? ''}</span>
                  {isExpanded ? (
                    <ChevronUp size={13} color={node.color} />
                  ) : (
                    <ChevronDown size={13} color={node.color} />
                  )}
                </div>
              )
            }

            return (
              <div
                key={node.id}
                onMouseEnter={() => setHoveredBranchId(node.branchId)}
                onMouseLeave={() => setHoveredBranchId(null)}
                onPointerDown={(e) => handleNodePointerDown(e, node)}
                onPointerMove={handleNodePointerMove}
                onPointerUp={handleNodePointerUp}
                style={{
                  ...(isRoot
                    ? styles.rootNode
                    : node.kind === 'asset' || node.kind === 'video'
                    ? styles.assetNode
                    : styles.cardNode),
                  left: node.center.x - node.w / 2,
                  top: node.center.y - node.h / 2,
                  width: node.w,
                  height: node.h,
                  borderColor:
                    isRoot ? 'transparent' : node.kind === 'asset' || node.kind === 'video' ? `${node.color}66` : node.color,
                  boxShadow: isRoot
                    ? '0 12px 28px rgba(17,24,39,0.25)'
                    : node.kind === 'asset' || node.kind === 'video'
                    ? '0 2px 6px rgba(15,23,42,0.04)'
                    : `0 0 0 2px ${node.color}1f, 0 4px 10px rgba(15,23,42,0.06)`,
                                    opacity: dimmed ? 0.35 : 1,
                  cursor: isDragging ? 'grabbing' : 'grab',
                  zIndex: isDragging ? 10 : 1,
                  touchAction: 'none',
                }}
              >
                {!isRoot && thumbnailUrl && (
                  <img src={thumbnailUrl} alt="" style={styles.nodeThumbnail} draggable={false} />
                )}
                {!isRoot && !thumbnailUrl && <span style={{ ...styles.nodeDot, background: node.color }} />}
                <div style={styles.nodeTextCol}>
                  <span style={isRoot ? styles.nodeLabelRoot : styles.nodeLabelCard}>{node.label}</span>
                  {!isRoot && (
                    <span style={{ ...styles.nodeKind, color: node.color }}>{NODE_KIND_LABEL[node.kind]}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        {renderBranchFilterChip('content', contentSearch, setContentSearch, 'Search content videos...', contentDateRange, setContentDateRange)}
        {renderBranchFilterChip('marketers', marketersSearch, setMarketersSearch, 'Search promotions...', marketersDateRange, setMarketersDateRange)}
        {renderBranchFilterChip('own_assets', ownAssetsSearch, setOwnAssetsSearch, 'Search assets...', ownAssetsDateRange, setOwnAssetsDateRange)}
        {/* Legend */}
        <div style={styles.legend}>
          {legendItems.map((item) => {
            const active = hoveredBranchId === item.branchId
            return (
              <button
                key={item.branchId}
                style={{
                  ...styles.legendChip,
                  borderColor: active ? item.color : '#e5e7eb',
                  background: active ? `${item.color}0f` : '#ffffff',
                }}
                onMouseEnter={() => setHoveredBranchId(item.branchId)}
                onMouseLeave={() => setHoveredBranchId(null)}
              >
                <Network size={12} color={item.color} />
                <span style={{ color: active ? item.color : '#374151' }}>{item.label}</span>
              </button>
            )
          })}
        </div>

        <div style={styles.zoomControls}>
          <button style={styles.zoomBtn} onClick={zoomIn} title="Zoom in">
            +
          </button>
          <span style={styles.zoomLabel}>{scalePercent}%</span>
          <button style={styles.zoomBtn} onClick={zoomOut} title="Zoom out">
            −
          </button>
          <button
            style={{ ...styles.zoomBtn, borderLeft: '1px solid #e5e7eb', marginLeft: 2, paddingLeft: 6 }}
            onClick={resetView}
            title="Reset view"
          >
            ⌂
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    position: 'fixed',
    inset: 0,
    top: 56,
    display: 'flex',
    flexDirection: 'column',
    background: '#ffffff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '14px 20px',
    borderBottom: '1px solid #e5e7eb',
    flexShrink: 0,
    background: '#ffffff',
  },
  backLink: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: '#6b7280',
    textDecoration: 'none',
    flexShrink: 0,
  },
  titleBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
  },
  subtitle: {
    fontSize: 11,
    color: '#9ca3af',
  },
  phaseBadge: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11,
    fontWeight: 600,
    color: '#92400e',
    background: '#fffbeb',
    border: '1px solid #fde68a',
    borderRadius: 999,
    padding: '5px 10px',
    whiteSpace: 'nowrap',
  },
  // Phase 2: Content search + date-range filter, in the header toolbar
  // (global controls, alongside the existing Thumbnails toggle) rather than
  // drawn on the pan/zoom canvas itself.
    contentFilterAnchor: {
    position: 'absolute',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    pointerEvents: 'auto',
  },
  contentSearchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '0 10px',
    height: 30,
    flexShrink: 0,
  },
  contentSearchInput: {
    border: 'none',
    outline: 'none',
    fontSize: 12,
    color: '#111827',
    width: 140,
    background: 'transparent',
  },
  contentDateSelect: {
    appearance: 'none',
    fontSize: 11,
    fontWeight: 600,
    color: '#374151',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '6px 10px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  fullMapLoading: {
    position: 'absolute',
    inset: 0,
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    background: '#ffffff',
  },
  fullMapLoadingText: {
    fontSize: 13,
    fontWeight: 600,
    color: '#4b5563',
  },
  campaignSwitcherWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  campaignSwitcher: {
    appearance: 'none',
    fontSize: 11,
    fontWeight: 600,
    color: '#111827',
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '6px 26px 6px 10px',
    cursor: 'pointer',
    maxWidth: 180,
  },
  campaignSwitcherIcon: {
    position: 'absolute',
    right: 8,
    color: '#9ca3af',
    pointerEvents: 'none',
  },
  canvasContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    cursor: 'grab',
    userSelect: 'none',
    background: '#ffffff',
    touchAction: 'none',
  },
  canvasLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  },
  edgesLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'visible',
    pointerEvents: 'none',
  },
  rootNode: {
    position: 'absolute',
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 20px',
    textAlign: 'center',
    background: 'linear-gradient(160deg, #111827 0%, #312e81 100%)',
    color: '#ffffff',
    cursor: 'default',
    border: '1.5px solid transparent',
  },
  cardNode: {
    position: 'absolute',
    background: '#ffffff',
    border: '1.5px solid',
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 14px',
    cursor: 'default',
  },
  assetNode: {
    position: 'absolute',
    background: '#fafafa',
    border: '1.5px dashed',
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    padding: '0 12px',
    cursor: 'default',
  },
  // Phase 2: Content month-cluster circle. Square NODE_SIZE + 50% radius
  // makes this a true circle, unlike every other (rounded-rect) node.
  monthNode: {
    position: 'absolute',
    borderRadius: '50%',
    background: '#ffffff',
    border: '2px solid',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    textAlign: 'center',
    padding: '0 10px',
    cursor: 'pointer',
  },
  monthLabel: {
    fontSize: 12.5,
    fontWeight: 700,
    color: '#111827',
  },
  monthSubtitle: {
    fontSize: 10.5,
    fontWeight: 600,
  },
  nodeDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
  },
  nodeThumbnail: {
    width: 26,
    height: 26,
    borderRadius: 5,
    objectFit: 'cover',
    flexShrink: 0,
  },
  showMoreNode: {
    position: 'absolute',
    background: '#fafafa',
    border: '1.5px dashed',
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 12px',
    cursor: 'pointer',
  },
  showMoreLabel: {
    fontSize: 11.5,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  nodeTextCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  nodeLabelRoot: {
    fontSize: 14,
    fontWeight: 700,
    color: '#ffffff',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  nodeLabelCard: {
    fontSize: 12.5,
    fontWeight: 700,
    color: '#111827',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  nodeKind: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  legend: {
    position: 'absolute',
    top: 16,
    left: 16,
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    maxWidth: 360,
  },
  legendChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 11.5,
    fontWeight: 600,
    border: '1px solid #e5e7eb',
    borderRadius: 999,
    padding: '6px 11px',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
    transition: 'background 150ms ease, border-color 150ms ease',
  },
  zoomControls: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    padding: '4px 6px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  zoomBtn: {
    background: 'transparent',
    border: 'none',
    color: '#374151',
    fontSize: 16,
    cursor: 'pointer',
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    lineHeight: 1,
  },
  zoomLabel: {
    fontSize: 11,
    color: '#6b7280',
    minWidth: 36,
    textAlign: 'center',
  },
}


// ─── Embedded Export Wrapper ──────────────────────────────────────────────────
export interface EmbeddedMapProps {
  embedded?: boolean;
}

export function EmbeddedCampaignStructureMap({ embedded = false }: EmbeddedMapProps) {
  return (
    <div
      style={{
        position: embedded ? 'absolute' : 'fixed',
        inset: 0,
        top: embedded ? 0 : 56,
        overflow: 'hidden',
      }}
    >
      {embedded && (
        <style>{`
          .embedded-map-container header,
          div[style*="borderBottom: 1px solid"],
          div[style*="border-bottom"] {
            display: none !important;
          }
        `}</style>
      )}
      <div className={embedded ? 'embedded-map-container' : ''} style={{ width: '100%', height: '100%' }}>
        <CampaignStructureMap />
      </div>
    </div>
  );
}
