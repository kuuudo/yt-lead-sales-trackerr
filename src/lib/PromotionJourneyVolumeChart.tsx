// ─────────────────────────────────────────────────────────────────────────────
// PromotionJourneyVolumeChart.tsx
//
// PURPOSE: A SEPARATE analytics panel that renders observed transition
// volume as a VERTICAL BAR (column) chart, grouped by promoted asset.
// It sits below the Miro-like Journey Map and does not participate in it.
// The map answers "what is the shape of the journey"; this answers
// "how much volume went through each hop."
//
// DATA SOURCE — graph.edges ONLY (journeyGraph.ts's buildJourneyGraph
// output, passed in as a prop). This component:
//   - makes NO database query of any kind (no supabase import at all),
//   - does NOT read events_journey, journey_snapshot, attribution,
//     conversions or revenue,
//   - does NOT read the downstream resolver's edges. A structural
//     Video -> Newsletter edge has no observed journey count and must
//     never be given a fake one, so it simply is not an input here.
//
// COUNT SEMANTICS: the displayed number is edge.journeyIds.length —
// the number of DISTINCT journeys in which that adjacency was observed.
// NOT edge.observedCount, which increments per occurrence and therefore
// double-counts a journey that loops back over the same pair within its
// own steps array. The two are equal for non-looping journeys; where they
// differ, journeyIds.length is the honest "how many journeys" answer.
//
// DISPLAY RESOLUTION: reuses the maps the map page already built
// (videoDisplayByVideoId from `videos`, assetDisplayByAssetId, and
// allPromotedNodes). Same three-step fallback as the map's graph cards.
// No new thumbnail system.
//
// GROUPING (audit option (a) — shared edges appear in BOTH sections):
// for each promoted asset, find its entry videoId, then walk forward
// through graph.edges collecting every reachable edge. If two assets
// converge on the same video, the edges past that junction legitimately
// belong to both and are shown under both — real observed volume is never
// silently dropped to force a one-asset-per-edge partition. Any edge no
// promoted asset can reach lands in a trailing "Not linked to a promoted
// asset" section, so every edge in graph.edges appears at least once.
//
// BAR HEIGHT NORMALIZATION: bar height is NOT linearly proportional to
// the raw count. Customers differ by orders of magnitude (4 journeys vs
// 4,000), and a linear scale would make small-but-real transitions
// invisible while a single large one blows out the chart. Heights are
// therefore log-compressed within each section and floored at a minimum
// visible fraction. The NUMBER shown is always the true, unmodified
// count — the normalization touches pixels only, never the value.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { JourneyGraph, GraphEdge } from '../lib/journeyGraph'

// ═══════════════════════════════════════════════════════════════════════════
// Props — every one of these is state the map page has already resolved.
// Nothing here is fetched.
// ═══════════════════════════════════════════════════════════════════════════

interface PromotedAssetLike {
  assetId: string
  title: string
  thumbnailSrc: string | null
}

export interface PromotionJourneyVolumeChartProps {
  graph: JourneyGraph | null
  graphLoading: boolean
  graphError: string | null
  /** videos-table display, keyed by journey videoId. Built by the map's STEP 8 effect. */
  videoDisplayByVideoId: Map<string, { title: string; thumbnailUrl: string }>
  /** Asset-resolver display for non-video graph nodes. Built by the map's STEP 8 effect. */
  assetDisplayByAssetId: Map<string, { title: string; thumbnailUrl: string | null }>
  /** Promoted assets already on the canvas (gold column + creative ring). */
  allPromotedNodes: PromotedAssetLike[]
  /** assetId -> videos.id, resolved by the map's STEP 4 effect. */
  promotedAssetVideoIds: Map<string, string>
}

// ═══════════════════════════════════════════════════════════════════════════
// Layout + normalization constants
// ═══════════════════════════════════════════════════════════════════════════

const PLOT_HEIGHT = 132
// Every non-zero transition must be clearly visible. 0.2 of the plot is
// ~26px — unmistakably a bar, never a sliver, even when the same section
// also contains a 4,000-journey column.
const MIN_BAR_FRACTION = 0.2
const BAR_WIDTH = 46
const COLUMN_WIDTH = 104
const COLUMN_GAP = 12

