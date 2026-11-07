import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useMyTeam, type TeamMember } from '../lib/useMyTeam';
import { Loader2, Users } from 'lucide-react';

export default function Team() {
  const { customer, members, loading, error, refresh } = useMyTeam();
  const [emailsText, setEmailsText] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const parseEmails = (text: string): string[] =>
    text
      .split(/[\s,;]+/)
      .map(s => s.trim())
      .filter(Boolean);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setFormError(null);

    try {
      const emails = parseEmails(emailsText);
      if (emails.length === 0) {
        setFormError('Paste at least one email.');
        setSaving(false);
        return;
      }

      const { data, error: rpcErr } = await supabase.rpc('owner_add_members', {
        p_emails: emails,
      });

      if (rpcErr) throw rpcErr;

      const result = data as {
        success?: boolean;
        error?: string;
        added?: number;
        remaining?: number;
        skipped?: Array<{ email?: string; reason?: string }>;
      };

      if (!result?.success) {
        setFormError(
          result?.error === 'over_limit'
            ? `Over limit. Remaining slots: ${result.remaining ?? 0}.`
            : result?.error ?? 'Add failed'
        );
      } else {
        const skippedCount = Array.isArray(result.skipped) ? result.skipped.length : 0;
        setMessage(
          `Added ${result.added ?? 0}. Remaining ${result.remaining ?? 0}.` +
            (skippedCount > 0 ? ` Skipped ${skippedCount}.` : '')
        );
        setEmailsText('');
        refresh();
      }
    } catch (err: any) {
      console.error('[Team] add', err);
      setFormError(err?.message ?? 'Add failed');
    } finally {
      setSaving(false);
    }
  };

  // Deactivate / reactivate one member. Never frees a slot: the row stays, only access changes.
  const handleSetAccess = async (m: TeamMember, active: boolean) => {
    if (
      !active &&
      !window.confirm(`Deactivate ${m.email}? They lose access now, and the slot stays used.`)
    ) {
      return;
    }
    setBusyId(m.id);
    setMessage(null);
    setFormError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('owner_set_member_access', {
        p_member_id: m.id,
        p_active: active,
      });
      if (rpcErr) throw rpcErr;

      const result = data as { success?: boolean; error?: string };
      if (!result?.success) {
        setFormError(
          result?.error === 'revoked_by_admin'
            ? 'This member was deactivated by VSTRK. Contact us to reactivate.'
            : result?.error ?? 'Update failed'
        );
      } else {
        setMessage(
          active
            ? `Reactivated ${m.email}.`
            : `Deactivated ${m.email}. The slot stays used.`
        );
        refresh();
      }
    } catch (err: any) {
      console.error('[Team] set access', err);
      setFormError(err?.message ?? 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="text-red-600 animate-spin" size={28} />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="max-w-lg mx-auto text-center space-y-3 py-16">
        <Users className="mx-auto text-zinc-600" size={28} />
        <h1 className="text-xl font-bold text-white">Team</h1>
        <p className="text-sm text-zinc-500">
          {error ?? 'You are not an approved Team Owner for any Customer.'}
        </p>
      </div>
    );
  }

  const used = members.length;
  const remaining = Math.max(0, customer.member_limit - used);

  return (
    <div className="space-y-8 max-w-2xl">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          <Users size={12} />
          Team
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{customer.name}</h1>
        <p className="text-xs text-zinc-500">
          {used} / {customer.member_limit} slots used · {remaining} remaining
          {customer.status !== 'active' && (
            <span className="text-amber-400"> · Customer inactive</span>
          )}
        </p>
      </header>

      {message && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-xs text-green-300">
          {message}
        </div>
      )}
      {formError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {formError}
        </div>
      )}

      <form onSubmit={handleAdd} className="bento-card space-y-4">
        <div className="text-sm font-bold text-white">Add Member Emails</div>
        <p className="text-[11px] text-zinc-500">
          Emails become permanent slots. They cannot be edited or removed after creation.
          Deactivating a member stops their access but keeps the slot used.
        </p>
        <textarea
          value={emailsText}
          onChange={e => setEmailsText(e.target.value)}
          rows={5}
          disabled={customer.status !== 'active' || remaining === 0}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-sm text-white font-mono focus:border-red-600 outline-none resize-y disabled:opacity-40"
          placeholder={'alice@gmail.com\nbob@gmail.com'}
        />
        <button
          type="submit"
          disabled={saving || customer.status !== 'active' || remaining === 0}
          className="w-full bg-white text-zinc-950 h-11 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {saving ? <Loader2 className="animate-spin" size={14} /> : 'Add Members'}
        </button>
      </form>

      <section className="bento-card space-y-3">
        <h2 className="text-sm font-bold text-white">Members</h2>
        <ul className="space-y-2">
          {members.map(m => {
            const pending = m.status !== 'active';
            const revoked = !pending && m.access_revoked_by != null;
            const label = pending
              ? 'pending'
              : m.access_revoked_by === 'admin'
                ? 'deactivated by admin'
                : revoked
                  ? 'deactivated'
                  : 'active';
            const canToggle =
              m.role !== 'owner' &&
              !pending &&
              customer.status === 'active' &&
              m.access_revoked_by !== 'admin';
            return (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 text-[12px] border-b border-zinc-900/80 pb-2 last:border-0"
              >
                <div className="min-w-0">
                  <div className="font-mono text-zinc-300 truncate">{m.email}</div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-600 mt-0.5">
                    {m.role}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-3">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-widest ${
                      label === 'active'
                        ? 'text-green-500'
                        : revoked
                          ? 'text-amber-400'
                          : 'text-zinc-500'
                    }`}
                  >
                    {label}
                  </span>
                  {canToggle && (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void handleSetAccess(m, revoked)}
                      className="px-3 py-1.5 rounded-md border border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:text-white text-[10px] font-bold uppercase tracking-widest disabled:opacity-40"
                    >
                      {busyId === m.id ? (
                        <Loader2 className="animate-spin" size={12} />
                      ) : revoked ? (
                        'Reactivate'
                      ) : (
                        'Deactivate'
                      )}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
