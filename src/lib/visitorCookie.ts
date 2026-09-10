/**
 * Minimal journey-recovery pointer cookie for the cross-origin
 * YouTube gap.
 *
 * vt_jid = the CURRENT journey_id (tracker.ts JOURNEY_ID_KEY), and
 * nothing else. No visitor identity, no snapshot, no event ids.
 * event_journey remains the source of truth — this cookie only lets a
 * later VSTRK page find its way back to the right journey_id after a
 * hop through YouTube destroys URL-based vt_* handoff params.
 *
 * Scoped to .kaksidigitals.com when on a kaksidigitals.com host so that
 * lucky.* and store.* share the same cookie. On other hosts we set a
 * host-only cookie (still useful for same-host return visits).
 */

const COOKIE_NAME = 'vt_jid';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year — persistent, not journey TTL

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
 * Read the recovery pointer without creating one. Returns null if
 * absent or malformed (not a UUID).
 */
export function getStoredJourneyId(): string | null {
  const id = readCookie(COOKIE_NAME);
  if (!id || !UUID_RE.test(id)) return null;
  return id;
}

/**
 * Point the cookie at journeyId. Call this ONLY from the single place
 * journey_id itself changes (tracker.ts setJourneyId) — NOT on every
 * page load or every outbound navigation. No-ops (skips the write)
 * when the cookie already holds this exact value, so a continuing
 * journey (J1 → J1) never rewrites the cookie.
 */
export function setStoredJourneyId(journeyId: string): void {
  if (!journeyId || !UUID_RE.test(journeyId)) return;

  const hostname =
    typeof window !== 'undefined' ? window.location.hostname : '';
  const existing = readCookie(COOKIE_NAME);

  if (existing === journeyId) {
    console.log('[VT_COOKIE] UNCHANGED', { journeyId, hostname });
    return;
  }

  writeCookie(COOKIE_NAME, journeyId, hostname);
  console.log('[VT_COOKIE] SET', { journeyId, hostname, previous: existing });
}