/**
 * Log-compressed height fraction, floored so small counts stay readable.
 *
 * Linear would give 4 / 4000 = 0.001 of the plot — invisible. Log gives
 * ln(5)/ln(4001) ≈ 0.19, which after the floor lands around a third of
 * the plot: clearly smaller than the 4,000 bar, clearly still a bar.
 *
 * Scale is PER SECTION — the bar communicates relative volume within the
 * asset being looked at, which is what a reader actually compares. The
 * numeric label carries the absolute value across sections.
 */
function barHeightFraction(count: number, sectionMax: number): number {
  if (count <= 0) return 0
  if (sectionMax <= 0) return MIN_BAR_FRACTION
  const compressed = Math.log(count + 1) / Math.log(sectionMax + 1)
  const clamped = Math.max(0, Math.min(1, compressed))
  return MIN_BAR_FRACTION + (1 - MIN_BAR_FRACTION) * clamped
}

function edgeKey(edge: GraphEdge): string {
  return `${edge.fromVideoId}::${edge.toVideoId}`
}

// ═══════════════════════════════════════════════════════════════════════════
// Grouping — pure functions over the already-loaded graph
// ═══════════════════════════════════════════════════════════════════════════

interface ChartSection {
  key: string
  /** Promoted asset heading, or the orphan-section label. */
  title: string
  thumbnailSrc: string | null
  isOrphanSection: boolean
  edges: GraphEdge[]
}

/**
 * Where does this promoted asset enter the observed graph?
 *
 * Two independent routes, both already resolved by the map page:
 *   1. promotedAssetVideoIds — the asset's own videos.id (video-origin
 *      promoted assets, resolved without any traffic).
 *   2. GraphNode.observedAssetIds — the identity match the map itself
 *      uses to draw its promoted-asset connector.
 * Either is sufficient; neither alone covers every case.
 */
function findEntryVideoId(
  assetId: string,
  graph: JourneyGraph,
  promotedAssetVideoIds: Map<string, string>,
): string | null {
  const knownVideoIds = new Set(graph.nodes.map((n) => n.videoId))

  const direct = promotedAssetVideoIds.get(assetId)
  if (direct && knownVideoIds.has(direct)) return direct

  const identityMatch = graph.nodes.find((n) => n.observedAssetIds.includes(assetId))
  return identityMatch ? identityMatch.videoId : null
}

/**
 * Every edge reachable forward from `entryVideoId`, in BFS order — which
 * matches the map's own left-to-right layering, so the X-axis reads
 * A→B, B→C, C→D the same way the canvas does.
 *
 * Visited-set is on NODES, so a cycle terminates. Edges are deduped per
 * section; duplication ACROSS sections is intentional (option (a)).
 */
function collectReachableEdges(entryVideoId: string, edges: GraphEdge[]): GraphEdge[] {
  const outgoing = new Map<string, GraphEdge[]>()
  for (const e of edges) {
    if (!outgoing.has(e.fromVideoId)) outgoing.set(e.fromVideoId, [])
    outgoing.get(e.fromVideoId)!.push(e)
  }

  const collected: GraphEdge[] = []
  const seenEdgeKeys = new Set<string>()
  const visitedNodes = new Set<string>([entryVideoId])
  const queue: string[] = [entryVideoId]

  while (queue.length > 0) {
    const videoId = queue.shift()!
    for (const edge of outgoing.get(videoId) ?? []) {
      const key = edgeKey(edge)
      if (!seenEdgeKeys.has(key)) {
        seenEdgeKeys.add(key)
        collected.push(edge)
      }
      if (!visitedNodes.has(edge.toVideoId)) {
        visitedNodes.add(edge.toVideoId)
        queue.push(edge.toVideoId)
      }
    }
  }

  return collected
}

function buildSections(
  graph: JourneyGraph,
  allPromotedNodes: PromotedAssetLike[],
  promotedAssetVideoIds: Map<string, string>,
): ChartSection[] {
  const sections: ChartSection[] = []
  const claimedEdgeKeys = new Set<string>()

  for (const asset of allPromotedNodes) {
    const entryVideoId = findEntryVideoId(asset.assetId, graph, promotedAssetVideoIds)
    if (!entryVideoId) continue

    const edges = collectReachableEdges(entryVideoId, graph.edges)
    if (edges.length === 0) continue // promoted, but nothing observed downstream of it yet

    for (const e of edges) claimedEdgeKeys.add(edgeKey(e))

    sections.push({
      key: `asset:${asset.assetId}`,
      title: asset.title,
      thumbnailSrc: asset.thumbnailSrc,
      isOrphanSection: false,
      edges,
    })
  }

  // Nothing is dropped: an observed transition that no promoted asset can
  // reach (a journey that began on a video this promotion doesn't promote)
  // still has real volume and still gets shown.
  const orphanEdges = graph.edges.filter((e) => !claimedEdgeKeys.has(edgeKey(e)))
  if (orphanEdges.length > 0) {
    sections.push({
      key: 'orphan',
      title: 'Not linked to a promoted asset',
      thumbnailSrc: null,
      isOrphanSection: true,
      edges: orphanEdges,
    })
  }

  return sections
}

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

