// src/pages/FloatingStatsControl.tsx
// Private founder-only page: choose which of the 11 metrics the Floating Stats overlay shows.
// This page only edits a visibility list. It never calculates metrics and never shows the overlay
// (the Chrome extension has no content script on this site).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Save, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  OVERLAY_METRICS,
  fetchGlobalHiddenMetrics,
  saveGlobalHiddenMetrics,
} from '../lib/vstrkOverlay';

// Same founder/operator account AdminBilling.tsx authorizes (its ADMIN_UUID). Not a new id.
const KAKSI_UUID = 'ee2f8a30-27b6-49f8-8a00-cff679e9da14';

const ALL_KEYS: string[] = OVERLAY_METRICS.map((m) => m.key);
const KNOWN = new Set<string>(ALL_KEYS);

const knownOnly = (list: string[]): Set<string> => new Set(list.filter((k) => KNOWN.has(k)));
const sameSet = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && Array.from(a).every((x) => b.has(x));

export default function FloatingStatsControl() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = user?.id === KAKSI_UUID;

  // hidden = metrics turned OFF. saved = what the server currently returns to everyone.
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = knownOnly(await fetchGlobalHiddenMetrics());
      setSaved(list);
      setHidden(new Set(list));
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return; // never query anything for other accounts
    void load();
  }, [isAdmin, load]);

  const dirty = useMemo(() => !sameSet(saved, hidden), [saved, hidden]);
  const onCount = ALL_KEYS.length - hidden.size;

  const toggle = (key: string) => {
    setMessage(null);
    setError(null);
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setAll = (on: boolean) => {
    setMessage(null);
    setError(null);
    setHidden(on ? new Set() : new Set(ALL_KEYS));
  };

  const save = async () => {
    if (!user || !isAdmin) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await saveGlobalHiddenMetrics(user.id, Array.from(hidden));
    } catch (e: any) {
      setSaving(false);
      setError(e?.message || 'Save failed.');
      return;
    }
    // Read back exactly what every customer's snapshot will read, to prove it was stored.
    try {
      const confirmed = knownOnly(await fetchGlobalHiddenMetrics());
      setSaved(confirmed);
      if (sameSet(confirmed, hidden)) {
        setMessage('Saved. It applies the next time someone uses Open Original Post.');
      } else {
        setError('Saved, but the shared setting did not change. Check that the SQL function is installed for the founder row.');
      }
    } catch (e: any) {
      setError(`Saved, but could not verify it: ${e?.message || 'read failed'}`);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="text-red-600 animate-spin" size={28} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center space-y-2">
        <ShieldAlert className="mx-auto text-amber-500" size={28} />
        <h1 className="text-xl font-bold text-white">Not authorized</h1>
        <p className="text-sm text-zinc-500">Floating Stats Control is restricted to the authorized operator account.</p>
        <Link to="/tree" className="text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-white">
          Back to app
        </Link>
      </div>
    );
  }

  const status = saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved';

  return (
    <div className="space-y-6 max-w-2xl">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          <SlidersHorizontal size={12} />
          Admin
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Floating Stats Control</h1>
        <p className="text-xs text-zinc-500">
          Choose which metrics the Floating Stats extension shows for everyone. Visibility only; no metric calculation changes.
        </p>
      </header>

      {message && (
        <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-xs text-green-300">{message}</div>
      )}
      {(error || loadError) && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error || loadError}
          {loadError && (
            <button type="button" onClick={() => void load()} className="ml-3 underline hover:text-red-100">
              Retry
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="animate-spin text-red-600" size={24} />
        </div>
      ) : (
        <section className="bento-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">
              {onCount} of {ALL_KEYS.length} ON
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setAll(true)}
                className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-[10px] font-bold uppercase tracking-widest text-zinc-300 hover:text-white disabled:opacity-40"
              >
                Turn all ON
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setAll(false)}
                className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-[10px] font-bold uppercase tracking-widest text-zinc-300 hover:text-white disabled:opacity-40"
              >
                Turn all OFF
              </button>
            </div>
          </div>

          {onCount === 0 && (
            <p className="text-[11px] text-amber-300">
              All OFF disables Floating Stats: “Open Original Post” will open the post normally with no overlay.
            </p>
          )}

          <ul className="divide-y divide-zinc-900">
            {OVERLAY_METRICS.map((m) => {
              const on = !hidden.has(m.key);
              return (
                <li key={m.key} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white">{m.label}</div>
                    <div className="text-[10px] font-mono text-zinc-600">{m.key}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`w-8 text-right text-[10px] font-black uppercase tracking-widest ${
                        on ? 'text-green-400' : 'text-zinc-600'
                      }`}
                    >
                      {on ? 'ON' : 'OFF'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`${m.label} ${on ? 'ON' : 'OFF'}`}
                      disabled={saving}
                      onClick={() => toggle(m.key)}
                      className={`relative w-11 h-6 rounded-full border transition-colors disabled:opacity-50 ${
                        on ? 'bg-green-600 border-green-500' : 'bg-zinc-800 border-zinc-700'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                          on ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-900">
            <span className={`text-[11px] font-bold ${dirty && !saving ? 'text-amber-300' : 'text-zinc-500'}`}>{status}</span>
            <button
              type="button"
              disabled={saving || !dirty}
              onClick={() => void save()}
              className="inline-flex items-center gap-2 px-4 h-10 rounded-xl bg-white text-zinc-950 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 disabled:opacity-40"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save changes
            </button>
          </div>
        </section>
      )}
    </div>
  );
}