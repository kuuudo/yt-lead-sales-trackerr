// ─────────────────────────────────────────────────────────────────────────────
// src/services/journey/journeyDownstreamResolver.ts
//
// PURPOSE: journeyGraph.ts only connects two steps that appear as literal
// consecutive entries in an observed JourneyPath.steps array — by design
// (see its file header: "does NOT invent edges"). That means a step whose
// real-world next destination was a non-video page (a campaign element like
// Newsletter, or an imported resource) never gets a second snapshot entry —
// journey_snapshot simply ends there, with destination_video_id: null.
// journeyGraph.ts therefore renders that step as a dead-end video node, even
// though the step's own redirectLinkId already tells us — via the real
// redirect_links row — what it actually led to.
//
// This file adds exactly that one missing lookup, via TWO entry points that
// share one resolution core (resolveLinksToDownstream):
//   - resolveDownstreamNodes(graph): from an observed JourneyGraph (STEP 3).
//     Requires events_journey traffic to exist.
//   - resolveDownstreamForVideoIds(videoIds, promotionId): directly from a
//     promoted asset's own video_id (STEP 4, 2026-09-15). No events_journey
//     involved — a promoted asset's downstream is a deterministic property
//     of its own redirect_links rows, present the moment those links are
//     generated, independent of whether anyone has clicked them yet.
// Both use only real, existing data:
//   - redirect_links (asset_id, campaign_id, link_type — all real columns)
//   - resolveAssetType.ts (existing, unmodified)
//   - campaign_element_assets, via the composite (asset_id, campaign_id) key
//     — the exact rule documented in journeyAnalyticsEngine.ts's locked
//     scope §6, reimplemented here (not exported there) because that file is
//     explicitly off-limits to modify.
//
// NO CONVERSION DATA (pixel_purchases / stripe_purchases) IS READ OR
// REQUIRED. Per 2026-09-15 direction: the structural graph must not depend
// on whether anyone converted. Conversion/revenue annotation is a distinct,
// separate follow-up layered on top of these nodes, not implemented here.
//
// EXPLICITLY NOT ATTEMPTED — flagged, not guessed:
//   - Recursing into ANOTHER video when a terminal step's redirect link
//     resolves to a video-type asset. By construction, journey_snapshot
//     already represents observed video->video hops via destination_video_id
//     (see journeyGraph.ts) — a terminal step (destination_video_id === null)
//     whose redirect link nonetheless resolves to a video asset would be a
//     genuine schema anomaly, not the normal path. Mapping an `assets.id`
//     (asset_type: 'video') back to the `videos`/journey `video_id` space to
//     continue traversal would require a join I have not seen confirmed
//     anywhere in the available files — so this case is skipped, not guessed.
//   - Inventing a node when nothing real resolves (asset_id null AND
//     link_type null, or the redirect_links row itself isn't found). Skipped,
//     not defaulted to a placeholder.
//
// USES, DOES NOT MODIFY: journeyGraph.ts's JourneyGraph / GraphNode /
// GraphEdge shapes, resolveAssetType.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '../../lib/supabase'
import type { JourneyGraph } from './journeyGraph'
import { resolveAssetType } from '../asset/resolveAssetType'

export type DownstreamNodeKind = 'campaign_element' | 'resource'

export interface DownstreamNode {
  // Synthetic id — there is no single real-world id guaranteed to exist for
  // this node (asset_id can be null, see file header), so the id is scoped
  // to the redirect link that produced it. Stable across reloads since
  // redirect_link ids are stable.
  id: string
  kind: DownstreamNodeKind
  // The real element_type / link_type string — e.g. 'newsletter',
  // 'sales_call', 'landing_page', 'consultation'. Never invented: either
  // read from campaign_element_assets.element_type (composite key match) or
  // copied verbatim from redirect_links.link_type.
  elementType: string | null
  // Which real field produced elementType — surfaced so the UI can show
  // "resolved from a real asset row" separately from "inferred from the
  // link's link_type because asset_id was null on this redirect link."
  resolvedFrom: 'asset' | 'link_type'
  assetId: string | null
  redirectLinkId: string
  sourceVideoId: string
}

export interface DownstreamEdge {
  fromVideoId: string
  toNodeId: string
}

export interface DownstreamResolution {
  nodes: DownstreamNode[]
  edges: DownstreamEdge[]
}

type RedirectLinkRow = {
  id: string
  video_id: string
  asset_id: string | null
  campaign_id: string | null
  link_type: string | null
}

type CampaignElementAssetRow = {
  asset_id: string
  campaign_id: string
  element_type: string
}