export default function PromotionJourneyVolumeChart({
  graph,
  graphLoading,
  graphError,
  videoDisplayByVideoId,
  assetDisplayByAssetId,
  allPromotedNodes,
  promotedAssetVideoIds,
}: PromotionJourneyVolumeChartProps) {
  const [collapsed, setCollapsed] = useState(false)

  const sections = useMemo(() => {
    if (!graph || graph.edges.length === 0) return []
    return buildSections(graph, allPromotedNodes, promotedAssetVideoIds)
  }, [graph, allPromotedNodes, promotedAssetVideoIds])

  // Same three-step fallback the map's graph cards use (videos display ->
  // asset-resolver display -> generic label). Not a new resolution system.
  const resolveNodeDisplay = (videoId: string): { title: string; thumbnailUrl: string | null } => {
    const fromVideo = videoDisplayByVideoId.get(videoId)
    if (fromVideo) return { title: fromVideo.title, thumbnailUrl: fromVideo.thumbnailUrl }

    const node = graph?.nodes.find((n) => n.videoId === videoId)
    const assetId = node?.observedAssetIds[0]
    if (assetId) {
      const promoted = allPromotedNodes.find((n) => n.assetId === assetId)
      if (promoted) return { title: promoted.title, thumbnailUrl: promoted.thumbnailSrc }
      const fromAsset = assetDisplayByAssetId.get(assetId)
      if (fromAsset) return { title: fromAsset.title, thumbnailUrl: fromAsset.thumbnailUrl }
    }

    return { title: 'Untitled', thumbnailUrl: null }
  }

  const totalTransitions = graph?.edges.length ?? 0

  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>
        <button
          type="button"
          style={styles.collapseBtn}
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Show transition volume' : 'Hide transition volume'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <span style={styles.panelTitle}>Transition volume</span>
        {!graphLoading && !graphError && totalTransitions > 0 && (
          <span style={styles.panelCount}>
            {totalTransitions} observed transition{totalTransitions === 1 ? '' : 's'}
          </span>
        )}
        <span style={styles.panelNote}>
          Bar height is normalized for readability. Counts show actual journeys.
        </span>
      </div>

      {!collapsed && (
        <div style={styles.panelBody}>
          {graphLoading && <p style={styles.stateText}>Loading observed journeys…</p>}

          {!graphLoading && graphError && (
            <p style={{ ...styles.stateText, color: '#b91c1c' }}>
              Could not load observed journeys: {graphError}
            </p>
          )}

          {!graphLoading && !graphError && totalTransitions === 0 && (
            <p style={styles.stateText}>No observed transitions yet</p>
          )}

          {!graphLoading && !graphError && totalTransitions > 0 && sections.length === 0 && (
            <p style={styles.stateText}>
              Observed transitions exist but none could be grouped under an asset.
            </p>
          )}

          {!graphLoading &&
            !graphError &&
            sections.map((section) => {
              const counts = section.edges.map((e) => e.journeyIds.length)
              const sectionMax = counts.length > 0 ? Math.max(...counts) : 0

              return (
                <section key={section.key} style={styles.section}>
                  <div style={styles.sectionHeader}>
                    {section.thumbnailSrc ? (
                      <img src={section.thumbnailSrc} style={styles.sectionThumb} draggable={false} />
                    ) : (
                      <span
                        style={{
                          ...styles.sectionThumb,
                          background: section.isOrphanSection ? '#f3f4f6' : '#e5e7eb',
                        }}
                      />
                    )}
                    <span
                      style={{
                        ...styles.sectionTitle,
                        ...(section.isOrphanSection ? styles.sectionTitleMuted : null),
                      }}
                    >
                      {section.title}
                    </span>
                  </div>

                  <div style={styles.plotScroller}>
                    <div style={styles.plot}>
                      {section.edges.map((edge) => {
                        // THE REAL COUNT. Never normalized, never substituted.
                        const journeyCount = edge.journeyIds.length
                        const from = resolveNodeDisplay(edge.fromVideoId)
                        const to = resolveNodeDisplay(edge.toVideoId)
                        const fraction = barHeightFraction(journeyCount, sectionMax)
                        const barHeight = Math.round(PLOT_HEIGHT * fraction)
                        const isSectionMax = journeyCount === sectionMax && sectionMax > 0

                        return (
                          <div
                            key={edgeKey(edge)}
                            style={styles.column}
                            title={`${from.title} → ${to.title} · ${journeyCount} journey${
                              journeyCount === 1 ? '' : 's'
                            }`}
                          >
                            <div style={styles.barArea}>
                              <span style={styles.barValue}>{journeyCount.toLocaleString()}</span>
                              <div
                                style={{
                                  ...styles.bar,
                                  height: barHeight,
                                  background: isSectionMax
                                    ? 'linear-gradient(180deg, #6366f1, #4338ca)'
                                    : 'linear-gradient(180deg, #a5b4fc, #6366f1)',
                                }}
                              />
                            </div>
                            <div style={styles.axisLine} />
                            <div style={styles.tickLabel}>
                              <div style={styles.tickRow}>
                                {from.thumbnailUrl ? (
                                  <img src={from.thumbnailUrl} style={styles.tickThumb} draggable={false} />
                                ) : (
                                  <span style={{ ...styles.tickThumb, background: '#e5e7eb' }} />
                                )}
                                <span style={styles.tickText}>{from.title}</span>
                              </div>
                              <div style={styles.tickArrow}>↓</div>
                              <div style={styles.tickRow}>
                                {to.thumbnailUrl ? (
                                  <img src={to.thumbnailUrl} style={styles.tickThumb} draggable={false} />
                                ) : (
                                  <span style={{ ...styles.tickThumb, background: '#e5e7eb' }} />
                                )}
                                <span style={styles.tickText}>{to.title}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </section>
              )
            })}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Styles — local to this component, matching the map page's existing
// palette (#e5e7eb borders, #111827 ink, #6b7280 secondary) without
// importing or modifying its style object.
// ═══════════════════════════════════════════════════════════════════════════

const styles: Record<string, React.CSSProperties> = {
  panel: {
    flexShrink: 0,
    borderTop: '1px solid #e5e7eb',
    background: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 320,
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 14px',
    borderBottom: '1px solid #f3f4f6',
    flexShrink: 0,
  },
  collapseBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    border: 'none',
    background: 'transparent',
    color: '#6b7280',
    cursor: 'pointer',
    padding: 0,
  },
  panelTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: '#111827',
    letterSpacing: '0.02em',
  },
  panelCount: {
    fontSize: 11,
    color: '#6b7280',
  },
  panelNote: {
    marginLeft: 'auto',
    fontSize: 10,
    color: '#9ca3af',
  },
  panelBody: {
    overflowY: 'auto',
    padding: '10px 14px 14px',
  },
  stateText: {
    fontSize: 12,
    color: '#6b7280',
    margin: '6px 0',
  },
  section: {
    marginBottom: 14,
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    marginBottom: 6,
  },
  sectionThumb: {
    width: 20,
    height: 20,
    borderRadius: 4,
    objectFit: 'cover',
    flexShrink: 0,
    display: 'block',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    color: '#111827',
  },
  sectionTitleMuted: {
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  plotScroller: {
    overflowX: 'auto',
    paddingBottom: 4,
  },
  plot: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: COLUMN_GAP,
    minWidth: 'min-content',
  },
  column: {
    width: COLUMN_WIDTH,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  barArea: {
    height: PLOT_HEIGHT + 18,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 3,
  },
  barValue: {
    fontSize: 12,
    fontWeight: 700,
    color: '#111827',
    lineHeight: 1,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: '4px 4px 0 0',
  },
  axisLine: {
    width: '100%',
    height: 1,
    background: '#d1d5db',
  },
  tickLabel: {
    paddingTop: 5,
    width: '100%',
  },
  tickRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  tickThumb: {
    width: 14,
    height: 14,
    borderRadius: 3,
    objectFit: 'cover',
    flexShrink: 0,
    display: 'block',
  },
  tickText: {
    fontSize: 10,
    color: '#374151',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
  },
  tickArrow: {
    fontSize: 9,
    color: '#9ca3af',
    lineHeight: 1,
    paddingLeft: 4,
  },
}
