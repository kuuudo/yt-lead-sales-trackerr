// src/lib/pricingPlans.ts
// Single source of truth for the plan shape + display helpers.
// Used by BOTH Pricing.tsx (first purchase) and Upgrade.tsx (plan change),
// so the two pages can never drift apart. Data always comes from pricing_plans.

export type PricingPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  interval: 'week' | 'month' | 'year' | string;
  amount_cents: number;
  currency: string;
  is_recommended: boolean;
  sort_order: number;
};

// Columns both pages select from pricing_plans (never stripe_price_id).
export const PLAN_DISPLAY_COLUMNS =
  'id, code, name, description, interval, amount_cents, currency, is_recommended, sort_order';

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(0)}`;
  }
}

export function intervalLabel(interval: string): string {
  if (interval === 'week') return '/week';
  if (interval === 'year') return '/year';
  return '/month';
}

export function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}
