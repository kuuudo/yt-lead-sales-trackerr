/**
 * src/services/asset/identifyResource.ts
 *
 * "What is this?" — the Identify step. Wraps the EXISTING detectPlatform()
 * from lib/platformParser.ts unmodified — never alters it, per that file's
 * own header rules.
 *
 * Per Design Lock:
 *   §3 platform NOT NULL      -> unrecognized URL falls back to 'website'
 *   §4 resource_type NOT NULL -> unrecognized platform has no auto
 *                                 resource_type; caller must prompt the
 *                                 user to pick one manually before import.
 */

import { detectPlatform, type Platform } from '../../lib/platformParser';
import type { ResourceType } from '../../lib/videoFormatters';

export interface IdentifyResult {
  platform: Platform | 'website';
  /** null means: ask the user to pick manually (Design Lock §4). */
  resourceType: ResourceType | null;
}

// Platform -> resource_type, per Design Lock §4. Deliberately NOT placed in
// videoFormatters.tsx: this is Import/Asset classification logic, and that
// file's own header requires it stay ignorant of non-video/non-element
// concepts.
const PLATFORM_RESOURCE_TYPE: Record<Platform, ResourceType> = {
  youtube:   'video',
  tiktok:    'video',
  twitch:    'video',
  instagram: 'social_post',
  linkedin:  'social_post',
  x:         'social_post',
  threads:   'social_post',
  facebook:  'social_post',
  reddit:    'social_post',
};

export function identifyResource(url: string): IdentifyResult {
  const platform = detectPlatform(url);

  if (!platform) {
    return { platform: 'website', resourceType: null };
  }

  return { platform, resourceType: PLATFORM_RESOURCE_TYPE[platform] };
}