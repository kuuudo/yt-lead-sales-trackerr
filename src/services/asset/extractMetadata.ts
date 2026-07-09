/**
 * src/services/asset/extractMetadata.ts
 *
 * "Tell me about it" — the Extract step. Never throws, never blocks the
 * import (Design Lock §1, §5).
 *
 * Known platform: delegates to the EXISTING getPlatformInfo() from
 * lib/platformParser.ts, unmodified.
 *
 * Unknown platform, or a known-platform extraction that came back empty:
 * best-effort Open Graph fetch. NOTE — this will fail for most third-party
 * sites due to browser CORS restrictions; there is no server-side fetch
 * proxy in this codebase yet. That failure is expected and absorbed by the
 * caller's Design Lock §5 fallback — not a bug in this function. A real fix
 * would be a server-side/edge-function proxy; out of scope here, flagging
 * so it isn't mistaken for broken code later.
 */

import { getPlatformInfo, type Platform } from '../../lib/platformParser';

export interface ExtractedMetadata {
  title: string | null;
  thumbnailUrl: string | null;
}

const EMPTY: ExtractedMetadata = { title: null, thumbnailUrl: null };

export async function extractMetadata(
  url: string,
  platform: Platform | 'website'
): Promise<ExtractedMetadata> {
  if (platform !== 'website') {
    try {
      const info = await getPlatformInfo(url, platform);
      if (info) {
        return {
          title: info.video_title || null,
          thumbnailUrl: info.thumbnail_url || null,
        };
      }
      // info === null: getPlatformInfo couldn't extract a post ID from an
      // otherwise-recognized platform URL. Fall through to Open Graph
      // rather than giving up, per Design Lock §1.
    } catch {
      // Same — fall through, never throw.
    }
  }

  return tryOpenGraph(url);
}

async function tryOpenGraph(url: string): Promise<ExtractedMetadata> {
  try {
    const res = await fetch(url);
    if (!res.ok) return EMPTY;
    const html = await res.text();

    const title =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<title>([^<]+)<\/title>/i)?.[1] ??
      null;

    const thumbnailUrl =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? null;

    return { title, thumbnailUrl };
  } catch {
    // Expected for most cross-origin sites in a browser context (CORS).
    return EMPTY;
  }
}