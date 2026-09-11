/**
 * Cookie-parent (eTLD+1 / registrable domain) helpers for Phase 3E.
 * Groups branded tracking hostnames that share a cookie jar.
 *
 * Uses a compact multi-part public-suffix table + default rule.
 * Not a full PSL; sufficient for VSTRK branded domains (.com/.io/.co.uk/etc.).
 */

/** Multi-label public suffixes (non-exhaustive; extend as product needs). */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'com.au',
  'net.au',
  'org.au',
  'co.nz',
  'com.br',
  'com.mx',
  'co.jp',
  'com.cn',
  'com.hk',
  'com.sg',
  'co.in',
  'com.tw',
  'co.kr',
  'com.ar',
  'com.tr',
]);

/**
 * Returns the registrable domain (cookie-parent key) for a hostname.
 * e.g. shop.kaksidigitals.com → kaksidigitals.com
 *      go.nike.com → nike.com
 *      a.b.co.uk → b.co.uk
 */
export function getCookieParent(hostname: string): string {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host || host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return host;
  }

  const parts = host.split('.').filter(Boolean);
  if (parts.length <= 1) return host;

  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }

  return lastTwo;
}

export interface ProbeCandidate {
  /** Representative verified hostname for this cookie-parent group */
  hostname: string;
  relay_token: string;
  /** Cookie-parent key (eTLD+1) */
  cookieParent: string;
}

/**
 * Collapse verified branded domains into at most `maxGroups` cookie-parent
 * groups. One representative (hostname + relay_token) per group.
 * Deterministic: sort by cookieParent, then hostname; prefer is_default when present.
 */
export function buildProbeCandidates(
  rows: Array<{
    hostname: string;
    relay_token: string | null;
    status?: string;
    is_default?: boolean;
  }>,
  maxGroups = 3
): ProbeCandidate[] {
  const verified = rows.filter(
    (r) =>
      r.status === 'verified' &&
      typeof r.relay_token === 'string' &&
      r.relay_token.length > 0 &&
      typeof r.hostname === 'string' &&
      r.hostname.length > 0
  );

  // Group by cookie parent
  const byParent = new Map<
    string,
    Array<{ hostname: string; relay_token: string; is_default: boolean }>
  >();

  for (const r of verified) {
    const parent = getCookieParent(r.hostname);
    const list = byParent.get(parent) ?? [];
    list.push({
      hostname: r.hostname.toLowerCase(),
      relay_token: r.relay_token as string,
      is_default: !!r.is_default,
    });
    byParent.set(parent, list);
  }

  const parents = [...byParent.keys()].sort();
  const out: ProbeCandidate[] = [];

  for (const parent of parents) {
    if (out.length >= maxGroups) break;
    const hosts = byParent.get(parent)!;
    // Prefer default, then lexicographic hostname
    hosts.sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return a.hostname.localeCompare(b.hostname);
    });
    const pick = hosts[0];
    out.push({
      hostname: pick.hostname,
      relay_token: pick.relay_token,
      cookieParent: parent,
    });
  }

  return out;
}

/** Count distinct cookie-parent groups among hostnames (for product enforcement). */
export function countCookieParentGroups(hostnames: string[]): number {
  const set = new Set(hostnames.map((h) => getCookieParent(h)));
  return set.size;
}
