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
// This file adds exactly that one missing lookup. For every graph node with
// no outgoing GraphEdge (a "terminal" video node per journeyGraph.ts), it
// resolves the redirect link(s) actually observed on that node into a
// downstream node, using only real, existing data:
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
  asset_id: string | null
  campaign_id: string | null
  link_type: string | null
}

type CampaignElementAssetRow = {
  asset_id: string
  campaign_id: string
  element_type: string
}

export async function resolveDownstreamNodes(graph: JourneyGraph): Promise<DownstreamResolution> {
  // Terminal = no observed outgoing edge in the observed video->video graph
  // journeyGraph.ts already built. Only these are candidates — a node with
  // a real outgoing edge already has its next step represented there.
  const hasOutgoing = new Set(graph.edges.map((e) => e.fromVideoId))
  const terminalNodes = graph.nodes.filter((n) => !hasOutgoing.has(n.videoId))

  // A terminal node can carry more than one observed redirect link (the same
  // video's terminal step was reached via different redirect links across
  // different discovered journeys) — each is resolved independently, none
  // assumed equivalent.
  const redirectLinkTasks: { videoId: string; redirectLinkId: string }[] = []
  for (const n of terminalNodes) {
    for (const rl of n.observedRedirectLinkIds) {
      redirectLinkTasks.push({ videoId: n.videoId, redirectLinkId: rl })
    }
  }
  if (redirectLinkTasks.length === 0) return { nodes: [], edges: [] }

  const redirectLinkIds = Array.from(new Set(redirectLinkTasks.map((t) => t.redirectLinkId)))
  const { data: redirectLinks, error: rlError } = await supabase
    .from('redirect_links')
    .select('id, asset_id, campaign_id, link_type')
    .in('id', redirectLinkIds)

  if (rlError) {
    throw new Error(`journeyDownstreamResolver.ts: redirect_links query failed — ${rlError.message}`)
  }

  const redirectLinkById = new Map(((redirectLinks ?? []) as RedirectLinkRow[]).map((r) => [r.id, r]))

  // Composite-key lookup — asset_id + campaign_id together, never asset_id
  // alone (journeyAnalyticsEngine.ts locked scope §6). Only queried for
  // redirect links that actually carry both fields.
  const compositeCandidates = Array.from(redirectLinkById.values()).filter(
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

  for (const { videoId, redirectLinkId } of redirectLinkTasks) {
    const link = redirectLinkById.get(redirectLinkId)
    if (!link) continue // real redirect_links row not found — nothing to resolve, nothing invented

    const nodeId = `redirect:${redirectLinkId}`
    if (seenNodeIds.has(nodeId)) {
      edges.push({ fromVideoId: videoId, toNodeId: nodeId })
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
    // observed data on the redirect link that was actually used, not an
    // inference from anywhere else.
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
      redirectLinkId,
      sourceVideoId: videoId,
    })
    seenNodeIds.add(nodeId)
    edges.push({ fromVideoId: videoId, toNodeId: nodeId })
  }

  return { nodes, edges }
}
