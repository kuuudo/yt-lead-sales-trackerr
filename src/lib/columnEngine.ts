// ─────────────────────────────────────────────────────────────────────────────
// columnEngine.ts
//
// LAYER 2: Campaign Capability Engine
// LAYER 3: UI Column Engine
//
// RULES:
// 1. Pure functions only — no React, no hooks, no side effects.
// 2. Capabilities derived STRICTLY from URL presence on campaign(s).
//    No inference. URL present = feature exists. URL absent = feature does not.
// 3. Column engine is the ONLY place column order/visibility is determined.
//    No column logic is permitted in JSX renderers.
// 4. Clicks is a hard-enforced fallback — shown ONLY when no funnel URLs exist.
// 5. Revenue column is always last, always visible — never part of dynamic set.
// 6. Newsletter is never a default column.
// ─────────────────────────────────────────────────────────────────────────────

import type { MetricType } from './analyticsConfig';

// ─────────────────────────────────────────────────────────────────────────────
// Campaign shape — minimal subset needed for capability derivation
// ─────────────────────────────────────────────────────────────────────────────

export interface CampaignCapabilitySource {
  id:                       string;
  campaign_name?:           string | null;
  consultation_booking_url?: string | null;
  checkout_url?:             string | null;
  sales_call_booking_url?:   string | null;
  newsletter_url?:           string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — Campaign Capabilities
// Derived strictly from URL presence. No boolean flags from the DB are used.
// ─────────────────────────────────────────────────────────────────────────────

export interface CampaignCapabilities {
  hasConsultations: boolean;
  hasPurchases:     boolean;
  hasCalls:         boolean;
  hasNewsletter:    boolean;
  // Clicks is always tracked — this flag controls UI visibility only
  showClicksFallback: boolean;
}

function urlPresent(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.trim().length > 0;
}

/**
 * Derives capability flags from a single campaign.
 * Strict mode: URL present → feature exists. URL absent → feature does NOT exist.
 */
export function deriveCampaignCapabilities(
  campaign: CampaignCapabilitySource,
): CampaignCapabilities {
  const hasConsultations = urlPresent(campaign.consultation_booking_url);
  const hasPurchases     = urlPresent(campaign.checkout_url);
  const hasCalls         = urlPresent(campaign.sales_call_booking_url);
  const hasNewsletter    = urlPresent(campaign.newsletter_url);

  // Clicks fallback: ONLY if no funnel URL exists on this campaign
  const showClicksFallback = !hasConsultations && !hasPurchases && !hasCalls;

  return { hasConsultations, hasPurchases, hasCalls, hasNewsletter, showClicksFallback };
}

/**
 * Merges capabilities across multiple campaigns (union — feature shown if ANY
 * selected campaign supports it). Used for "All Campaigns" context.
 */
export function mergeCampaignCapabilities(
  campaigns: CampaignCapabilitySource[],
): CampaignCapabilities {
  if (campaigns.length === 0) {
    return {
      hasConsultations:  false,
      hasPurchases:      false,
      hasCalls:          false,
      hasNewsletter:     false,
      showClicksFallback: true,
    };
  }

  const caps = campaigns.map(deriveCampaignCapabilities);

  const hasConsultations = caps.some(c => c.hasConsultations);
  const hasPurchases     = caps.some(c => c.hasPurchases);
  const hasCalls         = caps.some(c => c.hasCalls);
  const hasNewsletter    = caps.some(c => c.hasNewsletter);

  // Clicks fallback: ONLY if NO campaign in the selected set has any funnel URL
  const showClicksFallback = !hasConsultations && !hasPurchases && !hasCalls;

  return { hasConsultations, hasPurchases, hasCalls, hasNewsletter, showClicksFallback };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3 — Column Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type ColumnRole = 'locked' | 'dynamic' | 'revenue';

export interface ColumnDef {
  key:        string;           // unique identifier, used for render dispatch
  label:      string;           // table header text
  metricKey?: MetricType;       // maps to VideoMetrics field for value + sorting
  role:       ColumnRole;
  align:      'left' | 'center' | 'right';
  width?:     string;           // Tailwind width class
}

// ── Locked column definitions (always rendered, never reordered) ──────────────

export const RANK_COLUMN: ColumnDef = {
  key:    'rank',
  label:  '#',
  role:   'locked',
  align:  'left',
  width:  'w-8',
};

export const CONTENT_COLUMN: ColumnDef = {
  key:   'content',
  label: 'Content',
  role:  'locked',
  align: 'left',
};

export const REVENUE_COLUMN: ColumnDef = {
  key:       'revenue',
  label:     'Revenue',
  metricKey: 'total_revenue',
  role:      'revenue',
  align:     'right',
};

// ── Dynamic column catalog ────────────────────────────────────────────────────

const CONSULTATION_COLUMN: ColumnDef = {
  key:       'consultations',
  label:     'Consultations',
  metricKey: 'consultation_thankyou',
  role:      'dynamic',
  align:     'center',
};

const PURCHASE_COLUMN: ColumnDef = {
  key:       'purchases',
  label:     'Purchases',
  metricKey: 'purchase_thankyou',
  role:      'dynamic',
  align:     'center',
};

const CALLS_COLUMN: ColumnDef = {
  key:       'calls',
  label:     'Calls',
  metricKey: 'call_booking_thankyou',
  role:      'dynamic',
  align:     'center',
};

const CLICKS_COLUMN: ColumnDef = {
  key:       'clicks',
  label:     'Clicks',
  metricKey: 'landing_page_view',
  role:      'dynamic',
  align:     'center',
};

const NEWSLETTER_COLUMN: ColumnDef = {
  key:       'newsletter',
  label:     'Newsletter Opt-ins',
  metricKey: 'newsletter_thankyou',
  role:      'dynamic',
  align:     'center',
};

// ── Column engine — the single source of column truth ────────────────────────

/**
 * Derives the ordered column definition array from campaign capabilities.
 *
 * Layout:
 *   [Rank] [Content] [...dynamic up to 3] [Revenue]
 *
 * Dynamic priority: Consultations → Purchases → Calls → Clicks (fallback only)
 * Max total columns: 6 (2 locked + up to 3 dynamic + 1 revenue)
 * Revenue: always last, always visible.
 * Newsletter: never included.
 * Clicks: ONLY if showClicksFallback is true (no funnel URLs on campaign).
 *
 * Input: capabilities derived from selected campaign(s) — NOT from rows.
 */
export function buildColumnDefs(caps: CampaignCapabilities): ColumnDef[] {
  const dynamic: ColumnDef[] = [];

  if (caps.hasConsultations) dynamic.push(CONSULTATION_COLUMN);
  if (caps.hasPurchases)     dynamic.push(PURCHASE_COLUMN);
  if (caps.hasCalls)         dynamic.push(CALLS_COLUMN);

  // Hard rule: Clicks is ONLY added when no funnel column was added above
  if (caps.showClicksFallback) dynamic.push(CLICKS_COLUMN);

  // Cap dynamic columns at 3 (max total = 6)
  const cappedDynamic = dynamic.slice(0, 3);

  return [
    RANK_COLUMN,
    CONTENT_COLUMN,
    ...cappedDynamic,
    REVENUE_COLUMN,
  ];
}

// ── Full column catalog (all toggleable columns for the visibility panel) ────
// Order here determines order in the panel UI.
export const ALL_TOGGLEABLE_COLUMNS: ColumnDef[] = [
  CONSULTATION_COLUMN,
  PURCHASE_COLUMN,
  CALLS_COLUMN,
  CLICKS_COLUMN,
  NEWSLETTER_COLUMN,
];

/**
 * Returns the default visible column keys for a given capability set.
 * Used to seed initial state and to compute campaign-change deltas.
 *
 * Revenue is always visible — not included here (it's never toggled).
 */
export function defaultVisibleKeys(caps: CampaignCapabilities): Set<string> {
  const keys = new Set<string>();
  if (caps.hasConsultations)   keys.add('consultations');
  if (caps.hasPurchases)       keys.add('purchases');
  if (caps.hasCalls)           keys.add('calls');
  if (caps.showClicksFallback) keys.add('clicks');
  // newsletter: never default
  return keys;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sort label builder — reflects both active metric AND campaign context
// ─────────────────────────────────────────────────────────────────────────────

const METRIC_SORT_LABELS: Partial<Record<MetricType, string>> = {
  total_revenue:          'Revenue',
  landing_page_view:      'Clicks',
  newsletter_thankyou:    'Newsletter Opt-ins',
  call_booking_thankyou:  'Calls',
  consultation_thankyou:  'Consultations',
  purchase_thankyou:      'Purchases',
};

export function buildSortLabel(
  sortKey: MetricType,
  selectedCampaignName: string | null,
): string {
  const metricLabel = METRIC_SORT_LABELS[sortKey] ?? sortKey;
  if (selectedCampaignName) {
    return `${metricLabel} · ${selectedCampaignName}`;
  }
  return metricLabel;
}
