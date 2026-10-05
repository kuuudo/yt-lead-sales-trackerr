// ─────────────────────────────────────────────────────────────────────────
// components/onboarding/InstallationOnboarding/TrackingDomainInstallationOnboarding.tsx
// ─────────────────────────────────────────────────────────────────────────
// Onboarding step that comes AFTER the pixel/installation hub:
//   hub → Continue to app → this step → Continue to app (closes the overlay)
//
// Two steps:
//   Step 1  Root domain      "kaksidigitals.com"  (or locked, if the campaign
//                            already has an official root_domain)
//   Step 2  Tracking domain  [ go ] . kaksidigitals.com
//
// Rules of this step:
//   • Step 1 NEVER writes campaigns.root_domain (or anything else to Supabase).
//     The typed root is only a browser-local draft (lib/trackingDomainDraft).
//   • The campaign's official root is established ONLY by a successful
//     addBrandedDomain() — the existing, unchanged creation path.
//   • Onboarding supports only plain <name>.com roots (lib/trackingHostname).
//     Anything else is rejected with a message, never auto-corrected.
//   • Step 2 accepts a single DNS label; the hostname is built as
//     `${label}.${root}`. Full hostnames are rejected, not transformed.
//   • DNS verification never blocks anything. "Continue to app" is enabled in
//     every state.
//   • Campaign is locked to `campaignId`; only this campaign's domains show.
//   • Delete / disable / remove-root / connect-existing-root stay in Settings.
// ─────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import {
  listBrandedDomains,
  addBrandedDomain,
  verifyDomain,
  type BrandedTrackingDomain,
} from '../../../services/domain/brandedDomains';
import {
  buildTrackingHostname,
  isSupportedOnboardingRoot,
  normalizeRootInput,
  validateSubdomainLabel,
} from '../../../lib/trackingHostname';
import { clearDraft, readDraft, saveDraft } from '../../../lib/trackingDomainDraft';

type Props = {
  campaignId: string;
  /** Effective user id; only used to scope the local draft. May be null. */
  userId: string | null;
  onBack: () => void;
  onDone: () => void;
};

type CampaignRow = {
  id: string;
  campaign_name: string;
  root_domain: string | null;
  organization_id: string;
};

type Phase = 'root' | 'subdomain';

// Same palette as OnboardingOverlay.
const INK = '#15151f';
const MUTED = '#6b6b78';
const BRAND = '#5b3df0';
const LINE = '#d9d9e3';
const SOFT = '#fafafa';
const DANGER = '#dc2626';

// Same static Vercel target as TrackingDomains.tsx.
const CNAME_TARGET = 'cname.vercel-dns.com';

const POLL_INTERVAL_MS = 10000;
const MAX_POLL_ATTEMPTS = 18; // ~3 minutes of silent rechecking

// "lucky.kaksidigitals.com" + root "kaksidigitals.com" -> "lucky".
// Uses the row's own stored root, so it is correct for any root.
const shortLabelFor = (d: BrandedTrackingDomain): string => {
  const suffix = `.${d.root_domain}`;
  if (d.root_domain && d.hostname.endsWith(suffix) && d.hostname.length > suffix.length) {
    return d.hostname.slice(0, -suffix.length);
  }
  const parts = d.hostname.split('.');
  return parts.length > 2 ? parts.slice(0, -2).join('.') : d.hostname;
};

/* ── small pieces ─────────────────────────────────────────────────── */

function StatusTag({ status }: { status: string }) {
  const tone =
    status === 'verified'
      ? { color: '#16a34a', background: '#e6f7ee', border: '1px solid #bbf7d0', label: '✓ Verified' }
      : status === 'failed'
      ? { color: DANGER, background: '#fef2f2', border: '1px solid #fecaca', label: 'Failed' }
      : { color: '#71717a', background: '#f4f4f5', border: '1px solid #e4e4e7', label: '○ Pending' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 10,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        borderRadius: 999,
        padding: '3px 8px',
        color: tone.color,
        background: tone.background,
        border: tone.border,
      }}
    >
      {tone.label}
    </span>
  );
}

function RecordRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <span style={{ width: 52, flexShrink: 0, fontSize: 11.5, color: MUTED }}>{label}</span>
      <code
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          background: '#f4f4f5',
          borderRadius: 6,
          padding: '3px 8px',
          fontSize: 12,
          color: INK,
        }}
      >
        {value}
      </code>
      {onCopy ? (
        <button
          type="button"
          onClick={onCopy}
          title={`Copy ${label.toLowerCase()}`}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', padding: 2, display: 'flex' }}
        >
          {copied ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
        </button>
      ) : (
        <span style={{ width: 18 }} />
      )}
    </div>
  );
}

function StepDot({ n }: { n: number }) {
  return (
    <span
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: '#efeffb',
        color: BRAND,
        fontSize: 11,
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {n}
    </span>
  );
}

function LockedField({ value }: { value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '10px 12px',
        borderRadius: 8,
        border: `1px solid ${LINE}`,
        background: '#f4f4f5',
      }}
    >
      <span style={{ fontSize: 13.5, fontWeight: 700, color: INK, overflowWrap: 'anywhere' }}>{value}</span>
      <Lock size={14} color="#a1a1aa" aria-label="Locked" />
    </div>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 800,
  color: MUTED,
  marginBottom: 6,
};

const primaryButton = (disabled: boolean): React.CSSProperties => ({
  width: '100%',
  padding: '12px 20px',
  borderRadius: 8,
  border: 'none',
  background: disabled ? '#d4d4dc' : BRAND,
  color: '#fff',
  fontSize: 13,
  fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer',
  boxShadow: disabled ? 'none' : '0 6px 16px rgba(91,61,240,0.3)',
});

