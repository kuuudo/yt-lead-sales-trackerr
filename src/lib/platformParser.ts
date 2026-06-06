// =============================================================================
// platformParser.ts
// Unified platform detection, ID extraction, and metadata fetching.
//
// RULES:
//  - YouTube flow is sacred — never alter oEmbed logic or youtube_video_id
//  - detectPlatform NEVER defaults to youtube; unknown URLs return null
//  - extractPostId strips query params before matching
//  - getPlatformInfo uses safe placeholders for all non-YouTube platforms
// =============================================================================

export type Platform =
  | 'youtube'
  | 'tiktok'
  | 'instagram'
  | 'linkedin'
  | 'x'
  | 'threads'
  | 'facebook'
  | 'reddit'
  | 'twitch'

export interface PlatformInfo {
  platform: Platform
  platform_url: string
  platform_post_id: string
  video_title: string
  thumbnail_url: string
  youtube_video_id?: string // kept for backwards compat — only set for youtube
}

export const PLATFORM_CONFIG: Record<
  Platform,
  { label: string; color: string; placeholder: string; icon: string }
> = {
  youtube:   { label: 'YouTube',   color: '#FF0000', placeholder: 'https://youtube.com/watch?v=...', icon: '▶' },
  tiktok:    { label: 'TikTok',    color: '#00f2ea', placeholder: 'https://tiktok.com/@user/video/...', icon: '♪' },
  instagram: { label: 'Instagram', color: '#E1306C', placeholder: 'https://instagram.com/p/...', icon: '◉' },
  linkedin:  { label: 'LinkedIn',  color: '#0077B5', placeholder: 'https://linkedin.com/posts/...', icon: 'in' },
  x:         { label: 'X',         color: '#ffffff', placeholder: 'https://x.com/user/status/...', icon: '𝕏' },
  threads:   { label: 'Threads',   color: '#ffffff', placeholder: 'https://threads.net/@user/post/...', icon: '@' },
  facebook:  { label: 'Facebook',  color: '#1877F2', placeholder: 'https://facebook.com/posts/...', icon: 'f' },
  reddit:    { label: 'Reddit',    color: '#FF4500', placeholder: 'https://reddit.com/r/sub/comments/...', icon: '●' },
  twitch:    { label: 'Twitch',    color: '#9146FF', placeholder: 'https://twitch.tv/videos/... or /clip/...', icon: '⬡' },
}

// ---------------------------------------------------------------------------
// detectPlatform
// Returns the platform for a given URL, or null if unrecognised.
// NEVER falls back to 'youtube' for unknown URLs.
// ---------------------------------------------------------------------------
export function detectPlatform(url: string): Platform | null {
  if (/youtube\.com|youtu\.be/.test(url))   return 'youtube'
  if (/tiktok\.com/.test(url))              return 'tiktok'
  if (/instagram\.com/.test(url))           return 'instagram'
  if (/linkedin\.com/.test(url))            return 'linkedin'
  if (/(?:^|[./])x\.com|twitter\.com/.test(url)) return 'x'
  if (/threads\.net|threads\.com/.test(url)) return 'threads'
  if (/facebook\.com|fb\.com/.test(url))   return 'facebook'
  if (/reddit\.com/.test(url))             return 'reddit'
  if (/twitch\.tv/.test(url))              return 'twitch'
  return null // unknown — caller must handle this; never silently default
}

// ---------------------------------------------------------------------------
// stripQuery
// Removes query string and fragment from a URL path before regex matching,
// preventing ?utm_source=... from being captured as part of an ID.
// ---------------------------------------------------------------------------
function stripQuery(url: string): string {
  return url.split('?')[0].split('#')[0]
}

