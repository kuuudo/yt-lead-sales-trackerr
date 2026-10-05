/**
 * lib/trackingHostname.ts
 *
 * Pure, dependency-free helpers for adding tracking domains. Shared by the
 * onboarding step and Settings → Tracking Domains, so both follow one model.
 *
 * Deliberately NARROW. Both support exactly one root-domain shape:
 *
 *     <name>.com        or        www.<name>.com   (www is dropped)
 *
 * This is NOT a general domain parser: no Public Suffix List, no multi-part
 * suffix handling, no use of getCookieParent(). Anything outside the supported
 * shape is rejected with a message, never "fixed up". Other domains (other
 * TLDs, multi-part suffixes) are not supported yet, in onboarding or Settings.
 *
 * Why this is enough for addBrandedDomain(): every hostname built here is
 * exactly `<label>.<name>.com` (three labels). getCookieParent() derives
 * `<name>.com` from that, because `<name>.com` is never in its multi-part
 * suffix table. So the root onboarding showed is the root that gets stored.
 */

// One DNS label: 1–63 chars, [a-z0-9-], no leading/trailing hyphen.
const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const ROOT_RE = new RegExp(`^(${LABEL})\\.com$`);
const LABEL_RE = new RegExp(`^${LABEL}$`);
// Looks like a dotted hostname made only of hostname characters.
const DOTTED_HOST_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

export type RootCheck =
  | { ok: true; root: string; strippedWww: boolean }
  | {
      ok: false;
      code: 'empty' | 'not_a_domain' | 'subdomain' | 'unsupported_ending' | 'reserved_name';
      message: string;
      /** Shown to the user, never applied automatically. */
      suggestion?: string;
    };

export type LabelCheck =
  | { ok: true; label: string }
  | {
      ok: false;
      code: 'empty' | 'has_dot' | 'reserved_www' | 'too_long' | 'hyphen_edge' | 'invalid_chars';
      message: string;
    };

/**
 * Step 1 input → normalized root.
 * Accepts `name.com` and `www.name.com` (→ `name.com`). Rejects everything else.
 * Only trimming and lowercasing are applied; nothing else is transformed.
 */
export function normalizeRootInput(input: string): RootCheck {
  const raw = input.trim().toLowerCase();
  if (!raw) return { ok: false, code: 'empty', message: '' };

  const strippedWww = raw.startsWith('www.');
  const candidate = strippedWww ? raw.slice(4) : raw;

  const match = ROOT_RE.exec(candidate);
  if (match) {
    if (match[1] === 'www') {
      return {
        ok: false,
        code: 'reserved_name',
        message: '"www" can’t be used as a domain name. Enter your root domain, like kaksidigitals.com.',
      };
    }
    return { ok: true, root: `${match[1]}.com`, strippedWww };
  }

  const generic: RootCheck = {
    ok: false,
    code: 'not_a_domain',
    message: 'Enter your root domain like kaksidigitals.com — no https://, paths, ports or spaces.',
  };

  // URLs, paths, ports, spaces, underscores, trailing dots, localhost, …
  if (!DOTTED_HOST_RE.test(candidate)) return generic;

  const labels = candidate.split('.');
  const last = labels[labels.length - 1];

  // IP addresses and other all-numeric endings.
  if (/^\d+$/.test(last)) return generic;

  if (last !== 'com') {
    return {
      ok: false,
      code: 'unsupported_ending',
      message: 'Only .com domains are supported for now.',
    };
  }

  // Ends in .com but did not match <name>.com → it has extra labels (a subdomain)
  // or an invalid label.
  if (labels.length >= 3) {
    const rootGuess = `${labels[labels.length - 2]}.com`;
    const guess = ROOT_RE.exec(rootGuess);
    return {
      ok: false,
      code: 'subdomain',
      message: 'That looks like a subdomain. Enter your root domain only, like kaksidigitals.com.',
      suggestion: guess && guess[1] !== 'www' ? rootGuess : undefined,
    };
  }

  return generic;
}

/** True only if `root` is already in the exact normalized form onboarding supports. */
export function isSupportedOnboardingRoot(root: string): boolean {
  const check = normalizeRootInput(root);
  return check.ok && !check.strippedWww && check.root === root;
}

/**
 * Step 2 input → single subdomain label.
 * Full hostnames (anything containing a dot) are rejected, never transformed.
 */
export function validateSubdomainLabel(input: string, root: string): LabelCheck {
  const raw = input.trim().toLowerCase();
  if (!raw) return { ok: false, code: 'empty', message: '' };

  if (raw.includes('.')) {
    return {
      ok: false,
      code: 'has_dot',
      message: `Enter only the part before .${root}, for example "go".`,
    };
  }
  if (raw === 'www') {
    return {
      ok: false,
      code: 'reserved_www',
      message: '"www" is reserved for your website. Use a tracking subdomain such as "go" or "shop".',
    };
  }
  if (raw.length > 63) {
    return { ok: false, code: 'too_long', message: 'Use 63 characters or fewer.' };
  }
  if (raw.startsWith('-') || raw.endsWith('-')) {
    return { ok: false, code: 'hyphen_edge', message: 'A subdomain can’t start or end with a hyphen.' };
  }
  if (!LABEL_RE.test(raw)) {
    return {
      ok: false,
      code: 'invalid_chars',
      message: 'Use only letters, numbers and hyphens.',
    };
  }
  return { ok: true, label: raw };
}

/**
 * `${label}.${root}`, or null unless BOTH parts are valid and the result has
 * exactly three labels. This is the only place onboarding builds a hostname.
 */
export function buildTrackingHostname(label: string, root: string): string | null {
  if (!isSupportedOnboardingRoot(root)) return null;
  const checked = validateSubdomainLabel(label, root);
  if (!checked.ok) return null;
  const hostname = `${checked.label}.${root}`;
  if (hostname.split('.').length !== 3 || !hostname.endsWith(`.${root}`)) return null;
  return hostname;
}
