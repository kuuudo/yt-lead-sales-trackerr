// ─────────────────────────────────────────────────────────────────────────────
// videoFormatters.ts
//
// Shared platform parsing and content display utilities.
//
// EXTRACTION HISTORY
// ══════════════════
// All functions were originally defined as local declarations inside the
// Videos() component body in Videos.tsx.  They have been moved here verbatim —
// zero logic changes, zero regex changes, zero behavior changes — so that
// Dashboard.tsx can consume the same formatting logic without duplication.
//
// RULES FOR THIS FILE
// ═══════════════════
// 1. Pure functions only. No React hooks. No component state. No side effects.
// 2. No behavior changes without updating both Videos.tsx and Dashboard.tsx.
// 3. Add new platforms here first, then consume in both pages.
// 4. renderContentIdentity() is the single JSX entry point for both pages.
//    It produces the canonical "Platform • identifier" format.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Thumbnail resolution
// ─────────────────────────────────────────────────────────────────────────────

// Verbatim from Videos.tsx — paths match public/platform-thumbnails/ directory.
// YouTube is intentionally absent: YouTube always provides a thumbnail_url.
export const PLATFORM_THUMBNAILS: Partial<Record<string, string>> = {
  threads:   '/platform-thumbnails/threads.jpg',
  reddit:    '/platform-thumbnails/reddit.jpg',
  x:         '/platform-thumbnails/x.jpg',
  tiktok:    '/platform-thumbnails/tiktok.jpg',
  linkedin:  '/platform-thumbnails/linkedin.jpg',
  instagram: '/platform-thumbnails/Instagram.jpg',
  facebook:  '/platform-thumbnails/fb.jpg',
  twitch:    '/platform-thumbnails/twitch.jpg',
};

