// src/pages/AdminBilling.tsx
// Phase C: Admin-only Plans + Subscriptions. Auth enforced by RPCs (team_is_admin).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  Loader2,
  RefreshCw,
  Save,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

const ADMIN_UUID = 'ee2f8a30-27b6-49f8-8a00-cff679e9da14';

type Tab = 'plans' | 'subscriptions';

type PricingPlan = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  interval: string;
  amount_cents: number;
  currency: string;
  stripe_price_id: string;
  is_enabled: boolean;
  is_recommended: boolean;
  sort_order: number;
  available_in_upgrade: boolean;
};

type SubRow = {
  subscription_id: string;
  organization_id: string;
  organization_name: string | null;
  owner_user_id: string | null;
  owner_email: string | null;
  status: string | null;
  plan_name: string | null;
  billing_interval: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  stripe_schedule_id: string | null;
  pending_plan_name: string | null;
  pending_billing_interval: string | null;
  pending_effective_at: string | null;
};

function money(cents: number, currency = 'usd') {
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

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminBilling() {
  const { user } = useAuth();
  const isAdmin = user?.id === ADMIN_UUID;

  const [tab, setTab] = useState<Tab>('plans');
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PricingPlan>>({});
  const [subs, setSubs] = useState<SubRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeEnabled, setUpgradeEnabled] = useState<boolean | null>(null);
  const [savingUpgradeSwitch, setSavingUpgradeSwitch] = useState(false);

  const loadSettings = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('admin_get_billing_settings');
    if (err) {
      setError(err.message);
      return;
    }
    setUpgradeEnabled(Boolean((data as { upgrade_enabled?: boolean })?.upgrade_enabled));
  }, []);

  const toggleUpgradeEnabled = async (next: boolean) => {
    setSavingUpgradeSwitch(true);
    setMessage(null);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_set_upgrade_enabled', {
      p_enabled: next,
    });
    setSavingUpgradeSwitch(false);
    if (err) {
      setError(err.message);
      return;
    }
    const result = data as { success?: boolean; error?: string };
    if (!result?.success) {
      setError(result?.error || 'Save failed');
      return;
    }
    setUpgradeEnabled(next);
    setMessage(`Upgrade feature ${next ? 'enabled' : 'disabled'}.`);
  };

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_list_pricing_plans');
    setLoadingPlans(false);
    if (err) {
      setError(err.message);
      setPlans([]);
      return;
    }
    const rows = (data as PricingPlan[]) ?? [];
    setPlans(rows);
    const next: Record<string, PricingPlan> = {};
    rows.forEach((p) => {
      next[p.id] = { ...p };
    });
    setDrafts(next);
  }, []);

  const loadSubs = useCallback(async () => {
    setLoadingSubs(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_list_subscriptions');
    setLoadingSubs(false);
    if (err) {
      setError(err.message);
      setSubs([]);
      return;
    }
    setSubs((data as SubRow[]) ?? []);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void loadPlans();
    void loadSettings();
  }, [isAdmin, loadPlans, loadSettings]);

  useEffect(() => {
    if (!isAdmin || tab !== 'subscriptions') return;
    void loadSubs();
  }, [isAdmin, tab, loadSubs]);

  const filteredSubs = useMemo(() => {
    if (statusFilter === 'all') return subs;
    return subs.filter(
      (s) => (s.status || '').toLowerCase() === statusFilter.toLowerCase()
    );
  }, [subs, statusFilter]);

  const patchDraft = (id: string, patch: Partial<PricingPlan>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const savePlan = async (id: string) => {
    const d = drafts[id];
    if (!d) return;
    setSavingId(id);
    setMessage(null);
    setError(null);

    const { data, error: err } = await supabase.rpc('admin_update_pricing_plan', {
      p_id: id,
      p_name: d.name,
      p_description: d.description,
      p_stripe_price_id: d.stripe_price_id,
      p_amount_cents: d.amount_cents,
      p_is_enabled: d.is_enabled,
      p_is_recommended: d.is_recommended,
      p_sort_order: d.sort_order,
      p_available_in_upgrade: d.available_in_upgrade,
    });

    setSavingId(null);

    if (err) {
      setError(err.message);
      return;
    }

    const result = data as { success?: boolean; error?: string };
    if (!result?.success) {
      setError(result?.error || 'Save failed');
      return;
    }

    setMessage(`Saved plan ${d.code}.`);
    await loadPlans();
  };

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center space-y-2">
        <h1 className="text-xl font-bold text-white">Not authorized</h1>
        <p className="text-sm text-zinc-500">
          Admin Billing is restricted to the authorized operator account.
        </p>
        <Link to="/tree" className="text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white">
          Back to app
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          <CreditCard size={12} />
          Admin
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">Billing</h1>
          <Link
            to="/admin/customers"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-300 hover:text-white hover:border-zinc-600"
          >
            <Users size={13} />
            Team customers
          </Link>
        </div>
        <p className="text-xs text-zinc-500">
          Manage plan catalog and view subscriptions. Stripe Prices are created in Stripe Dashboard; paste Price IDs here.
        </p>
      </header>

      <div className="flex gap-2 border-b border-zinc-900 pb-2">
        {([
          ['plans', 'Plans'],
          ['subscriptions', 'Subscriptions'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest ${
              tab === id
                ? 'bg-zinc-900 text-white border border-zinc-700'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-xs text-green-300">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {tab === 'plans' && (
        <section className="space-y-4">
          <div className="bento-card p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 max-w-xl">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                Upgrade feature (existing paying customers)
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                When on, eligible paying owners can open Settings → Change plan and schedule a switch that
                starts at the end of their current billing period. When off, the page and both plan-change
                Edge Functions reject every request. Which plans appear there is set per plan below
                (“Available in Upgrade”), independently of the Pricing page.
              </p>
            </div>
            <label className="inline-flex items-center gap-3 text-xs text-zinc-200">
              <input
                type="checkbox"
                checked={upgradeEnabled === true}
                disabled={upgradeEnabled === null || savingUpgradeSwitch}
                onChange={(e) => void toggleUpgradeEnabled(e.target.checked)}
              />
              {upgradeEnabled === null
                ? 'Loading…'
                : upgradeEnabled
                ? 'Upgrade enabled'
                : 'Upgrade disabled'}
              {savingUpgradeSwitch && <Loader2 size={14} className="animate-spin" />}
            </label>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-200 leading-relaxed">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>
              Stripe recurring Price amounts are immutable. To change what customers are charged, create a
              <strong> new Price</strong> in Stripe, then paste the new <code className="text-amber-100">price_…</code> ID
              here. Display amount should match that Price.
            </span>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void loadPlans()}
              disabled={loadingPlans}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white"
            >
              <RefreshCw size={12} className={loadingPlans ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {loadingPlans && plans.length === 0 ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="animate-spin text-red-600" size={24} />
            </div>
          ) : (
            <div className="space-y-4">
              {plans.map((p) => {
                const d = drafts[p.id] ?? p;
                const placeholder = d.stripe_price_id.startsWith('REPLACE_ME_');
                return (
                  <div key={p.id} className="bento-card space-y-4 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          {p.code} · {p.interval}
                        </p>
                        <p className="text-sm font-bold text-white">{d.name}</p>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                        {d.is_recommended && (
                          <span className="px-2 py-0.5 rounded-full bg-red-600/15 text-red-400 border border-red-600/20">
                            Recommended
                          </span>
                        )}
                        <span
                          className={
                            d.is_enabled ? 'text-green-500' : 'text-zinc-500'
                          }
                        >
                          {d.is_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        Name
                        <input
                          value={d.name}
                          onChange={(e) => patchDraft(p.id, { name: e.target.value })}
                          className="mt-1.5 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white font-normal normal-case tracking-normal"
                        />
                      </label>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        Sort order
                        <input
                          type="number"
                          value={d.sort_order}
                          onChange={(e) =>
                            patchDraft(p.id, { sort_order: Number(e.target.value) || 0 })
                          }
                          className="mt-1.5 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white font-normal normal-case tracking-normal"
                        />
                      </label>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500 md:col-span-2">
                        Description
                        <input
                          value={d.description ?? ''}
                          onChange={(e) =>
                            patchDraft(p.id, { description: e.target.value })
                          }
                          className="mt-1.5 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white font-normal normal-case tracking-normal"
                        />
                      </label>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        Display amount (cents)
                        <input
                          type="number"
                          value={d.amount_cents}
                          onChange={(e) =>
                            patchDraft(p.id, {
                              amount_cents: Number(e.target.value) || 0,
                            })
                          }
                          className="mt-1.5 w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white font-normal normal-case tracking-normal"
                        />
                        <span className="mt-1 block text-[10px] font-normal normal-case text-zinc-600 tracking-normal">
                          Shows as {money(d.amount_cents, d.currency)} / {d.interval}
                        </span>
                      </label>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                        Stripe Price ID
                        <input
                          value={d.stripe_price_id}
                          onChange={(e) =>
                            patchDraft(p.id, { stripe_price_id: e.target.value })
                          }
                          className={`mt-1.5 w-full bg-zinc-950 border rounded-xl px-3 py-2 text-sm font-mono font-normal normal-case tracking-normal ${
                            placeholder
                              ? 'border-amber-600/50 text-amber-200'
                              : 'border-zinc-800 text-white'
                          }`}
                          placeholder="price_..."
                        />
                        {placeholder && (
                          <span className="mt-1 block text-[10px] font-normal normal-case text-amber-500/90 tracking-normal">
                            Placeholder — Checkout will reject this plan until you paste a real price_ ID.
                          </span>
                        )}
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                        <input
                          type="checkbox"
                          checked={d.is_enabled}
                          onChange={(e) =>
                            patchDraft(p.id, { is_enabled: e.target.checked })
                          }
                        />
                        Enabled on Pricing page
                      </label>
                      <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                        <input
                          type="checkbox"
                          checked={d.available_in_upgrade}
                          onChange={(e) =>
                            patchDraft(p.id, { available_in_upgrade: e.target.checked })
                          }
                        />
                        Available in Upgrade
                      </label>
                      <label className="inline-flex items-center gap-2 text-xs text-zinc-300">
                        <input
                          type="checkbox"
                          checked={d.is_recommended}
                          onChange={(e) =>
                            patchDraft(p.id, { is_recommended: e.target.checked })
                          }
                        />
                        Recommended
                      </label>
                      <button
                        type="button"
                        onClick={() => void savePlan(p.id)}
                        disabled={savingId === p.id}
                        className="ml-auto inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-white text-zinc-950 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 disabled:opacity-50"
                      >
                        {savingId === p.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Save size={14} />
                        )}
                        Save
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'subscriptions' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200"
            >
              <option value="all">All statuses</option>
              <option value="trialing">trialing</option>
              <option value="active">active</option>
              <option value="past_due">past_due</option>
              <option value="cancelled">cancelled</option>
            </select>
            <button
              type="button"
              onClick={() => void loadSubs()}
              disabled={loadingSubs}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white"
            >
              <RefreshCw size={12} className={loadingSubs ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {loadingSubs && subs.length === 0 ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="animate-spin text-red-600" size={24} />
            </div>
          ) : filteredSubs.length === 0 ? (
            <p className="text-sm text-zinc-500 py-10 text-center">No subscriptions match.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-zinc-900">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-zinc-900/50 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  <tr>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Organization</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Plan</th>
                    <th className="px-3 py-2">Interval</th>
                    <th className="px-3 py-2">Trial ends</th>
                    <th className="px-3 py-2">Period end</th>
                    <th className="px-3 py-2">Pending change</th>
                    <th className="px-3 py-2">Stripe cust</th>
                    <th className="px-3 py-2">Stripe sub</th>
                    <th className="px-3 py-2">Stripe schedule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/80">
                  {filteredSubs.map((s) => (
                    <tr key={s.subscription_id} className="text-zinc-300">
                      <td className="px-3 py-2 font-mono text-zinc-200 whitespace-nowrap">
                        {s.owner_email || '—'}
                      </td>
                      <td className="px-3 py-2 max-w-[140px] truncate" title={s.organization_name || ''}>
                        {s.organization_name || s.organization_id.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2">{s.status || '—'}</td>
                      <td className="px-3 py-2">{s.plan_name || '—'}</td>
                      <td className="px-3 py-2">{s.billing_interval || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(s.trial_ends_at)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(s.current_period_end)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {s.pending_plan_name
                          ? `${s.pending_plan_name} (${s.pending_billing_interval || '?'}) on ${fmtDate(
                              s.pending_effective_at
                            )}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-zinc-500 max-w-[100px] truncate">
                        {s.stripe_customer_id || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-zinc-500 max-w-[100px] truncate">
                        {s.stripe_subscription_id || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-zinc-500 max-w-[100px] truncate">
                        {s.stripe_schedule_id || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