// ── Shared core (STEP 4 refactor) ───────────────────────────────────────────
// Both entry points below end up with the same thing: a list of real
// redirect_links rows to resolve into downstream nodes/edges. This is that
// one shared resolution — the composite-key lookup, the link_type fallback,
// the "skip, don't invent" rules — written once, used by both.
async function resolveLinksToDownstream(links: RedirectLinkRow[]): Promise<DownstreamResolution> {
  if (links.length === 0) return { nodes: [], edges: [] }

  // Composite-key lookup — asset_id + campaign_id together, never asset_id
  // alone (journeyAnalyticsEngine.ts locked scope §6). Only queried for
  // redirect links that actually carry both fields.
  const compositeCandidates = links.filter(
    (r): r is RedirectLinkRow & { asset_id: string; campaign_id: string } => !!r.asset_id && !!r.campaign_id,
  )

  let elementTypeByCompositeKey = new Map<string, string>()
  if (compositeCandidates.length > 0) {
    const assetIds = Array.from(new Set(compositeCandidates.map((r) => r.asset_id)))
    const { data: elementAssets, error: ceaError } = await supabase
      .from('campaign_element_assets')
      .select('asset_id, campaign_id, element_type')
      .in('asset_id', assetIds)

    if (ceaError) {
      throw new Error(`journeyDownstreamResolver.ts: campaign_element_assets query failed — ${ceaError.message}`)
    }

    elementTypeByCompositeKey = new Map(
      ((elementAssets ?? []) as CampaignElementAssetRow[]).map((r) => [`${r.asset_id}::${r.campaign_id}`, r.element_type]),
    )
  }

  const nodes: DownstreamNode[] = []
  const edges: DownstreamEdge[] = []
  const seenNodeIds = new Set<string>()

  for (const link of links) {
    const nodeId = `redirect:${link.id}`
    if (seenNodeIds.has(nodeId)) {
      edges.push({ fromVideoId: link.video_id, toNodeId: nodeId })
      continue
    }

    let kind: DownstreamNodeKind | null = null
    let elementType: string | null = null
    let resolvedFrom: DownstreamNode['resolvedFrom'] | null = null

    if (link.asset_id) {
      const resolved = await resolveAssetType(link.asset_id)
      if (resolved?.assetType === 'campaign_element') {
        const key = link.campaign_id ? `${link.asset_id}::${link.campaign_id}` : ''
        kind = 'campaign_element'
        elementType = key ? elementTypeByCompositeKey.get(key) ?? null : null
        resolvedFrom = 'asset'
      } else if (resolved?.assetType === 'resource') {
        kind = 'resource'
        resolvedFrom = 'asset'
      } else if (resolved?.assetType === 'video') {
        // See file header — flagged, not expanded.
        continue
      }
    }

    // asset_id was null, or didn't resolve to anything usable — fall back to
    // the redirect link's own link_type, which is NOT NULL on the real table
    // (per journeyAnalyticsEngine.ts's JourneyRedirectLinkRow) and is real,
    // observed data on the redirect link itself, not an inference from
    // anywhere else.
    if (!resolvedFrom && link.link_type) {
      kind = 'campaign_element'
      elementType = link.link_type
      resolvedFrom = 'link_type'
    }

    if (!kind || !resolvedFrom) continue // nothing real to show — don't invent a node

    nodes.push({
      id: nodeId,
      kind,
      elementType,
      resolvedFrom,
      assetId: link.asset_id,
      redirectLinkId: link.id,
      sourceVideoId: link.video_id,
    })
    seenNodeIds.add(nodeId)
    edges.push({ fromVideoId: link.video_id, toNodeId: nodeId })
  }

  return { nodes, edges }
}

// ── Entry point 1 (existing, STEP 3) — from an observed JourneyGraph ───────
// Resolves the redirect link(s) actually observed on a terminal video step.
// Requires an events_journey-derived JourneyGraph as input; returns nothing
// for a promotion with no observed traffic.
export async function resolveDownstreamNodes(graph: JourneyGraph): Promise<DownstreamResolution> {
  // Terminal = no observed outgoing edge in the observed video->video graph
  // journeyGraph.ts already built. Only these are candidates — a node with
  // a real outgoing edge already has its next step represented there.
  const hasOutgoing = new Set(graph.edges.map((e) => e.fromVideoId))
  const terminalNodes = graph.nodes.filter((n) => !hasOutgoing.has(n.videoId))

  const redirectLinkIds = Array.from(
    new Set(terminalNodes.flatMap((n) => n.observedRedirectLinkIds)),
  )
  if (redirectLinkIds.length === 0) return { nodes: [], edges: [] }

  const { data: redirectLinks, error: rlError } = await supabase
    .from('redirect_links')
    .select('id, video_id, asset_id, campaign_id, link_type')
    .in('id', redirectLinkIds)

  if (rlError) {
    throw new Error(`journeyDownstreamResolver.ts: redirect_links query failed — ${rlError.message}`)
  }

  return resolveLinksToDownstream((redirectLinks ?? []) as RedirectLinkRow[])
}

// ── Entry point 2 (new, STEP 4) — directly from a promoted asset's video ───
// No events_journey involved, no observed-traffic prerequisite. A promoted
// asset's downstream is a deterministic property of its own redirect_links
// rows, present the moment those links are generated. Scoped to this
// promotion's own redirect_links (a video can be promoted under more than
// one promotion, each generating its own links — see conversation
// 2026-09-15) — never scoped to campaign_id/asset_id alone.
//
// Video-type promoted assets only, by construction: a campaign_element or
// resource asset has no corresponding `videos` row (see getAssetDetail.ts's
// resolveAssetResource — it queries asset_resources / campaign_element_assets
// for those, never videos), so it has no video_id for redirect_links.video_id
// to reference in the first place. Not a limitation added here — a property
// of the schema.
export async function resolveDownstreamForVideoIds(
  videoIds: string[],
  promotionId: string,
): Promise<DownstreamResolution> {
  if (videoIds.length === 0) return { nodes: [], edges: [] }

  const { data: redirectLinks, error: rlError } = await supabase
    .from('redirect_links')
    .select('id, video_id, asset_id, campaign_id, link_type')
    .in('video_id', videoIds)
    .eq('promotion_id', promotionId)

  if (rlError) {
    throw new Error(`journeyDownstreamResolver.ts: redirect_links (by video_id) query failed — ${rlError.message}`)
  }

  return resolveLinksToDownstream((redirectLinks ?? []) as RedirectLinkRow[])
}
