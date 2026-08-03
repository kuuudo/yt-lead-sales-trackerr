import React, { useEffect, useState } from 'react';
import { Globe, Plus, Star, Trash2, Ban, Loader2, Copy, Check, ShieldCheck, CircleHelp, ChevronDown, ChevronRight } from 'lucide-react';
import { useOrganization } from '../lib/useOrganization';
import {
  listBrandedDomains,
  addBrandedDomain,
  setDefaultDomain,
  disableDomain,
  deleteDomain,
  verifyDomain,
  type BrandedTrackingDomain,
} from '../services/domain/brandedDomains';

export default function TrackingDomains() {
  const { organizationId } = useOrganization();

  const [domains, setDomains] = useState<BrandedTrackingDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [newHostname, setNewHostname] = useState('');
  const [adding, setAdding] = useState(false);
  // Tracks which specific field was just copied, e.g. "abc123:txt" or
  // "abc123:cname" — scoped per domain+field since each pending domain
  // now renders its own persistent TXT/CNAME block.
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<{ id: string; text: string } | null>(null);
  // 'checking' shows immediately on click. Flips to 'connecting' only if
  // the request is still pending after CONNECTING_DELAY_MS — if the
  // response comes back before that, verifyingRef is already cleared and
  // the timer callback is a no-op. No artificial minimum display time
  // for either stage.
  const [verifyStage, setVerifyStage] = useState<'checking' | 'connecting' | null>(null);
  const verifyingRef = React.useRef<string | null>(null);
  const CONNECTING_DELAY_MS = 1500;

  // Tab-open auto-poll: after a manual Verify leaves a domain still
  // pending, silently recheck every POLL_INTERVAL_MS without requiring
  // another click. Capped at MAX_POLL_ATTEMPTS so a domain left pending
  // for hours doesn't poll forever — after the cap, it just falls back
  // to the existing manual Verify button. Nothing here talks to a job
  // queue or cron; it's plain setInterval, cleared on unmount, on
  // success, on delete, or once verification reaches its final state.
  const pollTimersRef = React.useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const pollAttemptsRef = React.useRef<Record<string, number>>({});
  const [autoPollingIds, setAutoPollingIds] = useState<Set<string>>(new Set());
  const POLL_INTERVAL_MS = 10000;
  const MAX_POLL_ATTEMPTS = 18; // ~3 minutes of silent background rechecking

  // DNS section is collapsible for every domain, not just pending ones —
  // the instructions never fully disappear, they just tuck away. Default
  // state depends on status the FIRST time a domain is seen (pending =
  // open, verified/failed = closed), and flips closed automatically the
  // moment a domain transitions into verified. After that, the user's
  // manual toggle is the only thing that changes it — this effect never
  // re-collapses something the user deliberately reopened.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const prevStatusRef = React.useRef<Record<string, string>>({});

  useEffect(() => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      domains.forEach((d) => {
        const prevStatus = prevStatusRef.current[d.id];
        if (prevStatus === undefined) {
          // First time seeing this domain this session.
          if (d.status === 'pending') {
            next.add(d.id);
            changed = true;
          }
        } else if (prevStatus !== 'verified' && d.status === 'verified') {
          // Just verified — auto-collapse once.
          if (next.has(d.id)) {
            next.delete(d.id);
            changed = true;
          }
        }
        prevStatusRef.current[d.id] = d.status;
      });
      return changed ? next : prev;
    });
  }, [domains]);

  const toggleExpanded = (domainId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(domainId)) next.delete(domainId);
      else next.add(domainId);
      return next;
    });
  };

  const stopAutoPoll = (domainId: string) => {
    const timer = pollTimersRef.current[domainId];
    if (timer) {
      clearInterval(timer);
      delete pollTimersRef.current[domainId];
    }
    delete pollAttemptsRef.current[domainId];
    setAutoPollingIds((prev) => {
      if (!prev.has(domainId)) return prev;
      const next = new Set(prev);
      next.delete(domainId);
      return next;
    });
  };

  const startAutoPoll = (domainId: string) => {
    if (pollTimersRef.current[domainId]) return; // already polling this one
    pollAttemptsRef.current[domainId] = 0;
    setAutoPollingIds((prev) => new Set(prev).add(domainId));

    pollTimersRef.current[domainId] = setInterval(async () => {
      pollAttemptsRef.current[domainId] = (pollAttemptsRef.current[domainId] || 0) + 1;
      if (pollAttemptsRef.current[domainId] > MAX_POLL_ATTEMPTS) {
        stopAutoPoll(domainId);
        return;
      }

      // Silent — deliberately does not touch verifyingId/verifyStage/
      // verifyMessage, so it never flickers the manual "Checking DNS…"
      // / "Connecting your domain…" UI. Only acts on a confirmed success.
      const result = await verifyDomain(domainId);
      if (result?.status === 'verified') {
        stopAutoPoll(domainId);
        await refresh();
      }
    }, POLL_INTERVAL_MS);
  };

  useEffect(() => {
    return () => {
      Object.keys(pollTimersRef.current).forEach(stopAutoPoll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = async () => {
    if (!organizationId) return;
    setLoading(true);
    const rows = await listBrandedDomains(organizationId);
    setDomains(rows);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const handleAdd = async () => {
    if (!organizationId || !newHostname.trim()) return;
    setAdding(true);
    setActionError(null);

    const result = await addBrandedDomain(organizationId, newHostname);

    if (!result) {
      setActionError('Failed to add domain. Check the hostname and try again.');
      setAdding(false);
      return;
    }

    setNewHostname('');
    setAdding(false);
    await refresh();
  };

  const handleSetDefault = async (domainId: string) => {
    if (!organizationId) return;
    const ok = await setDefaultDomain(organizationId, domainId);
    if (!ok) setActionError('Failed to set default domain.');
    await refresh();
  };

  const handleDisable = async (domainId: string) => {
    const ok = await disableDomain(domainId);
    if (!ok) setActionError('Failed to disable domain.');
    await refresh();
  };

  const handleDelete = async (domainId: string, hostname: string) => {
    const confirmed = window.confirm(
      `Delete ${hostname}? Existing links generated with this domain will stop working. This cannot be undone.`
    );
    if (!confirmed) return;

    stopAutoPoll(domainId);
    const ok = await deleteDomain(domainId);
    if (!ok) setActionError('Failed to delete domain.');
    await refresh();
  };

const handleVerify = async (domainId: string) => {
  setVerifyingId(domainId);
  setVerifyMessage(null);
  setVerifyStage('checking');
  verifyingRef.current = domainId;

  const stageTimer = setTimeout(() => {
    if (verifyingRef.current === domainId) setVerifyStage('connecting');
  }, CONNECTING_DELAY_MS);

  const result = await verifyDomain(domainId);
  clearTimeout(stageTimer);
  verifyingRef.current = null;

  if (!result) {
    setVerifyMessage({
      id: domainId,
      text: 'Verification check failed — try again.',
    });
  } else if (result.status === 'verified') {
    setVerifyMessage(null);
  } else {
    setVerifyMessage({
      id: domainId,
      text: result.error || 'TXT record not found yet. DNS changes can take time to propagate.',
    });
    startAutoPoll(domainId);
  }

  setVerifyingId(null);
  setVerifyStage(null);
  await refresh();
};
  
  const copyValue = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
  };

  // Vercel's static, general-purpose CNAME target. Not project-specific —
  // the dashboard shows a per-project dynamic value (e.g.
  // 67b3aa673c5fb184.vercel-dns-017.com) but that value isn't exposed via
  // the REST API on domain add, and Vercel confirms the static value
  // continues to work indefinitely. Using it here avoids a second Vercel
  // API round-trip just to fetch a display string.
  const CNAME_TARGET = 'cname.vercel-dns.com';

  // Best-effort "subdomain only" label for display, e.g.
  // "lucky.kaksidigitals.com" -> "lucky". Assumes a standard two-label
  // root (name.tld) — for a domain on a multi-part public suffix like
  // "shop.co.uk" this would incorrectly treat "co.uk" as the root and
  // return "shop" when more of the label should be kept. Not a problem
  // for .com/.io/etc. roots, but worth knowing if domains ever expand
  // beyond that. This is display-only; verify-domain.ts always resolves
  // against the full hostname regardless of what's shown here.
  const shortLabel = (hostname: string): string => {
    const parts = hostname.split('.');
    return parts.length > 2 ? parts.slice(0, -2).join('.') : hostname;
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 mb-8">
        <Globe className="text-red-600" size={20} />
        <h1 className="text-sm font-black uppercase tracking-[0.2em] text-white">
          Custom Tracking Domains
        </h1>
      </div>

      {/* Add domain */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-5 mb-6">
        <div className="flex gap-3">
          <input
            type="text"
            value={newHostname}
            onChange={(e) => setNewHostname(e.target.value)}
            placeholder="go.yourdomain.com"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-red-600"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newHostname.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
          >
            {adding ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
            Add Domain
          </button>
        </div>

        {actionError && (
          <p className="text-red-500 text-xs mt-3">{actionError}</p>
        )}
      </div>

      {/* Domain list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="text-zinc-600 animate-spin" size={24} />
        </div>
      ) : domains.length === 0 ? (
        <p className="text-zinc-600 text-sm text-center py-12">No custom domains yet.</p>
      ) : (
        <div className="space-y-3">
          {(() => {
            const hasAnyDefault = domains.some((dom) => dom.is_default);
            return domains.map((d) => (
            <div
               key={d.id}
               className="bg-zinc-900/50 border border-zinc-800 rounded-lg px-4 py-3"
             >
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-100 font-medium">{d.hostname}</span>
                <span
                  className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${
                    d.status === 'verified'
                      ? 'bg-green-500/10 text-green-500'
                      : d.status === 'failed'
                      ? 'bg-red-500/10 text-red-500'
                      : 'bg-zinc-800 text-zinc-500'
                  }`}
                >
                  {d.status}
                </span>
                {d.is_default && (
                  <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-violet-500/10 text-violet-400">
                    Default
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3">
  {d.status === 'pending' && (
    <button
      onClick={() => handleVerify(d.id)}
      disabled={verifyingId === d.id}
      title="Check DNS verification"
      className="flex items-center gap-1.5 text-zinc-500 hover:text-green-500 transition-colors disabled:opacity-50"
    >
      {verifyingId === d.id ? (
        <Loader2 className="animate-spin" size={14} />
      ) : (
        <ShieldCheck size={14} />
      )}
      <span className="text-[9px] font-bold uppercase tracking-widest">
        Verify
      </span>
    </button>
  )}

  {d.status === 'verified' && !d.is_default && (
  <div className="flex items-center gap-2">
    <button
      onClick={() => handleSetDefault(d.id)}
      className={
        hasAnyDefault
          ? 'flex items-center gap-1.5 px-2 py-1 rounded-md border border-zinc-700 text-zinc-300 hover:border-violet-500 hover:text-violet-400 transition-colors'
          : 'flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white transition-colors'
      }
    >
      <Star size={14} />
      <span className="text-[10px] font-bold uppercase tracking-widest">
        Set Default
      </span>
    </button>

    <button
      title={`Set this as your default tracking domain.

New tracking links will use this domain instead of vstrk.com.

Example:
vstrk.com/abc123
↓
${d.hostname}/abc123`}
      className="text-zinc-500 hover:text-zinc-300 transition-colors"
    >
      <CircleHelp size={14} />
    </button>
  </div>
)}
                {d.is_default && (
                  <button
                    onClick={() => handleDisable(d.id)}
                    title="Disable"
                    className="text-zinc-500 hover:text-yellow-500 transition-colors"
                  >
                    <Ban size={14} />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(d.id, d.hostname)}
                  title="Delete"
                  className="text-zinc-500 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
               </button>
              </div>
            </div>

            {d.status === 'verified' && !d.is_default && !hasAnyDefault && (
              <p className="text-violet-400/80 text-[10px] mt-2">
                This domain is verified and ready — set it as default to start using it on new links.
              </p>
            )}

            {d.verification_token && (
              <div className="mt-3">
                <button
                  onClick={() => toggleExpanded(d.id)}
                  className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors text-[11px] font-medium"
                >
                  {expandedIds.has(d.id) ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                  {d.status === 'verified' ? 'View DNS configuration' : 'DNS setup instructions'}
                </button>

                {expandedIds.has(d.id) && (
                  <div className="mt-2 bg-white border border-zinc-200 rounded-lg p-5 space-y-4 text-zinc-800">
                    <div className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-500 text-[11px] font-medium flex items-center justify-center flex-shrink-0">1</span>
                      <div>
                        <p className="text-[13px] font-medium mb-0.5">Open your DNS provider</p>
                        <p className="text-[12px] text-zinc-500">Sign in where you manage this domain — for example Cloudflare, GoDaddy, Namecheap, or Porkbun.</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-500 text-[11px] font-medium flex items-center justify-center flex-shrink-0">2</span>
                      <p className="text-[13px] font-medium">Go to DNS, or DNS records</p>
                    </div>

                    <div className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-500 text-[11px] font-medium flex items-center justify-center flex-shrink-0">3</span>
                      <p className="text-[13px] font-medium">Click "Add record"</p>
                    </div>

                    <div className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-500 text-[11px] font-medium flex items-center justify-center flex-shrink-0">4</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium mb-2">Create the TXT record</p>
                        <table className="w-full text-[12px] border-collapse">
                          <tbody>
                            <tr>
                              <td className="text-zinc-500 py-1 pr-2 w-14 align-top">Type</td>
                              <td className="py-1" colSpan={2}>
                                <code className="bg-zinc-100 rounded px-2 py-0.5">TXT</code>
                              </td>
                            </tr>
                            <tr>
                              <td className="text-zinc-500 py-1 pr-2 align-top">Name</td>
                              <td className="py-1 pr-2 truncate">
                                <code className="bg-zinc-100 rounded px-2 py-0.5">_vstrk-verify.{shortLabel(d.hostname)}</code>
                              </td>
                              <td className="py-1 text-right">
                                <button
                                  onClick={() => copyValue(`${d.id}:txtname`, `_vstrk-verify.${shortLabel(d.hostname)}`)}
                                  className="text-zinc-400 hover:text-zinc-700 transition-colors"
                                  title="Copy name"
                                >
                                  {copiedKey === `${d.id}:txtname` ? (
                                    <Check size={13} className="text-green-600" />
                                  ) : (
                                    <Copy size={13} />
                                  )}
                                </button>
                              </td>
                            </tr>
                            <tr>
                              <td className="text-zinc-500 py-1 pr-2 align-top">Value</td>
                              <td className="py-1 pr-2 truncate">
                                <code className="bg-zinc-100 rounded px-2 py-0.5">{d.verification_token}</code>
                              </td>
                              <td className="py-1 text-right">
                                <button
                                  onClick={() => copyValue(`${d.id}:txt`, d.verification_token!)}
                                  className="text-zinc-400 hover:text-zinc-700 transition-colors"
                                  title="Copy value"
                                >
                                  {copiedKey === `${d.id}:txt` ? (
                                    <Check size={13} className="text-green-600" />
                                  ) : (
                                    <Copy size={13} />
                                  )}
                                </button>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-500 text-[11px] font-medium flex items-center justify-center flex-shrink-0">5</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium mb-2">Create the CNAME record</p>
                        <table className="w-full text-[12px] border-collapse">
                          <tbody>
                            <tr>
                              <td className="text-zinc-500 py-1 pr-2 w-14 align-top">Type</td>
                              <td className="py-1" colSpan={2}>
                                <code className="bg-zinc-100 rounded px-2 py-0.5">CNAME</code>
                              </td>
                            </tr>
                            <tr>
                              <td className="text-zinc-500 py-1 pr-2 align-top">Name</td>
                              <td className="py-1 pr-2 truncate">
                                <code className="bg-zinc-100 rounded px-2 py-0.5">{shortLabel(d.hostname)}</code>
                              </td>
                              <td className="py-1 text-right">
                                <button
                                  onClick={() => copyValue(`${d.id}:cnamename`, shortLabel(d.hostname))}
                                  className="text-zinc-400 hover:text-zinc-700 transition-colors"
                                  title="Copy name"
                                >
                                  {copiedKey === `${d.id}:cnamename` ? (
                                    <Check size={13} className="text-green-600" />
                                  ) : (
                                    <Copy size={13} />
                                  )}
                                </button>
                              </td>
                            </tr>
                            <tr>
                              <td className="text-zinc-500 py-1 pr-2 align-top">Target</td>
                              <td className="py-1 pr-2 truncate">
                                <code className="bg-zinc-100 rounded px-2 py-0.5">{CNAME_TARGET}</code>
                              </td>
                              <td className="py-1 text-right">
                                <button
                                  onClick={() => copyValue(`${d.id}:cname`, CNAME_TARGET)}
                                  className="text-zinc-400 hover:text-zinc-700 transition-colors"
                                  title="Copy target"
                                >
                                  {copiedKey === `${d.id}:cname` ? (
                                    <Check size={13} className="text-green-600" />
                                  ) : (
                                    <Copy size={13} />
                                  )}
                                </button>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <p className="text-zinc-400 text-[11px]">
                      Most DNS providers only need the short name shown above. If yours asks for the full hostname instead, use <code className="bg-zinc-100 rounded px-1">_vstrk-verify.{d.hostname}</code> and <code className="bg-zinc-100 rounded px-1">{d.hostname}</code>.
                    </p>

                    {d.status === 'pending' ? (
                      <div className="flex gap-3">
                        <span className="w-5 h-5 rounded-full bg-zinc-100 text-zinc-500 text-[11px] font-medium flex items-center justify-center flex-shrink-0">6</span>
                        <div className="flex-1">
                          <p className="text-[13px] font-medium mb-2">Wait a few minutes, then verify</p>
                          <button
                            onClick={() => handleVerify(d.id)}
                            disabled={verifyingId === d.id}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-red-600 hover:bg-red-500 disabled:bg-zinc-300 disabled:text-zinc-500 text-white text-[11px] font-bold uppercase tracking-widest transition-colors"
                          >
                            {verifyingId === d.id ? (
                              <Loader2 className="animate-spin" size={14} />
                            ) : (
                              <ShieldCheck size={14} />
                            )}
                            Verify domain
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-zinc-400 text-[11px] pt-1 border-t border-zinc-100">
                        These records are already verified. You shouldn't need to touch them again unless your DNS provider resets them.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {verifyingId === d.id && verifyStage && (
              <div className="flex items-center gap-2 mt-2">
                <Loader2 className="animate-spin text-zinc-500" size={12} />
                <span className="text-zinc-500 text-[10px]">
                  {verifyStage === 'checking' ? 'Checking DNS…' : 'Connecting your domain…'}
                </span>
              </div>
            )}

            {verifyingId !== d.id && autoPollingIds.has(d.id) && (
              <p className="text-zinc-600 text-[10px] mt-2">
                We'll keep checking automatically for a few minutes — no need to click Verify again.
              </p>
            )}

            {verifyMessage?.id === d.id && (
              <p className="text-zinc-500 text-[10px] mt-2">
                {verifyMessage.text}
              </p>
            )}
          </div>
          ));
          })()}
        </div>
      )}
    </div>
  );
}