/**
 * Pure analytics soft-filter for Entity Archive flags only.
 *
 * - No Supabase, no resolvers, no archive_ui_visibility.
 * - Does not define archive business rules (resolvers own that).
 * - Does not handle Marketer archive or Archive Impact.
 * - Default: show everything (all hide options off / missing).
 */

export interface AnalyticsEntityArchiveFlags {
  assetArchived?: boolean;
  videoArchived?: boolean;
  campaignArchived?: boolean;
  promotionArchived?: boolean;
}

export interface AnalyticsArchiveHideOptions {
  hideArchivedAsset?: boolean;
  hideArchivedVideo?: boolean;
  hideArchivedCampaign?: boolean;
  hideArchivedPromotion?: boolean;
}

/**
 * Filter analytics rows by optional Hide Archived X toggles.
 * Missing / undefined flags are treated as not archived (row kept for that dimension).
 */
export function applyAnalyticsArchiveFilters<T>(
  rows: T[],
  getFlags: (row: T) => AnalyticsEntityArchiveFlags,
  options: AnalyticsArchiveHideOptions = {},
): T[] {
  const {
    hideArchivedAsset = false,
    hideArchivedVideo = false,
    hideArchivedCampaign = false,
    hideArchivedPromotion = false,
  } = options;

  if (
    !hideArchivedAsset &&
    !hideArchivedVideo &&
    !hideArchivedCampaign &&
    !hideArchivedPromotion
  ) {
    return rows;
  }

  return rows.filter((row) => {
    const flags = getFlags(row);

    if (hideArchivedAsset && flags.assetArchived === true) return false;
    if (hideArchivedVideo && flags.videoArchived === true) return false;
    if (hideArchivedCampaign && flags.campaignArchived === true) return false;
    if (hideArchivedPromotion && flags.promotionArchived === true) return false;

    return true;
  });
}