/**
 * src/components/analytics/widgets/PartnerAnalyticsWidget.tsx
 *
 * "Partner Analytics" widget for the Workspace canvas (Collab domain).
 *
 * ARCHITECTURE — reuses PartnerAnalytics.tsx + PartnerJourneySection.tsx, no second engine:
 *   1. loadPartnerTableStage1 / loadPartnerTableMore   (same loaders as the page)
 *   2. partnerAnalyticsCaches                           (same cache + same key as the page)
 *   3. PartnerChart                                     (same chart component, Totals view)
 *   4. PartnerJourneySection (embedded)                 (journeys scoped by the checked partners;
 *                                                        no copy of the journey / revenue logic)
 *   5. COPY / PARTNER_COLORS / journeyRangeFromPreset   (exported by the page)
 *
 * Selection is independent from the full page:
 *   - widget.config.selectedIds is the single source of truth for this widget.
 *   - The page's cached selection is never read, and the cache is only written
 *     when the page has not already stored an entry for the same key.
 *
 * Config shape (widget.config) — persisted via onUpdate:
 *   mode:        'marketers' | 'sponsors'  — default 'marketers'
 *   preset:      PartnerPreset             — default 'last_30_days'
 *   customStart: string | null             — 'YYYY-MM-DD', used when preset = 'custom'
 *   customEnd:   string | null
 *   selectedIds: string[] | null           — null = not initialised (first partner is selected after load)
 *   view:        'totals' | 'trend'        — trend is disabled upstream, kept for parity
 *   scaleMode:   ScaleMode                 — default 'auto'
 *   chartHidden: boolean                   — default false
 *
 * Not included on purpose: chart popup modal (a modal under the canvas zoom transform
 * is awkward) and the per-row "Journeys ↗" navigation link.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, EyeOff, Loader2, Minus } from 'lucide-react'

import { useLanguage } from '../../../lib/hooks'
import { useAuth } from '../../../lib/auth'
import { useViewing } from '../../../lib/ViewingContext'
import { useOrganization } from '../../../lib/useOrganization'
import type { ScaleMode } from '../../../lib/chartScale'
import { partnerAnalyticsCaches } from '../../../lib/partnerAnalyticsPageCache'
import PartnerChart, { type ChartSeries, type ChartText } from '../PartnerChart'
import PartnerJourneySection from '../PartnerJourneySection'
import {
  loadPartnerTableStage1,
  loadPartnerTableMore,
  type PartnerMode,
  type PartnerPreset,
  type PartnerTableRow,
} from '../../../services/promotion/getPartnerAnalytics'
import {
  COPY,
  PARTNER_COLORS,
  journeyRangeFromPreset,
  type CopyKey,
} from '../../../pages/PartnerAnalytics'
import type { Widget } from '../store/useWorkspaceStore'

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  widget:           Widget
  onUpdate?:        (patch: Partial<Widget>) => void
  analyticsResult?: unknown  // unused — loaders fetch directly
}

type ChartView = 'trend' | 'totals'

// ─── Constants — values taken from PartnerAnalytics.tsx ──────────────────────
const PRESETS: { key: PartnerPreset; labelKey: CopyKey }[] = [
  { key: 'last_7_days',    labelKey: 'range.last_7_days'    },
  { key: 'last_30_days',   labelKey: 'range.last_30_days'   },
  { key: 'this_month',     labelKey: 'range.this_month'     },
  { key: 'last_12_months', labelKey: 'range.last_12_months' },
  { key: 'all_time',       labelKey: 'range.all_time'       },
  { key: 'custom',         labelKey: 'range.custom'         },
]

const DASH = '—'
const formatMoney = (n: number | null) =>
  n === null
    ? DASH
    : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const toDateInput = (d: Date) => d.toISOString().slice(0, 10)
const defaultCustomStart = () => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return toDateInput(d)
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────
function Segmented<T extends string>({
  value, options, onChange,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl max-w-full overflow-x-auto">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg font-black uppercase tracking-widest whitespace-nowrap transition-all px-3 py-1.5 text-[9px] ${
            value === o.value ? 'bg-zinc-700 text-white' : 'text-zinc-600 hover:text-zinc-400'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Checkbox({
  state, onClick, label,
}: {
  state: 'on' | 'off' | 'some'
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'some' ? 'mixed' : state === 'on'}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
        state === 'off' ? 'border-zinc-700 bg-zinc-900' : 'border-red-600 bg-red-600 text-white'
      }`}
    >
      {state === 'on' && <Check size={11} strokeWidth={3} />}
      {state === 'some' && <Minus size={11} strokeWidth={3} />}
    </button>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PartnerAnalyticsWidget({ widget, onUpdate }: Props) {
  const { lang } = useLanguage()
  const dict = lang === 'en' ? COPY.en : COPY.zh
  const tr = (k: CopyKey): string => dict[k]
  const jl = (k: string): string => tr(`journey.${k}` as CopyKey)

  const { user } = useAuth()
  const { viewingMemberId, viewingOrgId, isReadOnly } = useViewing()
  const { organizationId: hookOrgId } = useOrganization()
  const organizationId = isReadOnly ? (viewingOrgId ?? null) : (hookOrgId ?? null)
  const marketerUserId = isReadOnly ? viewingMemberId : (user?.id ?? null)

  // ── Config (persisted per widget) ─────────────────────────────────────────
  const cfg         = widget.config ?? {}
  const mode        = ((cfg.mode as PartnerMode)     ?? 'marketers')
  const preset      = ((cfg.preset as PartnerPreset) ?? 'last_30_days')
  const customStart = ((cfg.customStart as string | null) || defaultCustomStart())
  const customEnd   = ((cfg.customEnd as string | null)   || toDateInput(new Date()))
  const view        = ((cfg.view as ChartView)       ?? 'totals')
  const scaleMode   = ((cfg.scaleMode as ScaleMode)  ?? 'auto')
  const chartHidden = Boolean(cfg.chartHidden)
  const storedIds   = Array.isArray(cfg.selectedIds) ? (cfg.selectedIds as string[]) : null
  const selectedIds = storedIds ?? []

  // Always merge into the latest config so quick successive patches never clobber each other.
  const cfgRef = useRef<Record<string, unknown>>(widget.config ?? {})
  cfgRef.current = widget.config ?? {}
  const patchConfig = useCallback(
    (patch: Record<string, unknown>) => {
      const next = { ...cfgRef.current, ...patch }
      cfgRef.current = next
      onUpdate?.({ config: next })
    },
    [onUpdate],
  )

  // ── Table data state (local — loaded data is not persisted in config) ─────
  const [partners, setPartners] = useState<PartnerTableRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMoreAvailable, setHasMoreAvailable] = useState(true)
  const [showingAllPartners, setShowingAllPartners] = useState(false)
  // Which cacheKey the partners in state belong to (guards selection logic during key changes).
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const customRange =
    preset === 'custom' && customStart && customEnd
      ? { start: new Date(customStart), end: new Date(customEnd) }
      : null

  const cacheKey = marketerUserId
    ? `${marketerUserId}|${organizationId ?? ''}|${mode}|${preset}|${preset === 'custom' ? `${customStart}~${customEnd}` : ''}`
    : null

  const loadParams = useMemo(
    () => ({ mode, organizationId, marketerUserId, preset, customRange }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, organizationId, marketerUserId, preset, customStart, customEnd],
  )

  // Stage 1: snapshot-only (same flow as the page)
  useEffect(() => {
    const requestId = ++requestIdRef.current

    if (isReadOnly && (!viewingMemberId || !viewingOrgId)) {
      setLoadedKey(null)
      setPartners([])
      setHasMoreAvailable(false)
      setError('Viewed account unavailable')
      setLoading(false)
      return
    }

    const hit = cacheKey ? partnerAnalyticsCaches[mode].get(cacheKey) : null
    if (hit) {
      setPartners(hit.data.partners)
      setHasMoreAvailable(hit.data.hasMoreAvailable)
      setShowingAllPartners(hit.data.showingAllPartners)
      setLoadedKey(cacheKey)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    setHasMoreAvailable(true)
    setShowingAllPartners(false)

    if (preset === 'custom') {
      const a = new Date(customStart)
      const b = new Date(customEnd)
      if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a > b) {
        setLoading(false)
        return
      }
    }

    loadPartnerTableStage1(loadParams)
      .then((rows) => {
        if (requestId !== requestIdRef.current) return
        setPartners(rows)
        setLoadedKey(cacheKey)
      })
      .catch((e: unknown) => {
        if (requestId !== requestIdRef.current) return
        setError(e instanceof Error ? e.message : 'Failed to load partners')
        setPartners([])
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadParams])

  const loadMore = useCallback(() => {
    if (loadingMore || loading) return
    setLoadingMore(true)
    const requestId = requestIdRef.current
    loadPartnerTableMore({ ...loadParams, alreadyLoadedIds: partners.map((p) => p.id) })
      .then((extra) => {
        if (requestId !== requestIdRef.current) return
        if (extra.length === 0) {
          setHasMoreAvailable(false)
          setShowingAllPartners(true)
          return
        }
        setPartners((prev) => {
          const ids = new Set(prev.map((p) => p.id))
          const merged = [...prev]
          for (const r of extra) if (!ids.has(r.id)) merged.push(r)
          return merged.sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name))
        })
        setHasMoreAvailable(false)
        setShowingAllPartners(true)
      })
      .catch((e: unknown) => {
        if (requestId !== requestIdRef.current) return
        setError(e instanceof Error ? e.message : 'Failed to load more partners')
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoadingMore(false)
      })
  }, [loadParams, partners, loadingMore, loading])

  const collapseToRanking = () => {
    setShowingAllPartners(false)
    setHasMoreAvailable(true)
    requestIdRef.current++
    setLoading(true)
    loadPartnerTableStage1(loadParams)
      .then((rows) => setPartners(rows))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to reload'))
      .finally(() => setLoading(false))
  }

  // Seed the shared page cache only when the page has not stored this key yet.
  // The widget never writes its own selection into the page cache.
  useEffect(() => {
    if (!cacheKey || loadedKey !== cacheKey) return
    if (loading || loadingMore || error || partners.length === 0) return
    if (partnerAnalyticsCaches[mode].get(cacheKey)) return
    partnerAnalyticsCaches[mode].set(cacheKey, {
      partners,
      selectedIds: [partners[0].id],
      hasMoreAvailable,
      showingAllPartners,
    })
  }, [cacheKey, loadedKey, mode, partners, hasMoreAvailable, showingAllPartners, loading, loadingMore, error])

  // Widget-owned selection: default to the first partner once, then prune ids that no longer exist.
  useEffect(() => {
    if (!cacheKey || loadedKey !== cacheKey) return
    if (loading || loadingMore || partners.length === 0) return
    if (storedIds === null) {
      patchConfig({ selectedIds: [partners[0].id] })
      return
    }
    const valid = new Set(partners.map((p) => p.id))
    const pruned = storedIds.filter((id) => valid.has(id))
    if (pruned.length !== storedIds.length) patchConfig({ selectedIds: pruned })
  }, [cacheKey, loadedKey, partners, loading, loadingMore, storedIds, patchConfig])

  // ── Selection actions (all persisted to widget.config) ────────────────────
  const toggle = (id: string) =>
    patchConfig({
      selectedIds: selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    })
  const setSelected = (ids: string[]) => patchConfig({ selectedIds: ids })
  const changeMode = (m: PartnerMode) => patchConfig({ mode: m, selectedIds: null })

  const allState: 'on' | 'off' | 'some' =
    selectedIds.length === 0 ? 'off' : selectedIds.length === partners.length ? 'on' : 'some'
  const partnerRole: 'sponsor' | 'marketer' = mode === 'marketers' ? 'marketer' : 'sponsor'

  const kpiRevenue = useMemo(
    () => (partners.length === 0 ? null : partners.reduce((s, p) => s + (p.revenue || 0), 0)),
    [partners],
  )

  // ── Chart ─────────────────────────────────────────────────────────────────
  const series: ChartSeries[] = useMemo(
    () =>
      partners
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => selectedIds.includes(p.id))
        .map(({ p, i }) => ({
          id: p.id,
          name: p.name,
          color: PARTNER_COLORS[i % PARTNER_COLORS.length],
          total: p.revenue,
          values: [p.revenue],
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [partners, selectedIds.join('|')],
  )

  const chartText: ChartText = {
    empty: tr('chart.empty'),
    noData: view === 'trend' ? tr('chart.trendDisabled') : tr('chart.noData'),
    linearBadge: tr('chart.linearBadge'),
    logBadge: tr('chart.logBadge'),
    autoSuffix: tr('chart.auto'),
    logNote: tr('chart.logNote'),
    zeroNote: tr('chart.zeroNote'),
    hatchNote: tr('chart.hatchNote'),
    forcedLinearHint: tr('chart.forcedLinearHint'),
    logUnavailable: tr('chart.logUnavailable'),
    noValue: tr('chart.noValue'),
  }

  const journeyPartners = useMemo(
    () => partners.map((p, i) => ({ id: p.id, name: p.name, color: PARTNER_COLORS[i % PARTNER_COLORS.length] })),
    [partners],
  )

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto bg-zinc-950 text-white" style={{ colorScheme: 'dark' }}>
      <div className="flex flex-col gap-4 p-4">
        {/* Controls: mode + range + KPI */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented<PartnerMode>
            value={mode}
            onChange={changeMode}
            options={[
              { value: 'marketers', label: tr('mode.marketers') },
              { value: 'sponsors',  label: tr('mode.sponsors')  },
            ]}
          />
          <div className="text-right">
            <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{tr('totalRevenue')}</div>
            <div className="text-xl font-black tabular-nums">{loading ? '…' : formatMoney(kpiRevenue)}</div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Segmented<PartnerPreset>
            value={preset}
            onChange={(p) => patchConfig({ preset: p, customStart, customEnd })}
            options={PRESETS.map((p) => ({ value: p.key, label: tr(p.labelKey) }))}
          />
          {preset === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={customStart}
                onChange={(e) => patchConfig({ customStart: e.target.value })}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-[10px] text-zinc-300 outline-none focus:border-red-600"
              />
              <span className="text-zinc-700">–</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => patchConfig({ customEnd: e.target.value })}
                className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-[10px] text-zinc-300 outline-none focus:border-red-600"
              />
            </div>
          )}
        </div>

        {/* Chart */}
        {chartHidden ? (
          <button
            type="button"
            onClick={() => patchConfig({ chartHidden: false })}
            className="self-start h-8 px-3 rounded-xl border border-zinc-800 bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-white"
          >
            {tr('showChart')}
          </button>
        ) : (
          <section className="bg-gradient-to-b from-zinc-900/50 to-zinc-950 border border-zinc-800/80 rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-zinc-900">
              <h3 className="text-xs font-black text-white uppercase tracking-tight flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-red-600" />
                {tr('totals')}
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented<ChartView>
                  value={view}
                  onChange={(v) => patchConfig({ view: v === 'trend' ? 'totals' : v })}
                  options={[
                    { value: 'totals', label: tr('totals') },
                    { value: 'trend',  label: `${tr('trend')} · soon` },
                  ]}
                />
                <Segmented<ScaleMode>
                  value={scaleMode}
                  onChange={(v) => patchConfig({ scaleMode: v })}
                  options={[
                    { value: 'auto',   label: tr('scale.auto')   },
                    { value: 'linear', label: tr('scale.linear') },
                    { value: 'log',    label: tr('scale.log')    },
                  ]}
                />
                <button
                  type="button"
                  onClick={() => patchConfig({ chartHidden: true })}
                  className="h-8 px-3 rounded-xl border border-zinc-800 bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-white flex items-center gap-1.5"
                >
                  <EyeOff size={13} />
                  {tr('hideChart')}
                </button>
              </div>
            </div>
            <div className="px-4 py-4">
              {view === 'trend' ? (
                <p className="text-center text-[11px] font-bold uppercase tracking-widest text-zinc-600 py-8">
                  {tr('chart.trendDisabled')}
                </p>
              ) : (
                <PartnerChart
                  view="totals"
                  metric="currency"
                  labels={['Total']}
                  fullLabels={['Total']}
                  series={series}
                  scaleMode={scaleMode}
                  height={240}
                  text={chartText}
                />
              )}
            </div>
          </section>
        )}

        {/* Partner table */}
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-xs font-black text-white uppercase tracking-tight flex items-center gap-2">
                <span className="w-1 h-4 rounded-full bg-red-600" />
                {tr(`list.${mode}` as CopyKey)}
              </h3>
              <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">
                {tr(`listHint.${mode}` as CopyKey)}
              </p>
            </div>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="text-[9px] font-black uppercase tracking-widest text-zinc-500 hover:text-white"
              >
                {tr('clearAll')} ({selectedIds.length})
              </button>
            )}
          </div>

          <div className="bg-zinc-950 border border-zinc-900 rounded-2xl overflow-hidden">
            {loading && (
              <div className="flex items-center justify-center gap-2 px-6 py-8 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                <Loader2 className="animate-spin" size={14} /> {tr('loadingMore')}
              </div>
            )}
            {!loading && error && (
              <div className="px-6 py-5 text-center text-[11px] font-bold text-red-500">{error}</div>
            )}
            {!loading && !error && partners.length === 0 && (
              <div className="px-6 py-8 text-center text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                {tr('empty')}
              </div>
            )}
            {!loading && !error && partners.length > 0 && (
              <div className="max-h-[260px] overflow-auto">
                <table className="min-w-full divide-y divide-zinc-900 border-collapse">
                  <thead className="bg-zinc-950 sticky top-0 z-10">
                    <tr>
                      <th className="w-10 pl-4 py-3 border-b border-zinc-900 text-left">
                        <Checkbox
                          state={allState}
                          label={allState === 'on' ? tr('clearAll') : tr('selectAll')}
                          onClick={() => setSelected(allState === 'on' ? [] : partners.map((p) => p.id))}
                        />
                      </th>
                      <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900">
                        {tr('partner')}
                      </th>
                      <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-zinc-600 border-b border-zinc-900">
                        {tr('totalRevenue')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900">
                    {partners.map((p, i) => {
                      const on = selectedIds.includes(p.id)
                      const color = PARTNER_COLORS[i % PARTNER_COLORS.length]
                      return (
                        <tr
                          key={p.id}
                          onClick={() => toggle(p.id)}
                          className={`cursor-pointer transition-colors ${
                            on ? 'bg-gradient-to-r from-zinc-800/60 to-transparent' : 'hover:bg-zinc-900/40'
                          }`}
                        >
                          <td className="pl-4 py-2.5" style={{ boxShadow: on ? `inset 3px 0 0 ${color}` : undefined }}>
                            <Checkbox state={on ? 'on' : 'off'} label={p.name} onClick={() => toggle(p.id)} />
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: on ? color : 'transparent' }} />
                              <span className="text-xs font-bold text-white">{p.name}</span>
                              <span className="px-1.5 py-0.5 rounded-md border border-zinc-800 bg-zinc-900 text-[8px] font-black uppercase tracking-widest text-zinc-500">
                                {tr(`role.${partnerRole}` as CopyKey)}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs text-zinc-300 tabular-nums">
                            {formatMoney(p.revenue)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {!loading && !error && partners.length > 0 && (hasMoreAvailable || showingAllPartners) && (
            <div className="flex justify-center">
              <button
                type="button"
                disabled={loadingMore || loading}
                onClick={() => (showingAllPartners ? collapseToRanking() : loadMore())}
                className="h-8 px-4 rounded-xl border border-zinc-800 bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-zinc-300 hover:text-white hover:border-zinc-600 disabled:opacity-50 flex items-center gap-2"
              >
                {loadingMore && <Loader2 className="animate-spin" size={12} />}
                {loadingMore
                  ? tr('loadingMore')
                  : showingAllPartners
                    ? tr(mode === 'marketers' ? 'lessMarketers' : 'lessSponsors')
                    : tr(mode === 'marketers' ? 'moreMarketers' : 'moreSponsors')}
              </button>
            </div>
          )}
        </section>

        {/* Journeys — the page's own section, driven by this widget's selection */}
        <PartnerJourneySection
          embedded
          mode={mode === 'marketers' ? 'sponsor' : 'marketer'}
          partnerTableMode={mode}
          partners={journeyPartners}
          selectedIds={selectedIds}
          onTogglePartner={toggle}
          onClearPartners={() => setSelected([])}
          range={journeyRangeFromPreset(preset)}
          customStart={customStart}
          customEnd={customEnd}
          labels={{
            title: jl('title'),
            hint: jl('hint'),
            allPartners: jl('allPartners'),
            scopedTo: jl('scopedTo'),
            removePartner: tr('removePartner'),
            filters: jl('filters'),
            clear: jl('clear'),
            showMore: jl('showMore'),
            showing: jl('showing'),
            of: jl('of'),
            loading: jl('loading'),
            empty: jl('empty'),
            showOwner: jl('showOwner'),
            hideOwner: jl('hideOwner'),
            done: jl('done'),
            allPlatforms: jl('allPlatforms'),
            assetType: jl('assetType'),
            assetScope: jl('assetScope'),
            promotion: jl('promotion'),
            assetCampaign: jl('assetCampaign'),
            contentCampaign: jl('contentCampaign'),
            campaign: jl('campaign'),
            allCampaigns: jl('allCampaigns'),
            partner: jl('partner'),
            addPartner: jl('addPartner'),
            rangeLabel: jl('range'),
            truncated: jl('truncated'),
            route: jl('route'),
            sortDefault: jl('sortDefault'),
            sortLongest: jl('sortLongest'),
            showRest: jl('showRest'),
            rowsPlaceholder: jl('rowsPlaceholder'),
            showRows: jl('showRows'),
            journeysOne: jl('journeysOne'),
            journeysMany: jl('journeysMany'),
            videosOne: jl('videosOne'),
            videosMany: jl('videosMany'),
            showFlow: jl('showFlow'),
            hideFlow: jl('hideFlow'),
            flowHint: jl('flowHint'),
            flowCount: jl('flowCount'),
            flowUnresolved: jl('flowUnresolved'),
          }}
        />
      </div>
    </div>
  )
}
