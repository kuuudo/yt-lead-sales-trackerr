import React, { useEffect, useState } from 'react';
import { Globe, Plus, Star, Trash2, Ban, Loader2, Copy, Check, ShieldCheck } from 'lucide-react';
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
  const [pendingToken, setPendingToken] = useState<{ hostname: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<{ id: string; text: string } | null>(null);

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

    setPendingToken({ hostname: result.domain.hostname, token: result.verificationToken });
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

    const ok = await deleteDomain(domainId);
    if (!ok) setActionError('Failed to delete domain.');
    await refresh();
  };

const handleVerify = async (domainId: string) => {
  setVerifyingId(domainId);
  setVerifyMessage(null);

  const result = await verifyDomain(domainId);

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
      text: 'TXT record not found yet. DNS changes can take time to propagate.',
    });
  }

  setVerifyingId(null);
  await refresh();
};
  
  const copyToken = async (token: string) => {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

        {pendingToken && (
          <div className="mt-4 bg-zinc-950 border border-zinc-800 rounded-md p-4">
            <p className="text-zinc-400 text-xs mb-2">
              Add this TXT record for <span className="text-white font-bold">{pendingToken.hostname}</span> to verify ownership:
            </p>
            <div className="text-[10px] text-zinc-500 mb-1 font-mono">
              Host: <span className="text-zinc-300">_vstrk-verify.{pendingToken.hostname}</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[11px] text-zinc-300 font-mono truncate">
                {pendingToken.token}
              </code>
              <button
                onClick={() => copyToken(pendingToken.token)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-zinc-600 text-[10px] mt-3">
              Verification isn't available yet — this domain will remain pending until DNS verification ships.
            </p>
          </div>
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
        <div className="space-y-2">
          {domains.map((d) => (
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
    <button
      onClick={() => handleSetDefault(d.id)}
      title="Set as default"
      className="text-zinc-500 hover:text-violet-400 transition-colors"
    >
      <Star size={14} />
    </button>
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

            {verifyMessage?.id === d.id && (
              <p className="text-zinc-500 text-[10px] mt-2">
                {verifyMessage.text}
              </p>
            )}
          </div>
          ))}
        </div>
      )}
    </div>
  );
}