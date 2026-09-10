/**
 * Minimal persistent browser-identity cookie for the cross-origin
 * YouTube gap PoC.
 *
 * vt_visitor = WHO IS THIS BROWSER?
 * (opaque UUID only — never journey data)
 *
 * Scoped to .kaksidigitals.com when on a kaksidigitals.com host so that
 * lucky.* and store.* share the same cookie. On other hosts we set a
 * host-only cookie (still useful for same-host return visits).
 */

const COOKIE_NAME = 'vt_visitor';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year — persistent, not journey TTL

function isKaksiHost(hostname: string): boolean {
  return (
    hostname === 'kaksidigitals.com' ||
    hostname.endsWith('.kaksidigitals.com')
  );
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)')
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, hostname: string): void {
  if (typeof document === 'undefined') return;

  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${MAX_AGE_SECONDS}`,
    'Secure',
    'SameSite=Lax',
  ];

  // Share across lucky.* / store.* under the same parent.
  if (isKaksiHost(hostname)) {
    parts.push('Domain=.kaksidigitals.com');
  }

  document.cookie = parts.join('; ');
}

/**
 * Returns the existing vt_visitor UUID or creates a new one.
 * The UUID is stable for the lifetime of the cookie.
 * Calling this also refreshes Max-Age (renewal).
 */
export function getOrCreateVisitorId(): string {
  const hostname =
    typeof window !== 'undefined' ? window.location.hostname : '';
  const existing = readCookie(COOKIE_NAME);
  const isValid =
    !!existing &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing);
  const id = isValid ? (existing as string) : crypto.randomUUID();

  if (isValid) {
    console.log('[VT_COOKIE] REUSED', { visitorId: id, hostname, action: 'expiration refreshed' });
  } else {
    console.log('[VT_COOKIE] CREATED', {
      visitorId: id,
      hostname,
      reason: existing ? 'invalid/malformed cookie' : 'missing cookie',
    });
  }

  // Always re-write so Max-Age is refreshed (renewal without changing the UUID).
  writeCookie(COOKIE_NAME, id, hostname);
  return id;
}

/** Read without creating. Returns null if absent / malformed. */
export function getVisitorId(): string | null {
  const id = readCookie(COOKIE_NAME);
  if (!id) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  return id;
}