// Verbatim from Videos.tsx resolveThumbnail().
// Accepts any object with thumbnail_url and platform — works for both the
// full Video type (Videos.tsx) and ProcessedVideoRow.video (Dashboard.tsx).
export function resolveThumbnail(v: {
  thumbnail_url?: string | null;
  platform?: string | null;
}): string {
  if (v.thumbnail_url && v.thumbnail_url.trim() !== '') return v.thumbnail_url;
  if (v.platform && PLATFORM_THUMBNAILS[v.platform]) return PLATFORM_THUMBNAILS[v.platform]!;
  return `https://placehold.co/160x90/18181b/52525b?text=${encodeURIComponent((v.platform ?? 'post').toUpperCase())}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform icon glyphs — verbatim from Videos.tsx getPlatformIcon()
// ─────────────────────────────────────────────────────────────────────────────

export function getPlatformIcon(platform: string): string {
  const icons: Record<string, string> = {
    youtube:   '▶',
    tiktok:    '♪',
    instagram: '◉',
    linkedin:  'in',
    x:         '𝕏',
    threads:   '@',
    facebook:  'f',
    reddit:    '●',
    twitch:    '⬡',
  };
  return icons[platform] || '?';
}

// ─────────────────────────────────────────────────────────────────────────────
// URL parsers — verbatim from Videos.tsx, one function per platform
// ─────────────────────────────────────────────────────────────────────────────

// Reddit
export function parseSubreddit(platformUrl: string | null | undefined): string | null {
  if (!platformUrl) return null;
  const match = platformUrl.match(/\/r\/([^/]+)/);
  return match ? match[1] : null;
}

export function resolveRedditTitle(platformUrl: string | null | undefined): string | null {
  if (!platformUrl) return null;
  // Extract slug from /comments/{id}/{slug}/
  const match = platformUrl.match(/\/comments\/[^/]+\/([^/]+)/);
  if (!match) return null;
  return match[1]
    .replace(/_/g, ' ')
    .replace(/^./, c => c.toUpperCase());
}

// X
export function parseXUsername(platformUrl: string | null | undefined): string | null {
  if (!platformUrl) return null;
  // Extract username from https://x.com/{username}/status/{postId}
  const match = platformUrl.match(/x\.com\/([^/]+)\/status\//);
  return match ? match[1] : null;
}

export function parseXPostId(platformUrl: string | null | undefined): string | null {
  if (!platformUrl) return null;
  // Extract numeric postId from https://x.com/{username}/status/{postId}
  const match = platformUrl.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
}

export function formatXDisplayId(postId: string | null | undefined): string {
  if (!postId) return '';
  // Show first 4–6 digits then ellipsis — never the full ID
  return postId.slice(0, 6) + '...';
}

export function resolveXTitle(videoTitle: string | null | undefined): string {
  if (!videoTitle) return 'X Post';
  // Reject placeholder patterns: "X Post", "X Post 204148...", bare numeric IDs
  const isPlaceholder =
    /^x\s+post(\s+\d+)?$/i.test(videoTitle.trim()) ||
    /^\d+$/.test(videoTitle.trim());
  return isPlaceholder ? 'X Post' : videoTitle;
}

// Threads
export function parseThreadsUsername(platformUrl: string | null | undefined): string | null {
  if (!platformUrl) return null;
  const match = platformUrl.match(/threads\.(?:com|net)\/@([^/]+)/);
  return match ? match[1] : null;
}

export function parseThreadsPostId(platformUrl: string | null | undefined): string | null {
  if (!platformUrl) return null;
  const match = platformUrl.match(/\/post\/([^/?#]+)/);
  return match ? match[1] : null;
}

export function resolveThreadsTitle(videoTitle: string | null | undefined): string {
  if (!videoTitle) return 'Threads Post';
  const isPlaceholder = /^threads\s+post(\s+\S+)?$/i.test(videoTitle.trim());
  return isPlaceholder ? 'Threads Post' : videoTitle;
}

// TikTok
export function parseTikTokUsername(platformUrl: string | null | undefined): string | null {
  if (!platformUrl) return null;
  const match = platformUrl.match(/tiktok\.com\/@([^/]+)/);
  return match ? match[1] : null;
}

export function parseTikTokVideoId(platformUrl: string | null | undefined): string | null {
  if (!platformUrl) return null;
  const match = platformUrl.match(/\/video\/(\d+)/);
  return match ? match[1] : null;
}

export function formatTikTokDisplayId(videoId: string | null | undefined): string {
  if (!videoId) return '';
  return videoId.slice(0, 6) + '...';
}

// LinkedIn
export function parseLinkedInAuthor(platformUrl: string | null | undefined): string | null {
  if (!platformUrl) return null;
  const match = platformUrl.match(/linkedin\.com\/posts\/([^_/]+)/);
  return match ? match[1] : null;
}

export function parseLinkedInPostId(platformUrl: string | null | undefined): string | null {
  if (!platformUrl) return null;
  const activityMatch = platformUrl.match(/activity[:\-](\d+)/);
  if (activityMatch) return activityMatch[1];
  const postMatch = platformUrl.match(/-(\d{10,})-/);
  return postMatch ? postMatch[1] : null;
}

export function formatLinkedInDisplayId(postId: string | null | undefined): string {
  if (!postId) return '';
  return postId.slice(0, 6) + '...';
}

// Twitch
export function parseTwitchVideoId(platformUrl: string | null | undefined): string | null {
  if (!platformUrl) return null;
  const match = platformUrl.match(/\/videos\/(\d+)/);
  return match ? match[1] : null;
}

export function parseTwitchChannel(platformUrl: string | null | undefined): string | null {
  if (!platformUrl) return null;
  if (/\/videos\//.test(platformUrl)) return null;
  const match = platformUrl.match(/twitch\.tv\/([^/?#]+)/);
  return match ? match[1] : null;
}

export function formatTwitchDisplayId(videoId: string | null | undefined): string {
  if (!videoId) return '';
  return videoId.slice(0, 6) + '...';
}

// Instagram
export function resolveInstagramType(platformUrl: string | null | undefined): 'Post' | 'Reel' {
  if (!platformUrl) return 'Post';
  if (/\/reels?\//.test(platformUrl)) return 'Reel';
  return 'Post';
}

// Facebook
export function resolveFacebookType(
  platformUrl: string | null | undefined,
): 'Reel' | 'Live' | 'Video' | 'Post' | '' {
  if (!platformUrl) return '';
  const cleanUrl = platformUrl.split('?')[0].toLowerCase();
  if (/\/reel(?:s)?\//.test(cleanUrl) || /\/share\/r\//.test(cleanUrl)) return 'Reel';
  if (/\/watch\/live\//.test(cleanUrl)) return 'Live';
  if (
    /\/watch\b/.test(cleanUrl) ||
    /\/videos\//.test(cleanUrl) ||
    /\/share\/v\//.test(cleanUrl)
  )
    return 'Video';
  if (
    /\/posts\//.test(cleanUrl) ||
    /\/share\/p\//.test(cleanUrl) ||
    /permalink\.php/.test(cleanUrl) ||
    /story\.php/.test(cleanUrl)
  )
    return 'Post';
  return '';
}

// ─────────────────────────────────────────────────────────────────────────────
// renderContentIdentity
//
// Canonical "Platform • identifier" JSX renderer.
// Produces the exact same output as the ternary chains in Videos.tsx card view
// (lines ~1367–1387) and list view (lines ~1215–1232).
//
// Color values are verbatim from Videos.tsx:
//   Platform label : rgba(255, 69, 0, 0.7)
//   Bullet         : text-zinc-600
//   Identifier     : text-zinc-200 (implicit — inherits from parent)
//
// Used by Dashboard.tsx in the leaderboard content cell.
// Videos.tsx can optionally replace its inline ternary chain with this call
// to guarantee identical output, but the ternary chain is preserved there for
// now to make the diff reviewable.
// ─────────────────────────────────────────────────────────────────────────────

const PLATFORM_ACCENT = 'rgba(255, 69, 0, 0.7)';

export function renderContentIdentity(video: {
  platform?:       string | null;
  platform_url?:   string | null;
  platform_post_id?: string | null;
  video_title?:    string | null;
}): React.ReactNode {
  const {
    platform,
    platform_url,
    platform_post_id,
    video_title,
  } = video;

  const accent = (label: string) => (
    <span style={{ color: PLATFORM_ACCENT }}>{label}</span>
  );
  const bullet = <span className="text-zinc-600 mx-1">•</span>;
  const id     = (val: string) => <span className="text-zinc-200">{val}</span>;

  switch (platform) {
    case 'reddit': {
      const subreddit   = parseSubreddit(platform_url);
      const redditTitle = resolveRedditTitle(platform_url);
      return (
        <>
          {accent(subreddit ? `r/${subreddit}` : 'Reddit')}
          {bullet}
          {id(redditTitle ?? video_title ?? '—')}
        </>
      );
    }
    case 'x': {
      const xUsername  = parseXUsername(platform_url);
      const xPostId    = parseXPostId(platform_url);
      const xDisplayId = formatXDisplayId(xPostId);
      return (
        <>
          {accent('X Post')}
          {bullet}
          {id(xUsername ? `${xUsername}/status/${xDisplayId}` : 'X')}
        </>
      );
    }
    case 'threads': {
      const threadsPostId = parseThreadsPostId(platform_url);
      return (
        <>
          {accent('Threads')}
          {bullet}
          {id(threadsPostId ?? 'Post')}
        </>
      );
    }
    case 'tiktok': {
      const tikTokVideoId   = parseTikTokVideoId(platform_url);
      const tikTokDisplayId = formatTikTokDisplayId(tikTokVideoId);
      return (
        <>
          {accent('TikTok')}
          {bullet}
          {id(tikTokDisplayId || 'Video')}
        </>
      );
    }
    case 'linkedin': {
      const linkedInPostId    = parseLinkedInPostId(platform_url);
      const linkedInDisplayId = formatLinkedInDisplayId(linkedInPostId);
      return (
        <>
          {accent('LinkedIn')}
          {bullet}
          {id(linkedInDisplayId || '—')}
        </>
      );
    }
    case 'instagram': {
      const instagramType      = resolveInstagramType(platform_url);
      const instagramDisplayId = platform_post_id?.slice(0, 8) ?? null;
      return (
        <>
          {accent(`Instagram ${instagramType}`)}
          {bullet}
          {id(instagramDisplayId ?? '—')}
        </>
      );
    }
    case 'facebook': {
      const facebookType = resolveFacebookType(platform_url);
      return (
        <>
          {accent(`Facebook${facebookType ? ` ${facebookType}` : ''}`)}
          {bullet}
          {id(platform_post_id?.slice(0, 8) ?? '—')}
        </>
      );
    }
    case 'twitch': {
      const twitchVideoId   = parseTwitchVideoId(platform_url);
      const twitchChannel   = parseTwitchChannel(platform_url);
      const twitchDisplayId = formatTwitchDisplayId(twitchVideoId);
      return (
        <>
          {accent('Twitch')}
          {bullet}
          {id(twitchVideoId ? twitchDisplayId : (twitchChannel ? `@${twitchChannel}` : '—'))}
        </>
      );
    }
    case 'youtube':
    default: {
      return (
        <>
          {accent('YouTube')}
          {bullet}
          {id(video_title ?? '—')}
        </>
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaign Element utilities
//
// Campaign Elements are NOT videos. They are a separate asset type (landing
// pages, checkouts, newsletters, etc.) used by Assignment Picker, Campaign
// Detail, and other non-Video surfaces.
//
// These utilities are intentionally independent of the video formatter logic
// above. They do not call, wrap, or share state with resolveThumbnail(),
// renderContentIdentity(), or any platform parser. Adding a Campaign Element
// type must never require touching video logic, and vice versa.
// ─────────────────────────────────────────────────────────────────────────────

export type CampaignElementType =
  | 'landing_page'
  | 'checkout'
  | 'newsletter'
  | 'consultation'
  | 'sales_call'
  | 'thank_you'
  | 'lead_magnet';

// Fixed thumbnails per element type. No custom/override thumbnail support —
// Campaign Elements always resolve to one of these fixed images, or the
// placeholder fallback in resolveElementThumbnail().c
export const ELEMENT_THUMBNAILS: Partial<Record<CampaignElementType, string>> = {
  landing_page:  '/element-thumbnails/landing_page.jpg',
  checkout:      '/element-thumbnails/checkout.jpg',
  newsletter:    '/element-thumbnails/newsletter.jpg',
  consultation:  '/element-thumbnails/consultation.jpg',
  sales_call:    '/element-thumbnails/sales_call.jpg',
  thank_you:     '/element-thumbnails/thank_you.jpg',
  lead_magnet:   '/element-thumbnails/lead_magnet.jpg',
};

// UI labels for each element type.
export const ELEMENT_TYPE_LABELS: Record<CampaignElementType, string> = {
  landing_page:  'Landing Page',
  checkout:      'Checkout',
  newsletter:    'Newsletter',
  consultation:  'Consultation',
  sales_call:    'Sales Call',
  thank_you:     'Thank You',
  lead_magnet:   'Lead Magnet',
};

// Mirrors resolveThumbnail()'s fallback pattern: fixed thumbnail if known,
// otherwise a placehold.co placeholder labeled with the element type.
// No custom thumbnail_url input — Campaign Elements have no custom thumbnails.
export function resolveElementThumbnail(elementType: CampaignElementType | string): string {
  const known = ELEMENT_THUMBNAILS[elementType as CampaignElementType];
  if (known) return known;
  return `https://placehold.co/160x90/18181b/52525b?text=${encodeURIComponent(String(elementType).toUpperCase())}`;
}

// Mirrors the lookup-with-fallback pattern of getPlatformIcon().
// Falls back to a title-cased version of the raw element type string
// (underscores replaced with spaces) if the type isn't in ELEMENT_TYPE_LABELS.
export function getElementTypeLabel(elementType: CampaignElementType | string): string {
  const known = ELEMENT_TYPE_LABELS[elementType as CampaignElementType];
  if (known) return known;
  return String(elementType)
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}