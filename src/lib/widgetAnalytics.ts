import { getAnalyticsEngine } from '../lib/analyticsEngine'

export function getWidgetAnalytics(
  config: any,
  pool: any
) {
  const videos =
    config.selectedVideoIds?.length > 0
      ? pool.videos.filter((v: any) =>
          config.selectedVideoIds.includes(v.id)
        )
      : pool.videos

  return getAnalyticsEngine({
    videos,
    campaigns: pool.campaigns,
    rawEvents: pool.rawEvents,
    stripePurchases: pool.stripePurchases,
    pixelPurchases: pool.pixelPurchases,

    dateRange: config.dateRange,
    selectedCampaignId: config.selectedCampaignId,
    selectedGoals: config.selectedGoals,
    selectedLeadMagnets: config.selectedLeadMagnets,
    activeSource: config.activeSource,
    includeEV: config.includeEV,

    sortConfig: { key: 'total_revenue', direction: 'desc' }
  })
}