const outlineButton: React.CSSProperties = {
  width: '100%',
  padding: '12px 20px',
  borderRadius: 8,
  border: `1px solid ${BRAND}`,
  background: '#fff',
  color: BRAND,
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

/* ── main component ───────────────────────────────────────────────── */

export default function TrackingDomainInstallationOnboarding({ campaignId, userId, onBack, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('root');

  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [campaignLoading, setCampaignLoading] = useState(true);
  const [allDomains, setAllDomains] = useState<BrandedTrackingDomain[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(true);

  // Step 1 (no official root yet): what the user typed, and the validated root
  // carried into Step 2. Neither is ever written to Supabase from Step 1.
  const [rootInput, setRootInput] = useState('');
  const [workingRoot, setWorkingRoot] = useState<string | null>(null);

  // Step 2
  const [labelInput, setLabelInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // DNS / verify (unchanged behaviour from the settings page, trimmed)
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<{ id: string; text: string } | null>(null);
  const [autoPollingIds, setAutoPollingIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const pollTimersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const pollAttemptsRef = useRef<Record<string, number>>({});
  const prevStatusRef = useRef<Record<string, string>>({});
  const draftHandledRef = useRef(false);

  /* data ----------------------------------------------------------- */

  const loadCampaign = useCallback(async (): Promise<CampaignRow | null> => {
    const { data } = await supabase
      .from('campaigns')
      .select('id, campaign_name, root_domain, organization_id')
      .eq('id', campaignId)
      .single();
    if (data) setCampaign(data as CampaignRow);
    setCampaignLoading(false);
    return (data as CampaignRow) ?? null;
  }, [campaignId]);

  const loadDomains = useCallback(async (orgId: string | undefined) => {
    if (!orgId) {
      setDomainsLoading(false);
      return;
    }
    setDomainsLoading(true);
    const rows = await listBrandedDomains(orgId);
    setAllDomains(rows);
    setDomainsLoading(false);
  }, []);

  // Campaign first (its root_domain may have just been established by
  // addBrandedDomain), then the org's domains.
  const refresh = useCallback(async () => {
    const c = await loadCampaign();
    await loadDomains(c?.organization_id);
  }, [loadCampaign, loadDomains]);

  // Polling callbacks run inside setInterval — keep them on the latest refresh.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const officialRoot = campaign?.root_domain ?? null;
  const officialRootSupported = officialRoot ? isSupportedOnboardingRoot(officialRoot) : false;

  // The campaign's official root always wins over a local draft. With no
  // official root, prefill Step 1 from the draft once.
  useEffect(() => {
    if (campaignLoading) return;
    if (officialRoot) {
      clearDraft(userId, campaignId);
      return;
    }
    if (!draftHandledRef.current) {
      draftHandledRef.current = true;
      const draft = readDraft(userId, campaignId);
      if (draft) setRootInput(draft);
    }
  }, [campaignLoading, officialRoot, userId, campaignId]);

  // Only THIS campaign's domains: same root_domain match the settings page
  // uses (there is no campaign_id on the domain row).
  const domains = officialRoot ? allDomains.filter((d) => d.root_domain === officialRoot) : [];

  // The root Step 2 builds on: the campaign's official root if it has one
  // (and onboarding supports it), otherwise the root validated in Step 1.
  const effectiveRoot: string | null = officialRoot ? (officialRootSupported ? officialRoot : null) : workingRoot;

  /* DNS section open/closed -------------------------------------- */
  // pending = open the first time it's seen; auto-collapse once when it flips
  // to verified; after that the user decides.
  useEffect(() => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      domains.forEach((d) => {
        const before = prevStatusRef.current[d.id];
        if (before === undefined) {
          if (d.status === 'pending') {
            next.add(d.id);
            changed = true;
          }
        } else if (before !== 'verified' && d.status === 'verified' && next.has(d.id)) {
          next.delete(d.id);
          changed = true;
        }
        prevStatusRef.current[d.id] = d.status;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDomains, officialRoot]);

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* auto-poll ------------------------------------------------------ */

  const stopAutoPoll = useCallback((id: string) => {
    const timer = pollTimersRef.current[id];
    if (timer) clearInterval(timer);
    delete pollTimersRef.current[id];
    delete pollAttemptsRef.current[id];
    setAutoPollingIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const startAutoPoll = useCallback(
    (id: string) => {
      if (pollTimersRef.current[id]) return;
      pollAttemptsRef.current[id] = 0;
      setAutoPollingIds((prev) => new Set(prev).add(id));

      pollTimersRef.current[id] = setInterval(async () => {
        pollAttemptsRef.current[id] = (pollAttemptsRef.current[id] || 0) + 1;
        if (pollAttemptsRef.current[id] > MAX_POLL_ATTEMPTS) {
          stopAutoPoll(id);
          return;
        }
        const result = await verifyDomain(id);
        if (result?.status === 'verified') {
          stopAutoPoll(id);
          await refreshRef.current();
        }
      }, POLL_INTERVAL_MS);
    },
    [stopAutoPoll]
  );

  useEffect(() => {
    return () => {
      Object.keys(pollTimersRef.current).forEach(stopAutoPoll);
    };
  }, [stopAutoPoll]);

  /* Step 1 --------------------------------------------------------- */

  const rootCheck = normalizeRootInput(rootInput);
  const rootHasText = rootInput.trim().length > 0;

  // Not before the campaign (and so its official root) has loaded.
  const canGoNext = !campaignLoading && !!campaign && (officialRoot ? officialRootSupported : rootCheck.ok);

  const handleNext = () => {
    if (officialRoot) {
      if (officialRootSupported) setPhase('subdomain');
      return;
    }
    if (!rootCheck.ok) return;
    // Local draft only. Nothing is written to Supabase here.
    saveDraft(userId, campaignId, rootCheck.root);
    setWorkingRoot(rootCheck.root);
    setRootInput(rootCheck.root);
    setPhase('subdomain');
  };

  /* Step 2 --------------------------------------------------------- */

  const labelCheck = effectiveRoot ? validateSubdomainLabel(labelInput, effectiveRoot) : null;
  const labelHasText = labelInput.trim().length > 0;
  const builtHostname = effectiveRoot && labelCheck?.ok ? buildTrackingHostname(labelCheck.label, effectiveRoot) : null;

  const canAdd = !!campaign && !!effectiveRoot && !!builtHostname && !adding;

  const handleAdd = async () => {
    if (!campaign || !effectiveRoot || !builtHostname || adding) return;
    setAdding(true);
    setError(null);

    // The ONLY place a real tracking domain is created: the existing
    // addBrandedDomain(), with a hostname built from a validated label + root.
    const result = await addBrandedDomain(campaign.organization_id, builtHostname, campaign.id);

    if (!result) {
      // Draft is kept so the user can retry.
      setError('Failed to add domain. Check the hostname and try again.');
      setAdding(false);
      return;
    }

    if (result.domain.root_domain !== effectiveRoot) {
      // Should be impossible for <name>.com roots; surface it instead of hiding it.
      console.error('[TrackingDomainInstallationOnboarding] unexpected root after add', {
        expected: effectiveRoot,
        actual: result.domain.root_domain,
      });
    }

    clearDraft(userId, campaignId);
    setLabelInput('');
    setAdding(false);
    await refresh();
  };

  const handleVerify = async (id: string) => {
    setVerifyingId(id);
    setVerifyMessage(null);

    const result = await verifyDomain(id);

    if (!result) {
      setVerifyMessage({ id, text: 'Verification check failed. Try again.' });
    } else if (result.status === 'verified') {
      setVerifyMessage(null);
    } else {
      setVerifyMessage({
        id,
        text: result.error || 'TXT record not found yet. DNS changes can take a few minutes to spread.',
      });
      startAutoPoll(id);
    }

    setVerifyingId(null);
    await refresh();
  };

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 2000);
    } catch {
      /* clipboard unavailable — ignore */
    }
  };

  /* render --------------------------------------------------------- */

  const campaignName = campaignLoading ? 'Loading…' : campaign?.campaign_name ?? 'Campaign not found';

  return (
    <div
      style={{
        padding: '28px 24px 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
        color: INK,
      }}
    >
      {/* Fox guide — same treatment as the hub */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fff',
            border: '1.5px solid #ff7a45',
            fontSize: 22,
          }}
        >
          🦊
        </div>
        <div style={{ background: SOFT, border: `1px solid ${LINE}`, borderRadius: 12, padding: '9px 12px' }}>
          <p style={{ fontSize: 12.5, color: INK, margin: 0, lineHeight: 1.5 }}>
            {phase === 'root'
              ? 'Last step: put your tracking links on your own domain.'
              : 'Pick a short name for your tracking link, like go or shop.'}
          </p>
        </div>
      </div>

      <p style={{ fontSize: 11, fontWeight: 800, color: BRAND, margin: '0 0 4px', letterSpacing: '0.04em' }}>
        STEP {phase === 'root' ? 1 : 2} OF 2
      </p>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: INK, margin: '0 0 8px' }}>
        {phase === 'root' ? 'Connect your domain' : 'Create your tracking domain'}
      </h2>

      {/* ───────────── Step 1 ───────────── */}
      {phase === 'root' && (
        <>
          <p style={{ fontSize: 13, color: MUTED, margin: '0 0 20px', lineHeight: 1.55, maxWidth: 640 }}>
            {officialRoot
              ? 'This campaign already has a connected root domain. Your tracking subdomains will be created under it.'
              : 'Enter the domain you own. This is the root domain for this campaign. In the next step you will create a tracking subdomain under it, like go.yourdomain.com.'}
          </p>

          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 16, background: '#fff', marginBottom: 16 }}>
            <span style={fieldLabelStyle}>Campaign</span>
            <div style={{ marginBottom: 14 }}>
              <LockedField value={campaignName} />
            </div>

            {campaignLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
                <Loader2 size={18} className="animate-spin" color="#a1a1aa" />
              </div>
            ) : officialRoot ? (
              <>
                <span style={fieldLabelStyle}>Root domain</span>
                <LockedField value={officialRoot} />
                {officialRootSupported ? (
                  <p style={{ fontSize: 11.5, color: MUTED, margin: '10px 0 0', lineHeight: 1.55 }}>
                    This campaign uses <code style={{ color: INK }}>{officialRoot}</code> as its root domain. Tracking
                    subdomains will be created under it.
                  </p>
                ) : (
                  <p style={{ fontSize: 12, color: DANGER, margin: '10px 0 0', lineHeight: 1.55 }}>
                    This setup only supports plain .com root domains. Manage this campaign’s domains in Settings →
                    Tracking Domains.
                  </p>
                )}
              </>
            ) : (
              <>
                <label htmlFor="tdo-root-input" style={fieldLabelStyle}>
                  Domain you own
                </label>
                <input
                  id="tdo-root-input"
                  type="text"
                  value={rootInput}
                  onChange={(e) => setRootInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canGoNext) handleNext();
                  }}
                  placeholder="kaksidigitals.com"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-invalid={rootHasText && !rootCheck.ok}
                  aria-describedby="tdo-root-help"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: `1px solid ${rootHasText && !rootCheck.ok ? DANGER : LINE}`,
                    fontSize: 13.5,
                    color: INK,
                    background: '#fff',
                    outline: 'none',
                  }}
                />
                <div id="tdo-root-help" aria-live="polite">
                  {rootHasText && !rootCheck.ok && (
                    <p style={{ fontSize: 12, color: DANGER, margin: '8px 0 0', lineHeight: 1.5 }}>
                      {rootCheck.message}
                      {rootCheck.suggestion && (
                        <>
                          {' '}
                          Did you mean <code style={{ color: INK }}>{rootCheck.suggestion}</code>?
                        </>
                      )}
                    </p>
                  )}
                  {rootCheck.ok && rootCheck.strippedWww && (
                    <p style={{ fontSize: 12, color: MUTED, margin: '8px 0 0', lineHeight: 1.5 }}>
                      We will use <code style={{ color: INK }}>{rootCheck.root}</code>. The www is not part of the root
                      domain.
                    </p>
                  )}
                </div>
                <p style={{ fontSize: 11.5, color: MUTED, margin: '10px 0 0', lineHeight: 1.55 }}>
                  Just the domain, like <code style={{ color: INK }}>kaksidigitals.com</code>. Only .com domains are
                  supported for now.
                </p>
              </>
            )}
          </div>
        </>
      )}

      {/* ───────────── Step 2 ───────────── */}
      {phase === 'subdomain' && (
        <>
          <p style={{ fontSize: 13, color: MUTED, margin: '0 0 20px', lineHeight: 1.55, maxWidth: 640 }}>
            {effectiveRoot ? (
              <>
                Type only the first part of your tracking link. It will be created under{' '}
                <code style={{ color: INK }}>{effectiveRoot}</code>, for example <code style={{ color: INK }}>go</code>,{' '}
                <code style={{ color: INK }}>shop</code> or <code style={{ color: INK }}>track</code>.
              </>
            ) : (
              'Go back and enter a root domain first.'
            )}
          </p>

          <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: 16, background: '#fff', marginBottom: 16 }}>
            <span style={fieldLabelStyle}>Campaign</span>
            <div style={{ marginBottom: 14 }}>
              <LockedField value={campaignName} />
            </div>

            <label htmlFor="tdo-label-input" style={fieldLabelStyle}>
              Tracking domain
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', flex: '1 1 260px', minWidth: 0 }}>
                <input
                  id="tdo-label-input"
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && canAdd) handleAdd();
                  }}
                  placeholder="go"
                  disabled={adding || !effectiveRoot}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-invalid={labelHasText && !!labelCheck && !labelCheck.ok}
                  aria-describedby="tdo-label-help"
                  style={{
                    flex: '1 1 80px',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    borderRadius: '8px 0 0 8px',
                    border: `1px solid ${labelHasText && labelCheck && !labelCheck.ok ? DANGER : LINE}`,
                    borderRight: 'none',
                    fontSize: 13.5,
                    color: INK,
                    background: '#fff',
                    outline: 'none',
                  }}
                />
                <div
                  title="Locked root domain"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0 12px',
                    borderRadius: '0 8px 8px 0',
                    border: `1px solid ${LINE}`,
                    background: '#f4f4f5',
                    fontSize: 13.5,
                    fontWeight: 700,
                    color: INK,
                    whiteSpace: 'nowrap',
                  }}
                >
                  .{effectiveRoot ?? 'yourdomain.com'}
                  <Lock size={13} color="#a1a1aa" aria-label="Locked" />
                </div>
              </div>

              <button
                type="button"
                onClick={handleAdd}
                disabled={!canAdd}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '10px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: canAdd ? BRAND : '#d4d4dc',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: canAdd ? 'pointer' : 'not-allowed',
                }}
              >
                {adding && <Loader2 size={14} className="animate-spin" />}
                Add domain
              </button>
            </div>

            <div id="tdo-label-help" aria-live="polite">
              {labelHasText && labelCheck && !labelCheck.ok && (
                <p style={{ fontSize: 12, color: DANGER, margin: '8px 0 0', lineHeight: 1.5 }}>{labelCheck.message}</p>
              )}
              {builtHostname && (
                <p style={{ fontSize: 12, color: MUTED, margin: '8px 0 0', lineHeight: 1.5 }}>
                  Your tracking domain will be <code style={{ color: INK }}>{builtHostname}</code>
                </p>
              )}
            </div>
            {error && <p style={{ fontSize: 12, color: DANGER, margin: '10px 0 0' }}>{error}</p>}
          </div>

          {/* Domains for this campaign */}
          {campaignLoading || domainsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
              <Loader2 size={20} className="animate-spin" color="#a1a1aa" />
            </div>
          ) : domains.length === 0 ? (
            <p style={{ fontSize: 12.5, color: '#a1a1aa', textAlign: 'center', margin: '8px 0 20px' }}>
              No tracking domains for this campaign yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {domains.map((d) => {
                const verified = d.status === 'verified';
                const open = expandedIds.has(d.id);
                const short = shortLabelFor(d);
                const txtName = `_vstrk-verify.${short}`;
                return (
                  <div
                    key={d.id}
                    style={{
                      border: verified ? '1px solid #bbf7d0' : `1px solid ${LINE}`,
                      background: verified ? '#f6fdf9' : '#fff',
                      borderRadius: 12,
                      padding: '12px 14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 800, color: INK }}>{d.hostname}</span>
                      <StatusTag status={d.status} />
                    </div>

                    {d.verification_token && (
                      <div style={{ marginTop: 10 }}>
                        <button
                          type="button"
                          onClick={() => toggleExpanded(d.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 700,
                            color: BRAND,
                          }}
                        >
                          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          {verified ? 'View DNS configuration' : 'DNS setup instructions'}
                        </button>

                        {open && (
                          <div
                            style={{
                              marginTop: 10,
                              background: '#fff',
                              border: '1px solid #e8e8ee',
                              borderRadius: 10,
                              padding: 16,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 14,
                            }}
                          >
                            <div style={{ display: 'flex', gap: 10 }}>
                              <StepDot n={1} />
                              <div>
                                <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px' }}>Open your DNS records</p>
                                <p style={{ fontSize: 12, color: MUTED, margin: 0, lineHeight: 1.5 }}>
                                  Sign in where you manage this domain (Cloudflare, GoDaddy, Namecheap, Porkbun…), open
                                  DNS records, and click Add record. You can also do this later.
                                </p>
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: 10 }}>
                              <StepDot n={2} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>Add the TXT record</p>
                                <RecordRow label="Type" value="TXT" copied={false} />
                                <RecordRow
                                  label="Name"
                                  value={txtName}
                                  copied={copiedKey === `${d.id}:txtname`}
                                  onCopy={() => copyValue(`${d.id}:txtname`, txtName)}
                                />
                                <RecordRow
                                  label="Value"
                                  value={d.verification_token}
                                  copied={copiedKey === `${d.id}:txt`}
                                  onCopy={() => copyValue(`${d.id}:txt`, d.verification_token as string)}
                                />
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: 10 }}>
                              <StepDot n={3} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>Add the CNAME record</p>
                                <RecordRow label="Type" value="CNAME" copied={false} />
                                <RecordRow
                                  label="Name"
                                  value={short}
                                  copied={copiedKey === `${d.id}:cnamename`}
                                  onCopy={() => copyValue(`${d.id}:cnamename`, short)}
                                />
                                <RecordRow
                                  label="Target"
                                  value={CNAME_TARGET}
                                  copied={copiedKey === `${d.id}:cname`}
                                  onCopy={() => copyValue(`${d.id}:cname`, CNAME_TARGET)}
                                />
                              </div>
                            </div>

                            <p style={{ fontSize: 11, color: '#a1a1aa', margin: 0, lineHeight: 1.5 }}>
                              Most DNS providers only need the short name shown above. If yours asks for the full
                              hostname, use <code>_vstrk-verify.{d.hostname}</code> and <code>{d.hostname}</code>.
                            </p>

                            {!verified && (
                              <div style={{ display: 'flex', gap: 10 }}>
                                <StepDot n={4} />
                                <div style={{ flex: 1 }}>
                                  <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px' }}>
                                    Wait a few minutes, then verify
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => handleVerify(d.id)}
                                    disabled={verifyingId === d.id}
                                    style={{
                                      width: '100%',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: 6,
                                      padding: '10px 16px',
                                      borderRadius: 8,
                                      border: `1px solid ${BRAND}`,
                                      background: '#fff',
                                      color: BRAND,
                                      fontSize: 13,
                                      fontWeight: 700,
                                      cursor: verifyingId === d.id ? 'not-allowed' : 'pointer',
                                      opacity: verifyingId === d.id ? 0.6 : 1,
                                    }}
                                  >
                                    {verifyingId === d.id ? (
                                      <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                      <ShieldCheck size={14} />
                                    )}
                                    Verify domain
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {verifyingId === d.id && (
                      <p style={{ fontSize: 11.5, color: MUTED, margin: '8px 0 0' }}>Checking DNS…</p>
                    )}
                    {verifyingId !== d.id && autoPollingIds.has(d.id) && (
                      <p style={{ fontSize: 11.5, color: MUTED, margin: '8px 0 0' }}>
                        We will keep checking for a few minutes. No need to click Verify again.
                      </p>
                    )}
                    {verifyMessage?.id === d.id && (
                      <p style={{ fontSize: 11.5, color: MUTED, margin: '8px 0 0' }}>{verifyMessage.text}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ───────────── Footer ─────────────
          "Continue to app" is enabled in every state: no domain typed, DNS
          pending, or anything else. It never depends on Add or Verify. */}
      {phase === 'root' ? (
        <>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canGoNext}
            style={{ ...primaryButton(!canGoNext), marginBottom: 10 }}
          >
            Next →
          </button>
          <button type="button" onClick={onDone} style={{ ...outlineButton, marginBottom: 10 }}>
            Continue to app →
          </button>
          <button
            type="button"
            onClick={onBack}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: 'none',
              background: 'none',
              color: MUTED,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ← Back
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => setPhase('root')} style={{ ...outlineButton, marginBottom: 10 }}>
            ← Back
          </button>
          <button type="button" onClick={onDone} style={primaryButton(false)}>
            Continue to app →
          </button>
        </>
      )}
    </div>
  );
}