// ---------------------------------------------------------------------------
// extractPostId
// Extracts the platform-native post/video/clip ID from the URL.
// Returns null when the URL doesn't match the expected pattern.
// ---------------------------------------------------------------------------
export function extractPostId(url: string, platform: Platform): string | null {
  try {
    const clean = stripQuery(url)

    switch (platform) {
      // YouTube — 11-char video ID; supports watch?v=, youtu.be/, /embed/
      case 'youtube':
        return (
          url.match(/[?&]v=([0-9A-Za-z_-]{11})/)?.[1] ||
          clean.match(/youtu\.be\/([0-9A-Za-z_-]{11})/)?.[1] ||
          clean.match(/\/embed\/([0-9A-Za-z_-]{11})/)?.[1] ||
          clean.match(/\/shorts\/([0-9A-Za-z_-]{11})/)?.[1] ||
          null
        )

      // TikTok — /video/{numeric id} or short-link /t/{alphanumeric}
      case 'tiktok':
        return (
          clean.match(/\/video\/(\d+)/)?.[1] ||
          clean.match(/\/t\/([A-Za-z0-9]+)/)?.[1] ||
          null
        )

      // Instagram — /p/, /reel/, /reels/, /tv/ all share the same ID format
      case 'instagram':
        return clean.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1] || null

      // LinkedIn — /posts/{slug} or legacy activity:{id}
      case 'linkedin':
        return (
          url.match(/activity[:-](\d+)/)?.[1] ||
          clean.match(/\/posts\/([^/]+)/)?.[1] ||
          null
        )

      // X (Twitter) — /status/{numeric id}
      case 'x':
        return clean.match(/\/status\/(\d+)/)?.[1] || null

      // Threads — /@user/post/{id} primary; fallback last path segment
      case 'threads':
        return (
          clean.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] ||
          clean.match(/@[^/]+\/([A-Za-z0-9_-]+)$/)?.[1] ||
          null
        )

      // Facebook — multiple URL formats:
      //   /posts/{id}              — user/page posts (includes pfbid format)
      //   /videos/{id}             — video watch pages
      //   /reel/{id}               — reels
      //   /share/{p|r|v}/{token}   — share redirect links (post/reel/video)
      //   /watch/?v={id}           — watch page video
      //   /watch/live/?v={id}      — live video (same ?v= param)
      //   story.php?story_fbid=    — story or post permalink
      //   permalink.php?story_fbid= — post permalink
      //   ?fbid={id}               — photos (query param, use raw url)
      case 'facebook':
        return (
          clean.match(/\/posts\/([A-Za-z0-9_-]+)/)?.[1] ||
          clean.match(/\/videos\/([A-Za-z0-9_-]+)/)?.[1] ||
          clean.match(/\/reel\/(\d+)/)?.[1] ||
          clean.match(/\/share\/[pvr]\/([A-Za-z0-9_-]+)/)?.[1] ||
          url.match(/[?&]v=(\d+)/)?.[1] ||
          url.match(/[?&]story_fbid=(\d+)/)?.[1] ||
          url.match(/[?&]fbid=(\d+)/)?.[1] ||
          null
        )

      // Reddit — /comments/{alphanumeric id}
      case 'reddit':
        return clean.match(/\/comments\/([A-Za-z0-9]+)/)?.[1] || null

      // Twitch — /videos/{id} (VODs) or /clip/{slug} (clips) or /:channel/clip/{slug}
      case 'twitch':
        return (
          clean.match(/\/videos\/(\d+)/)?.[1] ||
          clean.match(/\/clip\/([A-Za-z0-9_-]+)/)?.[1] ||
          null
        )
    }
  } catch {
    return null
  }
  return null
}

// ---------------------------------------------------------------------------
// getPlatformInfo
// Returns a PlatformInfo object for a given URL + platform.
// YouTube is the only platform that makes a network call (oEmbed).
// All other platforms return safe placeholder data — no API integrations yet.
// ---------------------------------------------------------------------------
export async function getPlatformInfo(
  url: string,
  platform: Platform
): Promise<PlatformInfo | null> {
  const postId = extractPostId(url, platform)
  if (!postId) return null

  const cleanUrl = url.trim()

  switch (platform) {
    // -------------------------------------------------------------------------
    // YouTube — oEmbed for real title + thumbnail; youtube_video_id preserved
    // -------------------------------------------------------------------------
    case 'youtube': {
      const canonicalUrl = `https://www.youtube.com/watch?v=${postId}`
      try {
        const res = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`
        )
        if (res.ok) {
          const data = await res.json()
          return {
            platform: 'youtube',
            platform_url: canonicalUrl,
            platform_post_id: postId,
            youtube_video_id: postId, // backwards compat
            video_title: data.title || `YouTube Video ${postId}`,
            thumbnail_url:
              data.thumbnail_url ||
              `https://img.youtube.com/vi/${postId}/maxresdefault.jpg`,
          }
        }
      } catch {
        // oEmbed failed — use fallback below
      }
      // Fallback when oEmbed is unavailable
      return {
        platform: 'youtube',
        platform_url: canonicalUrl,
        platform_post_id: postId,
        youtube_video_id: postId, // backwards compat
        video_title: `YouTube Video ${postId}`,
        thumbnail_url: `https://img.youtube.com/vi/${postId}/maxresdefault.jpg`,
      }
    }

    // -------------------------------------------------------------------------
    // All other platforms — safe placeholders, no network calls
    // -------------------------------------------------------------------------
    case 'tiktok':
      return {
        platform: 'tiktok',
        platform_url: cleanUrl,
        platform_post_id: postId,
        video_title: `TikTok Video ${postId}`,
        thumbnail_url: '',
      }

    case 'instagram':
      return {
        platform: 'instagram',
        platform_url: cleanUrl,
        platform_post_id: postId,
        video_title: `Instagram Post ${postId}`,
        thumbnail_url: '',
      }

    case 'linkedin':
      return {
        platform: 'linkedin',
        platform_url: cleanUrl,
        platform_post_id: postId,
        video_title: `LinkedIn Post ${postId}`,
        thumbnail_url: '',
      }

    case 'x':
      return {
        platform: 'x',
        platform_url: cleanUrl,
        platform_post_id: postId,
        video_title: `X Post ${postId}`,
        thumbnail_url: '',
      }

    case 'threads':
      return {
        platform: 'threads',
        platform_url: cleanUrl,
        platform_post_id: postId,
        video_title: `Threads Post ${postId}`,
        thumbnail_url: '',
      }

    case 'facebook':
      return {
        platform: 'facebook',
        platform_url: cleanUrl,
        platform_post_id: postId,
        video_title: `Facebook Post ${postId}`,
        thumbnail_url: '',
      }

    case 'reddit':
      return {
        platform: 'reddit',
        platform_url: cleanUrl,
        platform_post_id: postId,
        video_title: `Reddit Post ${postId}`,
        thumbnail_url: '',
      }

    case 'twitch':
      return {
        platform: 'twitch',
        platform_url: cleanUrl,
        platform_post_id: postId,
        video_title: `Twitch Video ${postId}`,
        thumbnail_url: '',
      }
  }
}
