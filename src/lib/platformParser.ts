export type Platform = 'youtube' | 'tiktok' | 'instagram' | 'linkedin' | 'x' | 'threads'

export interface PlatformInfo {
  platform: Platform
  platform_url: string
  platform_post_id: string
  video_title: string
  thumbnail_url: string
  youtube_video_id?: string  // kept for backwards compat
}

export const PLATFORM_CONFIG: Record<Platform, {
  label: string
  color: string
  placeholder: string
  icon: string
}> = {
  youtube:   { label: 'YouTube',   color: '#FF0000', placeholder: 'https://youtube.com/watch?v=...', icon: '▶' },
  tiktok:    { label: 'TikTok',    color: '#00f2ea', placeholder: 'https://tiktok.com/@user/video/...', icon: '♪' },
  instagram: { label: 'Instagram', color: '#E1306C', placeholder: 'https://instagram.com/p/...', icon: '◉' },
  linkedin:  { label: 'LinkedIn',  color: '#0077B5', placeholder: 'https://linkedin.com/posts/...', icon: 'in' },
  x:         { label: 'X',         color: '#ffffff', placeholder: 'https://x.com/user/status/...', icon: '𝕏' },
  threads:   { label: 'Threads',   color: '#ffffff', placeholder: 'https://threads.net/@user/post/...', icon: '@' },
}

// Detect platform from URL automatically
export function detectPlatform(url: string): Platform | null {
  if (/youtube\.com|youtu\.be/.test(url)) return 'youtube'
  if (/tiktok\.com/.test(url)) return 'tiktok'
  if (/instagram\.com/.test(url)) return 'instagram'
  if (/linkedin\.com/.test(url)) return 'linkedin'
  if (/x\.com|twitter\.com/.test(url)) return 'x'
  if (/threads\.net/.test(url)) return 'threads'
  return null
}

// Extract post ID from URL per platform
export function extractPostId(url: string, platform: Platform): string | null {
  try {
    switch (platform) {
      case 'youtube': {
        return url.match(/(?:\/|v=|youtu\.be\/)([0-9A-Za-z_-]{11})/)?.[1] || null
      }
      case 'tiktok': {
        return url.match(/\/video\/(\d+)/)?.[1] || null
      }
      case 'instagram': {
        return url.match(/\/p\/([A-Za-z0-9_-]+)/)?.[1] || null
      }
      case 'linkedin': {
        return url.match(/activity[:-](\d+)/)?.[1] 
          || url.match(/posts\/([^/?]+)/)?.[1] 
          || null
      }
      case 'x': {
        return url.match(/\/status\/(\d+)/)?.[1] || null
      }
      case 'threads': {
        return url.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] || null
      }
    }
  } catch {
    return null
  }
  return null
}

// Fetch metadata — YouTube uses oEmbed, others use placeholder
export async function getPlatformInfo(url: string, platform: Platform): Promise<PlatformInfo | null> {
  const postId = extractPostId(url, platform)
  if (!postId) return null

  const cleanUrl = url.trim()

  switch (platform) {
    case 'youtube': {
      try {
        const res = await fetch(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${postId}&format=json`
        )
        if (res.ok) {
          const data = await res.json()
          return {
            platform: 'youtube',
            platform_url: `https://www.youtube.com/watch?v=${postId}`,
            platform_post_id: postId,
            youtube_video_id: postId,
            video_title: data.title || `YouTube Video ${postId}`,
            thumbnail_url: data.thumbnail_url || `https://img.youtube.com/vi/${postId}/maxresdefault.jpg`,
          }
        }
      } catch {}
      // Fallback
      return {
        platform: 'youtube',
        platform_url: `https://www.youtube.com/watch?v=${postId}`,
        platform_post_id: postId,
        youtube_video_id: postId,
        video_title: `YouTube Video ${postId}`,
        thumbnail_url: `https://img.youtube.com/vi/${postId}/maxresdefault.jpg`,
      }
    }

    case 'tiktok': {
      return {
        platform: 'tiktok',
        platform_url: cleanUrl,
        platform_post_id: postId,
        video_title: `TikTok Video ${postId}`,
        thumbnail_url: '',
      }
    }

    case 'instagram': {
      return {
        platform: 'instagram',
        platform_url: cleanUrl,
        platform_post_id: postId,
        video_title: `Instagram Post ${postId}`,
        thumbnail_url: '',
      }
    }

    case 'linkedin': {
      return {
        platform: 'linkedin',
        platform_url: cleanUrl,
        platform_post_id: postId,
        video_title: `LinkedIn Post ${postId}`,
        thumbnail_url: '',
      }
    }

    case 'x': {
      return {
        platform: 'x',
        platform_url: cleanUrl,
        platform_post_id: postId,
        video_title: `X Post ${postId}`,
        thumbnail_url: '',
      }
    }

    case 'threads': {
      return {
        platform: 'threads',
        platform_url: cleanUrl,
        platform_post_id: postId,
        video_title: `Threads Post ${postId}`,
        thumbnail_url: '',
      }
    }
  }
}
