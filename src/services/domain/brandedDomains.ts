import { supabase } from '../../lib/supabase';

export interface BrandedTrackingDomain {
  id: string;
  organization_id: string;
  hostname: string;
  status: 'pending' | 'verified' | 'failed';
  is_default: boolean;
  verified_at: string | null;
  created_at: string;
  // Plaintext verification token, display-only. Set once at creation,
  // never changes. Not used for any security comparison — verify-domain.ts
  // still compares against verification_token_hash server-side. This
  // exists purely so the DNS card can be rebuilt after a page refresh
  // instead of relying on ephemeral component state.
  verification_token: string | null;
}

// SHA-256 hash of the verification token, hex-encoded. Uses the browser's
// Web Crypto API — no external dependency needed. The plaintext token is
// never persisted; only this hash is stored, and only this hash is what
// Milestone 2's DNS verification step will compare against.
const hashToken = async (token: string): Promise<string> => {
  const encoded = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const generateToken = (): string => crypto.randomUUID().replace(/-/g, '');

const normalizeHostname = (raw: string): string =>
  raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

export const listBrandedDomains = async (
  organizationId: string
): Promise<BrandedTrackingDomain[]> => {
  const { data, error } = await supabase
    .from('branded_tracking_domains')
    .select(
      'id, organization_id, hostname, status, is_default, verified_at, created_at, verification_token'
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[brandedDomains] listBrandedDomains failed:', error.message);
    return [];
  }

  return data ?? [];
};

/**
 * Adds a new domain in `pending` status. The verification token is now
 * persisted in plaintext (verification_token column) precisely so it can
 * be redisplayed indefinitely — the TXT/CNAME card must survive page
 * refreshes and multi-day gaps while a domain is pending. The token is
 * not a secret in the credential sense: possessing it doesn't let anyone
 * claim a domain they don't control, since it only matters once actually
 * published in that domain's own DNS. The hash column and verify-domain.ts's
 * comparison logic are untouched — this is additive, not a security change.
 */
export const addBrandedDomain = async (
  organizationId: string,
  rawHostname: string
): Promise<{ domain: BrandedTrackingDomain; verificationToken: string } | null> => {
  const hostname = normalizeHostname(rawHostname);

  if (!hostname || hostname.includes(' ') || hostname.includes('/')) {
    console.error('[brandedDomains] invalid hostname:', rawHostname);
    return null;
  }

  const verificationToken = generateToken();
  const verification_token_hash = await hashToken(verificationToken);

  const { data, error } = await supabase
    .from('branded_tracking_domains')
    .insert({
      organization_id: organizationId,
      hostname,
      status: 'pending',
      is_default: false,
      verification_token_hash,
      verification_token: verificationToken,
    })
    .select(
      'id, organization_id, hostname, status, is_default, verified_at, created_at, verification_token'
    )
    .single();

  if (error || !data) {
    console.error('[brandedDomains] addBrandedDomain failed:', error?.message);
    return null;
  }

  return { domain: data, verificationToken };
};

/**
 * Sets one domain as the organization's default (used by createRedirectLink()),
 * unsetting any previously-default domain first. Two sequential updates
 * rather than a single upsert — the partial unique index on
 * (organization_id) WHERE is_default already guarantees correctness even
 * if this runs concurrently from two tabs; worst case is a benign
 * constraint-violation retry, not a data integrity issue.
 * Only verified domains may be set as default.
 */
export const setDefaultDomain = async (
  organizationId: string,
  domainId: string
): Promise<boolean> => {
  const { error: unsetError } = await supabase
    .from('branded_tracking_domains')
    .update({ is_default: false })
    .eq('organization_id', organizationId)
    .eq('is_default', true);

  if (unsetError) {
    console.error('[brandedDomains] failed to unset previous default:', unsetError.message);
    return false;
  }

  const { error: setError } = await supabase
    .from('branded_tracking_domains')
    .update({ is_default: true })
    .eq('id', domainId)
    .eq('organization_id', organizationId)
    .eq('status', 'verified');

  if (setError) {
    console.error('[brandedDomains] failed to set new default:', setError.message);
    return false;
  }

  return true;
};

// Disable: is_default only. status is untouched — per locked architecture,
// disabling must never break already-shared existing redirect links, and
// the redirect handler's Host check (Milestone 4) only checks status.
export const disableDomain = async (domainId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('branded_tracking_domains')
    .update({ is_default: false })
    .eq('id', domainId);

  if (error) {
    console.error('[brandedDomains] disableDomain failed:', error.message);
    return false;
  }

  return true;
};

// Delete: removes the row entirely. Per locked architecture, this DOES
// break future resolution of that hostname at the redirect handler (once
// Milestone 4 ships) — existing redirect_links.tracking_hostname snapshots
// are unaffected as historical text, but the hostname stops being
// authorized to serve redirects going forward. The UI layer is
// responsible for surfacing this distinction to the user before calling
// this function — this function itself performs no extra confirmation.
export const deleteDomain = async (domainId: string): Promise<boolean> => {
  const { error } = await supabase
    .from('branded_tracking_domains')
    .delete()
    .eq('id', domainId);

  if (error) {
    console.error('[brandedDomains] deleteDomain failed:', error.message);
    return false;
  }

  return true;
};

export interface VerifyDomainResult {
  status: 'verified' | 'pending';
  matched: boolean;
  alreadyVerified?: boolean;
  // Present when DNS ownership passed but the Vercel attach step failed.
  // verify-domain.ts already returns this — this is a type-only addition,
  // not a backend change.
  error?: string;
}

/**
 * Triggers a live DNS TXT lookup for this domain's verification record.
 * On match, the API endpoint itself flips status to 'verified' — this
 * function just relays the result so the UI can react (refresh the list,
 * show "not verified yet" messaging, etc).
 */
export const verifyDomain = async (domainId: string): Promise<VerifyDomainResult | null> => {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  if (!accessToken) {
    console.error('[brandedDomains] verifyDomain: no active session');
    return null;
  }

  try {
    const response = await fetch('/api/verify-domain', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ domainId }),
    });

    if (!response.ok) {
      console.error('[brandedDomains] verifyDomain request failed:', response.status);
      return null;
    }

    return await response.json();
  } catch (err) {
    console.error('[brandedDomains] verifyDomain threw:', err);
    return null;
  }
};

export interface VerifiedDomainOption {
  id: string;
  hostname: string;
}

/**
 * Minimal read for the "+ Track New Content" domain dropdown — only
 * verified domains are selectable there. Deliberately separate from
 * listBrandedDomains(): that one powers the Tracking Domains management
 * page and must keep returning every status (pending/verified/failed)
 * with the full row shape. This one is scoped to exactly what the
 * dropdown needs, nothing more.
 */
export const listVerifiedBrandedDomains = async (
  organizationId: string
): Promise<VerifiedDomainOption[]> => {
  const { data, error } = await supabase
    .from('branded_tracking_domains')
    .select('id, hostname')
    .eq('organization_id', organizationId)
    .eq('status', 'verified')
    .order('hostname', { ascending: true });

  if (error) {
    console.error('[brandedDomains] listVerifiedBrandedDomains failed:', error.message);
    return [];
  }

  return data ?? [];
};