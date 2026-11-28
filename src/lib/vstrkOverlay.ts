/**
 * src/lib/vstrkOverlay.ts
 *
 * Shared helper for the VSTRK Overlay Chrome extension (floating stats panel on
 * the original YouTube / TikTok / Instagram post).
 *
 * This file is DISPLAY-ONLY plumbing. It never calculates analytics: each page
 * (InDepthAnalytics, AssetAnalytics) passes in the numbers it already calculated.
 * No analytics engine, tracking logic or Chrome extension file is touched.
 *
 * Flow (same as the Phase 0 extension test page):
 *   1. Build a snapshot: title + the VISIBLE metric rows (hidden ones removed).
 *   2. Send it straight to the extension (chrome.runtime.sendMessage, externally_connectable).
 *   3. Only if the extension confirmed, open the post with "#vstrk=<random UUID>".
 *      The URL NEVER carries numbers, titles or any customer data.
 *   4. If the extension is missing / rejects / times out / the URL is not a
 *      supported platform: open the plain original URL exactly as before.
 *
 * Display preferences: table `floating_stats_preferences` (user_id, hidden_metrics).
 * ONE GLOBAL setting for every account: the row owned by the founder account, edited on
 * /admin/floating-stats and read by everyone through the SQL function
 * get_floating_stats_hidden_metrics() (see sql/floating_stats_global_read.sql).
 * No row, or an empty list, means "show all 11". Other accounts' own rows are ignored.
 * If every metric is hidden, Floating Stats is effectively OFF: the post opens plainly.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { METRIC_LABELS, type MetricType } from './analyticsEngine';

// ─────────────────────────────────────────────────────────────────────────────
// 1. The 11 overlay metrics
// ─────────────────────────────────────────────────────────────────────────────

export interface OverlayMetricDef {
  /** Real analyticsEngine.ts MetricType key (compile-checked). */
  key: MetricType;
  label: string;
  kind: 'count' | 'money';
}

/**
 * Display order = Phase 0 order. Keys are the engine's own MetricType identifiers;
 * labels come from METRIC_LABELS except the two revenue rows, which use the
 * overlay wording requested for the panel.
 * To add / remove / rename a metric later, edit this list only.
 */
export const OVERLAY_METRICS: readonly OverlayMetricDef[] = [
  { key: 'landing_page_view',     label: METRIC_LABELS.landing_page_view,     kind: 'count' },
  { key: 'purchase_thankyou',     label: METRIC_LABELS.purchase_thankyou,     kind: 'count' },
  { key: 'newsletter_click',      label: METRIC_LABELS.newsletter_click,      kind: 'count' },
  { key: 'newsletter_thankyou',   label: METRIC_LABELS.newsletter_thankyou,   kind: 'count' },
  { key: 'call_booking_click',    label: METRIC_LABELS.call_booking_click,    kind: 'count' },
  { key: 'call_booking_thankyou', label: METRIC_LABELS.call_booking_thankyou, kind: 'count' },
  { key: 'consultation_click',    label: METRIC_LABELS.consultation_click,    kind: 'count' },
  { key: 'consultation_thankyou', label: METRIC_LABELS.consultation_thankyou, kind: 'count' },
  { key: 'direct_offer_revenue',  label: 'Direct Purchase Revenue',           kind: 'money' },
  { key: 'consultation_revenue',  label: 'Booked Consultation Revenue',       kind: 'money' },
  { key: 'total_revenue',         label: METRIC_LABELS.total_revenue,         kind: 'money' },
];

const KNOWN_KEYS = new Set<string>(OVERLAY_METRICS.map((m) => m.key));

/**
 * Whatever a page already calculated. ProcessedVideoRow (InDepthAnalytics) and
 * VideoMetricsResult (AssetAnalytics relationships[i].fullMetrics) both fit.
 */
export type OverlayMetricsSource = Partial<Record<MetricType, number | null | undefined>>;

/** Same formatting as analyticsEngine.formatCellValue: "1,234" and "$1,234". */
function formatOverlayValue(def: OverlayMetricDef, raw: unknown): string {
  const n = Number(raw);
  const v = Number.isFinite(n) ? n : 0;
  return def.kind === 'money' ? `$${v.toLocaleString()}` : v.toLocaleString();
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Per-account display preferences (table: floating_stats_preferences)
// ─────────────────────────────────────────────────────────────────────────────

const PREFS_TABLE = 'floating_stats_preferences';
const EMPTY_HIDDEN: string[] = []; // stable reference (keeps effects from re-firing)

/** Keep only strings, drop duplicates. Unknown keys are tolerated and ignored at filter time. */
function cleanHidden(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((x): x is string => typeof x === 'string')));
}

/**
 * Reads the hidden-metric list of ONE account. No row = [] (show all 11).
 * Throws on a query error so callers can tell "no preference" from "could not load".
 * RLS decides access: own row, or an account the caller may operate on.
 */
