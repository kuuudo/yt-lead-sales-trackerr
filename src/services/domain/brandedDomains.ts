import { supabase } from '../../lib/supabase';

export interface BrandedTrackingDomain {
  id: string;
  organization_id: string;
  hostname: string;
  status: 'pending' | 'verified' | 'failed';
  is_default: boolean;
  verified_at: string | null;
  created_at: string;
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
    .select('id, organization_id, hostname, status, is_default, verified_at, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[brandedDomains] listBrandedDomains failed:', error.message);
    return [];
  }

  return data ?? [];
};

/**
 * Adds a new domain in `pending` status and returns the plaintext
 * verification token — shown to the user exactly once, here, at creation
 * time. It is never stored and never retrievable again; only its hash is
 * persisted. If the user navigates away before adding the DNS record,
 * they must remove this row and add the domain again (Milestone 1 does
 * not include a "regenerate token" action — small enough to add later
 * without touching this function's contract).
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
    })
    .select('id, organization_id, hostname, status, is_default, verified_at, created_at')
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