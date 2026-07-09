/**
 * src/services/asset/validateUrl.ts
 *
 * First gate in the Import Asset pipeline (Design Lock §1): "Import should
 * always succeed unless the URL itself is invalid." This is the ONLY step
 * allowed to reject an import — everything downstream must degrade
 * gracefully instead of failing.
 *
 * Not responsible for: platform detection, metadata, reachability. A URL
 * can be well-formed and still 404 — that's an extraction concern, not a
 * validation concern (Design Lock §5 handles it via graceful fallback).
 */

export type ValidateUrlResult =
  | { valid: true; url: string }
  | { valid: false; reason: string };

export function validateUrl(rawUrl: string): ValidateUrlResult {
  const trimmed = rawUrl.trim();

  if (!trimmed) {
    return { valid: false, reason: 'Please paste a URL to import.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: "This doesn't look like a valid URL." };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Only http(s) links can be imported.' };
  }

  return { valid: true, url: parsed.toString() };
}