export async function fetchHiddenMetrics(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from(PREFS_TABLE)
    .select('hidden_metrics')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load floating stats preferences: ${error.message}`);
  return cleanHidden(data?.hidden_metrics);
}

/**
 * (Per-account list; no longer read by the overlay. Floating Stats now uses the global list above.)
 * Saves the hidden-metric list for the REAL logged-in account (pass authUser.id).
 * Never pass a viewed member's id: RLS only allows writing your own row.
 * At least one of the 11 metrics must stay visible.
 */
export async function saveHiddenMetrics(actorUserId: string, hidden: string[]): Promise<void> {
  const known = cleanHidden(hidden).filter((k) => KNOWN_KEYS.has(k));
  if (known.length >= OVERLAY_METRICS.length) {
    throw new Error('At least one metric must stay visible.');
  }
  const { error } = await supabase
    .from(PREFS_TABLE)
    .upsert(
      { user_id: actorUserId, hidden_metrics: known, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`Failed to save floating stats preferences: ${error.message}`);
}

/**
 * GLOBAL setting: the hidden-metric list the founder saved on /admin/floating-stats.
 * Readable by any signed-in account through a SECURITY DEFINER function that returns only
 * that one row's list. Throws on error so callers can tell "none hidden" from "could not load".
 */
export async function fetchGlobalHiddenMetrics(): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_floating_stats_hidden_metrics');
  if (error) throw new Error(`Failed to load Floating Stats settings: ${error.message}`);
  return cleanHidden(data);
}

/**
 * Saves the GLOBAL list. Pass the founder's own id (authUser.id): it writes that account's own
 * row, which the existing own-row RLS already permits for the founder and for nobody else.
 * An empty-visible list (all 11 hidden) is allowed and means Floating Stats is OFF.
 */
export async function saveGlobalHiddenMetrics(actorUserId: string, hidden: string[]): Promise<void> {
  const known = cleanHidden(hidden).filter((k) => KNOWN_KEYS.has(k));
  const { error } = await supabase
    .from(PREFS_TABLE)
    .upsert(
      { user_id: actorUserId, hidden_metrics: known, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error(`Failed to save Floating Stats settings: ${error.message}`);
}

/**
 * Loads the GLOBAL hidden-metric list (same for every account, Operator Mode included).
 * The id argument is kept so existing callers do not change: it only gates loading
 * (no id = default) and makes the hook reload when the viewed account changes.
 * While loading, after an error, or with no id, `hiddenMetrics` is the default
 * (nothing hidden = all 11), so a failure can never hide data wrongly.
 */
export function useOverlayPreferences(viewedUserId: string | null | undefined) {
  const [state, setState] = useState<{ userId: string | null; hidden: string[]; loading: boolean }>({
    userId: null,
    hidden: EMPTY_HIDDEN,
    loading: false,
  });
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!viewedUserId) {
      setState({ userId: null, hidden: EMPTY_HIDDEN, loading: false });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    fetchGlobalHiddenMetrics()
      .then((hidden) => {
        if (!cancelled) setState({ userId: viewedUserId, hidden, loading: false });
      })
      .catch((e) => {
        console.warn('[vstrkOverlay] global preferences unavailable, showing all metrics:', e);
        if (!cancelled) setState({ userId: viewedUserId, hidden: EMPTY_HIDDEN, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [viewedUserId, reloadTick]);

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  const matches = !!viewedUserId && state.userId === viewedUserId;
  return {
    hiddenMetrics: matches ? state.hidden : EMPTY_HIDDEN,
    loading: !!viewedUserId && (state.loading || !matches),
    reload,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Snapshot (what the extension receives)
// ─────────────────────────────────────────────────────────────────────────────

export interface OverlaySnapshot {
  v: 1;
  nonce: string;
  createdAt: number;
  title: string;
  targetUrl: string;
  rows: { label: string; value: string }[];
}

/** Visible rows in catalog order. Hidden metrics are removed. All hidden = no rows (overlay OFF). */
export function buildOverlayRows(
  metrics: OverlayMetricsSource,
  hiddenMetrics: readonly string[],
): { label: string; value: string }[] {
  const hidden = new Set(hiddenMetrics);
  const defs = OVERLAY_METRICS.filter((m) => !hidden.has(m.key));
  return defs.map((m) => ({ label: m.label, value: formatOverlayValue(m, metrics[m.key]) }));
}

export interface BuildOverlaySnapshotOptions {
  /** Plain-text title for the panel header (e.g. the video title). */
  title: string;
  /** The original post URL, exactly as it will be opened (no hash). */
  targetUrl: string;
  /** The numbers the calling page already calculated. */
  metrics: OverlayMetricsSource;
  /** Hidden keys of the VIEWED account (from useOverlayPreferences). */
  hiddenMetrics: readonly string[];
  /** Set only in Operator Mode: the viewed member's name, shown first in the title. */
  operatorMemberName?: string | null;
}

/** Returns null when a secure random UUID is not available (then the caller falls back to the plain URL). */
export function buildOverlaySnapshot(opts: BuildOverlaySnapshotOptions): OverlaySnapshot | null {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') return null;
  const base = String(opts.title ?? '').trim();
  const who = opts.operatorMemberName ? String(opts.operatorMemberName).trim() : '';
  const title = (who ? (base ? `${who} · ${base}` : who) : base).slice(0, 120);
  return {
    v: 1,
    nonce: crypto.randomUUID(),
    createdAt: Date.now(),
    title,
    targetUrl: opts.targetUrl,
    rows: buildOverlayRows(opts.metrics, opts.hiddenMetrics),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Sending to the extension + opening the post
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extension ID is fixed by the "key" in the extension's manifest.json (Phase 0).
 * It may differ once the extension is published; override with
 * VITE_VSTRK_OVERLAY_EXTENSION_ID instead of editing code.
 */
const EXTENSION_ID: string =
  ((import.meta as any).env?.VITE_VSTRK_OVERLAY_EXTENSION_ID as string | undefined) ||
  'odnjafjdfblbgkhnoodefijpcaidoiic';

const SEND_TIMEOUT_MS = 1000;

/**
 * KEEP IN SYNC with PLATFORM_DOMAINS in the extension's platform-keys.js
 * (and the host lists in its manifest.json). Only decides whether a snapshot is sent;
 * the extension itself decides whether a given page is the same content.
 */
const OVERLAY_TARGET_DOMAINS = [
  'youtube.com', 'youtu.be',
  'tiktok.com',
  'instagram.com',
  'facebook.com', 'fb.watch',
  'threads.net', 'threads.com',
  'linkedin.com',
  'twitch.tv',
  'x.com', 'twitter.com',
  'reddit.com',
];

export function isOverlaySupportedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    return OVERLAY_TARGET_DOMAINS.some((d) => h === d || h.endsWith('.' + d));
  } catch {
    return false;
  }
}

export type SendResult = { ok: true } | { ok: false; reason: string; detail?: string };

/**
 * Sends one SNAPSHOT message straight to the extension (externally_connectable).
 * ALWAYS resolves (never throws, never waits longer than timeoutMs).
 */
export function sendSnapshotToExtension(
  payload: OverlaySnapshot,
  timeoutMs: number = SEND_TIMEOUT_MS,
): Promise<SendResult> {
  return new Promise((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (r: SendResult) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      resolve(r);
    };
    timer = setTimeout(() => finish({ ok: false, reason: 'timeout' }), timeoutMs);
    try {
      const c = (window as any).chrome;
      if (!(c && c.runtime && typeof c.runtime.sendMessage === 'function')) {
        return finish({ ok: false, reason: 'no-chrome-runtime' });
      }
      c.runtime.sendMessage(EXTENSION_ID, { type: 'SNAPSHOT', payload }, (res: any) => {
        const err = c.runtime.lastError;
        if (err) return finish({ ok: false, reason: 'error', detail: err.message });
        if (res && res.ok) return finish({ ok: true });
        finish({ ok: false, reason: 'rejected', detail: (res && res.error) || 'no response' });
      });
    } catch (e: any) {
      finish({ ok: false, reason: 'exception', detail: String((e && e.message) || e) });
    }
  });
}

/** "<post url>#vstrk=<nonce>" — the hash is ONLY the random code. */
function withNonce(url: string, nonce: string): string {
  const u = new URL(url);
  u.hash = 'vstrk=' + nonce;
  return u.toString();
}

export interface OpenPostWithOverlayOptions extends BuildOverlaySnapshotOptions {
  /**
   * The VIEWED account's id (InDepth: user?.id; AssetAnalytics: useEffectiveIdentity().userId).
   * Missing = fail closed: no snapshot is sent and the post opens plainly.
   */
  viewedUserId: string | null | undefined;
}

export interface OpenPostResult {
  /** true = the extension confirmed the snapshot and the post opened with the random code. */
  overlay: boolean;
  /** Why the plain URL was used instead (empty when overlay is true). */
  reason: string;
}

/**
 * Replacement for window.open(originalUrl, '_blank', 'noopener,noreferrer').
 * Always opens the post. The overlay is added only if everything worked;
 * otherwise the original URL opens exactly as it does today.
 */
export async function openPostWithOverlay(opts: OpenPostWithOverlayOptions): Promise<OpenPostResult> {
  const plain = (reason: string): OpenPostResult => {
    window.open(opts.targetUrl, '_blank', 'noopener,noreferrer');
    return { overlay: false, reason };
  };

  if (!opts.viewedUserId) return plain('no-viewed-account');
  if (!isOverlaySupportedUrl(opts.targetUrl)) return plain('unsupported-platform');

  const snapshot = buildOverlaySnapshot(opts);
  if (!snapshot) return plain('no-secure-uuid');
  if (snapshot.rows.length === 0) return plain('all-metrics-hidden'); // founder turned every metric OFF

  const sent = await sendSnapshotToExtension(snapshot);
  if (!sent.ok) return plain(sent.reason + (sent.detail ? `: ${sent.detail}` : ''));

  let finalUrl: string;
  try {
    finalUrl = withNonce(opts.targetUrl, snapshot.nonce);
  } catch {
    return plain('bad-url');
  }
  window.open(finalUrl, '_blank', 'noopener,noreferrer');
  return { overlay: true, reason: '' };
}