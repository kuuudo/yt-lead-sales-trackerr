import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Plus, Power, Users } from 'lucide-react';

type CustomerRow = {
  id: string;
  name: string;
  member_limit: number;
  status: string;
  created_at: string;
};

type MemberRow = {
  id: string;
  customer_id: string;
  email: string;
  role: string;
  status: string;
};

export default function AdminCustomers() {
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [membersByCustomer, setMembersByCustomer] = useState<Record<string, MemberRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [memberLimit, setMemberLimit] = useState(100);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [emailsText, setEmailsText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: custs, error: cErr } = await supabase
        .from('customers')
        .select('id, name, member_limit, status, created_at')
        .order('created_at', { ascending: false });

      if (cErr) throw cErr;

      const list = (custs ?? []) as CustomerRow[];
      setCustomers(list);

      if (list.length > 0) {
        const ids = list.map(c => c.id);
        const { data: mems, error: mErr } = await supabase
          .from('customer_members')
          .select('id, customer_id, email, role, status')
          .in('customer_id', ids)
          .order('created_at', { ascending: true });

        if (mErr) throw mErr;

        const map: Record<string, MemberRow[]> = {};
        for (const m of (mems ?? []) as MemberRow[]) {
          (map[m.customer_id] ??= []).push(m);
        }
        setMembersByCustomer(map);
      } else {
        setMembersByCustomer({});
      }
    } catch (err: any) {
      console.error('[AdminCustomers] load', err);
      setError(err?.message ?? 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const parseEmails = (text: string): string[] =>
    text
      .split(/[\s,;]+/)
      .map(s => s.trim())
      .filter(Boolean);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const emails = parseEmails(emailsText);
      const { data, error: rpcErr } = await supabase.rpc('admin_create_customer', {
        p_name: name.trim(),
        p_member_limit: memberLimit,
        p_owner_email: ownerEmail.trim(),
        p_emails: emails,
      });

      if (rpcErr) throw rpcErr;

      const result = data as { success?: boolean; error?: string; customer_id?: string; members_added?: number; skipped?: unknown };
      if (!result?.success) {
        setError(result?.error ?? 'Create failed');
      } else {
        setMessage(
          `Created customer ${result.customer_id}. Members added: ${result.members_added ?? 0}.`
        );
        setName('');
        setOwnerEmail('');
        setEmailsText('');
        setMemberLimit(100);
        await load();
      }
    } catch (err: any) {
      console.error('[AdminCustomers] create', err);
      setError(err?.message ?? 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSetStatus = async (customerId: string, status: 'active' | 'inactive') => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('admin_set_customer_status', {
        p_customer_id: customerId,
        p_status: status,
      });
      if (rpcErr) throw rpcErr;
      const result = data as { success?: boolean; error?: string };
      if (!result?.success) {
        setError(result?.error ?? 'Status update failed');
      } else {
        setMessage(`Customer set to ${status}.`);
        await load();
      }
    } catch (err: any) {
      console.error('[AdminCustomers] status', err);
      setError(err?.message ?? 'Status update failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="text-red-600 animate-spin" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          <Users size={12} />
          Kaksi Admin
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Customers</h1>
        <p className="text-xs text-zinc-500">
          Pre-register a Customer and Owner email. Membership emails are permanent slots.
        </p>
      </header>

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

      <form onSubmit={handleCreate} className="bento-card space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Plus size={16} />
          Create Customer
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="label-caps">Customer Name</label>
            <input
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-sm text-white focus:border-red-600 outline-none"
              placeholder="ABC Company"
            />
          </div>
          <div className="space-y-1">
            <label className="label-caps">Member Limit (includes Owner)</label>
            <input
              required
              type="number"
              min={1}
              value={memberLimit}
              onChange={e => setMemberLimit(Number(e.target.value) || 1)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-sm text-white focus:border-red-600 outline-none"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="label-caps">Owner Email</label>
          <input
            required
            type="email"
            value={ownerEmail}
            onChange={e => setOwnerEmail(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-sm text-white focus:border-red-600 outline-none"
            placeholder="owner@company.com"
          />
        </div>

        <div className="space-y-1">
          <label className="label-caps">Member Emails (optional, one per line or comma-separated)</label>
          <textarea
            value={emailsText}
            onChange={e => setEmailsText(e.target.value)}
            rows={6}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-sm text-white font-mono focus:border-red-600 outline-none resize-y"
            placeholder={'alice@gmail.com\nbob@gmail.com'}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-white text-zinc-950 h-11 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {saving ? <Loader2 className="animate-spin" size={14} /> : 'Create Customer'}
        </button>
      </form>

      <section className="space-y-4">
        <h2 className="text-sm font-bold text-white uppercase tracking-widest">Existing Customers</h2>
        {customers.length === 0 && (
          <p className="text-xs text-zinc-500">No customers yet.</p>
        )}
        {customers.map(c => {
          const mems = membersByCustomer[c.id] ?? [];
          const used = mems.length;
          return (
            <div key={c.id} className="bento-card space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-bold text-white">{c.name}</div>
                  <div className="text-[10px] text-zinc-500 font-mono mt-1">{c.id}</div>
                  <div className="text-[11px] text-zinc-400 mt-2">
                    Limit {c.member_limit} · Used {used} · Status{' '}
                    <span className={c.status === 'active' ? 'text-green-400' : 'text-amber-400'}>
                      {c.status}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    void handleSetStatus(c.id, c.status === 'active' ? 'inactive' : 'active')
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-white text-[10px] font-bold uppercase tracking-widest"
                >
                  <Power size={12} />
                  {c.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
              </div>
              <ul className="space-y-1 border-t border-zinc-800 pt-3">
                {mems.map(m => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between text-[11px] font-mono text-zinc-400"
                  >
                    <span>
                      {m.email}{' '}
                      <span className="text-zinc-600">({m.role})</span>
                    </span>
                    <span className={m.status === 'active' ? 'text-green-500' : 'text-zinc-500'}>
                      {m.status}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>
    </div>
  );
}
