// lib/mockAnalyticsData.ts
// UI-only mock data for the unified Analytics hierarchy.
// Relationships are intentional so drill-down feels real.

export type MockCampaign = {
  id: string;
  name: string;
  clicks: number;
  revenue: number;
  purchases: number;
  rpc: number;
};

export type MockMarketer = {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  clicks: number;
  revenue: number;
  purchases: number;
  rpc: number;
};

export type MockPromotion = {
  id: string;
  name: string;
  campaignId: string;
  campaignName: string;
  marketerId: string;
  marketerName: string;
  clicks: number;
  revenue: number;
  purchases: number;
  rpc: number;
};

export type MockAssetRow = {
  id: string; // composite key assetId::videoId for uniqueness in lists
  assetId: string;
  assetTitle: string;
  assetType: 'campaign_element' | 'promotional_video' | 'resource' | 'content_video';
  promotingVideoId: string;
  promotingVideoTitle: string;
  contentOwnerId: string;
  contentOwnerName: string;
  campaignId: string;
  campaignName: string;
  marketerId: string | null;
  marketerName: string | null;
  promotionId: string | null;
  promotionName: string | null;
  platform: string;
  assetClicks: number;
  totalRevenue: number;
  landingPageClicks: number;
  directPurchases: number;
  leadMagnetClicks: number;
  newsletterClicks: number;
  newsletterOptins: number;
  callBookingClicks: number;
  callBookingsConfirmed: number;
  consultationPageClicks: number;
  consultationPurchases: number;
  directOfferSales: number;
  estimatedCallRevenue: number;
  consultationRevenue: number;
  revenuePerClick: number;
  createdAt: string;
};

export type MockContentRow = {
  id: string;
  title: string;
  campaignId: string;
  campaignName: string;
  platform: string;
  clicks: number;
  revenue: number;
  purchases: number;
  consultations: number;
  rpc: number;
  createdAt: string;
};

export const MOCK_CAMPAIGNS: MockCampaign[] = [
  { id: 'camp-1', name: 'Global Income Source System', clicks: 28400, revenue: 62400, purchases: 182, rpc: 2.2 },
  { id: 'camp-2', name: 'Global Income Source System 2', clicks: 15200, revenue: 31800, purchases: 94, rpc: 2.09 },
  { id: 'camp-3', name: 'Phase 1 Test', clicks: 6100, revenue: 9800, purchases: 31, rpc: 1.61 },
];

export const MOCK_MARKETERS: MockMarketer[] = [
  { id: 'mkt-ali', name: 'Ali', campaignId: 'camp-1', campaignName: 'Global Income Source System', clicks: 12400, revenue: 28400, purchases: 82, rpc: 2.29 },
  { id: 'mkt-john', name: 'John', campaignId: 'camp-1', campaignName: 'Global Income Source System', clicks: 8200, revenue: 18200, purchases: 51, rpc: 2.22 },
  { id: 'mkt-sarah', name: 'Sarah', campaignId: 'camp-1', campaignName: 'Global Income Source System', clicks: 4100, revenue: 7200, purchases: 22, rpc: 1.76 },
  { id: 'mkt-mike', name: 'Mike', campaignId: 'camp-2', campaignName: 'Global Income Source System 2', clicks: 9100, revenue: 19800, purchases: 58, rpc: 2.18 },
  { id: 'mkt-john-2', name: 'John', campaignId: 'camp-2', campaignName: 'Global Income Source System 2', clicks: 3800, revenue: 7200, purchases: 21, rpc: 1.89 },
  { id: 'mkt-sara-3', name: 'Sarah', campaignId: 'camp-3', campaignName: 'Phase 1 Test', clicks: 2900, revenue: 4100, purchases: 14, rpc: 1.41 },
];

export const MOCK_PROMOTIONS: MockPromotion[] = [
  { id: 'promo-a', name: 'Promotion A', campaignId: 'camp-1', campaignName: 'Global Income Source System', marketerId: 'mkt-john', marketerName: 'John', clicks: 5200, revenue: 11200, purchases: 31, rpc: 2.15 },
  { id: 'promo-b', name: 'Promotion B', campaignId: 'camp-1', campaignName: 'Global Income Source System', marketerId: 'mkt-john', marketerName: 'John', clicks: 3000, revenue: 7000, purchases: 20, rpc: 2.33 },
  { id: 'promo-c', name: 'Promotion C', campaignId: 'camp-1', campaignName: 'Global Income Source System', marketerId: 'mkt-ali', marketerName: 'Ali', clicks: 7800, revenue: 18400, purchases: 54, rpc: 2.36 },
  { id: 'promo-d', name: 'Promotion D', campaignId: 'camp-1', campaignName: 'Global Income Source System', marketerId: 'mkt-sarah', marketerName: 'Sarah', clicks: 4100, revenue: 7200, purchases: 22, rpc: 1.76 },
  { id: 'promo-e', name: 'Promotion E', campaignId: 'camp-2', campaignName: 'Global Income Source System 2', marketerId: 'mkt-mike', marketerName: 'Mike', clicks: 6100, revenue: 13200, purchases: 39, rpc: 2.16 },
  { id: 'promo-f', name: 'Promotion F', campaignId: 'camp-2', campaignName: 'Global Income Source System 2', marketerId: 'mkt-john-2', marketerName: 'John', clicks: 3800, revenue: 7200, purchases: 21, rpc: 1.89 },
];

export const MOCK_ASSETS: MockAssetRow[] = [
  // Promotion A (John / Campaign 1)
  {
    id: 'asset-a::vid-1', assetId: 'asset-a', assetTitle: 'Asset A — Sales Call Page',
    assetType: 'campaign_element', promotingVideoId: 'vid-1', promotingVideoTitle: 'Video A — Hook for Sales Call',
    contentOwnerId: 'mkt-john', contentOwnerName: 'John', campaignId: 'camp-1', campaignName: 'Global Income Source System',
    marketerId: 'mkt-john', marketerName: 'John', promotionId: 'promo-a', promotionName: 'Promotion A',
    platform: 'youtube', assetClicks: 2100, totalRevenue: 4800, landingPageClicks: 0, directPurchases: 0,
    leadMagnetClicks: 0, newsletterClicks: 0, newsletterOptins: 0, callBookingClicks: 2100, callBookingsConfirmed: 18,
    consultationPageClicks: 0, consultationPurchases: 0, directOfferSales: 0, estimatedCallRevenue: 4800,
    consultationRevenue: 0, revenuePerClick: 2.29, createdAt: '2026-07-12T10:00:00Z',
  },
  {
    id: 'asset-b::vid-2', assetId: 'asset-b', assetTitle: 'Asset B — Newsletter Opt-in',
    assetType: 'resource', promotingVideoId: 'vid-2', promotingVideoTitle: 'Video B — List Building',
    contentOwnerId: 'mkt-john', contentOwnerName: 'John', campaignId: 'camp-1', campaignName: 'Global Income Source System',
    marketerId: 'mkt-john', marketerName: 'John', promotionId: 'promo-a', promotionName: 'Promotion A',
    platform: 'instagram', assetClicks: 1800, totalRevenue: 0, landingPageClicks: 0, directPurchases: 0,
    leadMagnetClicks: 0, newsletterClicks: 1800, newsletterOptins: 420, callBookingClicks: 0, callBookingsConfirmed: 0,
    consultationPageClicks: 0, consultationPurchases: 0, directOfferSales: 0, estimatedCallRevenue: 0,
    consultationRevenue: 0, revenuePerClick: 0, createdAt: '2026-08-01T14:00:00Z',
  },
  {
    id: 'asset-c::vid-3', assetId: 'asset-c', assetTitle: 'Asset C — Direct Offer Landing',
    assetType: 'campaign_element', promotingVideoId: 'vid-3', promotingVideoTitle: 'Video C — Offer Close',
    contentOwnerId: 'mkt-john', contentOwnerName: 'John', campaignId: 'camp-1', campaignName: 'Global Income Source System',
    marketerId: 'mkt-john', marketerName: 'John', promotionId: 'promo-a', promotionName: 'Promotion A',
    platform: 'youtube', assetClicks: 1300, totalRevenue: 6400, landingPageClicks: 1300, directPurchases: 14,
    leadMagnetClicks: 0, newsletterClicks: 0, newsletterOptins: 0, callBookingClicks: 0, callBookingsConfirmed: 0,
    consultationPageClicks: 0, consultationPurchases: 0, directOfferSales: 6400, estimatedCallRevenue: 0,
    consultationRevenue: 0, revenuePerClick: 4.92, createdAt: '2026-06-20T09:00:00Z',
  },
  // Promotion B (John / Campaign 1)
  {
    id: 'asset-d::vid-4', assetId: 'asset-d', assetTitle: 'Asset D — Consultation Page',
    assetType: 'campaign_element', promotingVideoId: 'vid-4', promotingVideoTitle: 'Video D — Consult Pitch',
    contentOwnerId: 'mkt-john', contentOwnerName: 'John', campaignId: 'camp-1', campaignName: 'Global Income Source System',
    marketerId: 'mkt-john', marketerName: 'John', promotionId: 'promo-b', promotionName: 'Promotion B',
    platform: 'youtube', assetClicks: 3000, totalRevenue: 7000, landingPageClicks: 0, directPurchases: 0,
    leadMagnetClicks: 0, newsletterClicks: 0, newsletterOptins: 0, callBookingClicks: 0, callBookingsConfirmed: 0,
    consultationPageClicks: 3000, consultationPurchases: 12, directOfferSales: 0, estimatedCallRevenue: 0,
    consultationRevenue: 7000, revenuePerClick: 2.33, createdAt: '2026-08-10T11:00:00Z',
  },
  // Promotion C (Ali)
  {
    id: 'asset-e::vid-5', assetId: 'asset-e', assetTitle: 'Asset E — Lead Magnet PDF',
    assetType: 'resource', promotingVideoId: 'vid-5', promotingVideoTitle: 'Video E — Free Guide',
    contentOwnerId: 'mkt-ali', contentOwnerName: 'Ali', campaignId: 'camp-1', campaignName: 'Global Income Source System',
    marketerId: 'mkt-ali', marketerName: 'Ali', promotionId: 'promo-c', promotionName: 'Promotion C',
    platform: 'instagram', assetClicks: 4200, totalRevenue: 0, landingPageClicks: 0, directPurchases: 0,
    leadMagnetClicks: 4200, newsletterClicks: 0, newsletterOptins: 0, callBookingClicks: 0, callBookingsConfirmed: 0,
    consultationPageClicks: 0, consultationPurchases: 0, directOfferSales: 0, estimatedCallRevenue: 0,
    consultationRevenue: 0, revenuePerClick: 0, createdAt: '2026-07-28T16:00:00Z',
  },
  {
    id: 'asset-f::vid-6', assetId: 'asset-f', assetTitle: 'Asset F — Promotional Video Clip',
    assetType: 'promotional_video', promotingVideoId: 'vid-6', promotingVideoTitle: 'Video F — Short Form Promo',
    contentOwnerId: 'mkt-ali', contentOwnerName: 'Ali', campaignId: 'camp-1', campaignName: 'Global Income Source System',
    marketerId: 'mkt-ali', marketerName: 'Ali', promotionId: 'promo-c', promotionName: 'Promotion C',
    platform: 'youtube', assetClicks: 3600, totalRevenue: 18400, landingPageClicks: 1200, directPurchases: 22,
    leadMagnetClicks: 0, newsletterClicks: 800, newsletterOptins: 190, callBookingClicks: 900, callBookingsConfirmed: 11,
    consultationPageClicks: 700, consultationPurchases: 8, directOfferSales: 9200, estimatedCallRevenue: 4200,
    consultationRevenue: 5000, revenuePerClick: 5.11, createdAt: '2026-08-15T08:00:00Z',
  },
  // Own-asset style rows (no marketer / no promotion) for Campaign 1 owner path
  {
    id: 'asset-own-1::vid-own-1', assetId: 'asset-own-1', assetTitle: 'Own Asset — Campaign Landing',
    assetType: 'campaign_element', promotingVideoId: 'vid-own-1', promotingVideoTitle: 'Owner Video — Main Hook',
    contentOwnerId: 'owner', contentOwnerName: 'You', campaignId: 'camp-1', campaignName: 'Global Income Source System',
    marketerId: null, marketerName: null, promotionId: null, promotionName: null,
    platform: 'youtube', assetClicks: 5400, totalRevenue: 12600, landingPageClicks: 5400, directPurchases: 28,
    leadMagnetClicks: 0, newsletterClicks: 0, newsletterOptins: 0, callBookingClicks: 0, callBookingsConfirmed: 0,
    consultationPageClicks: 0, consultationPurchases: 0, directOfferSales: 12600, estimatedCallRevenue: 0,
    consultationRevenue: 0, revenuePerClick: 2.33, createdAt: '2026-05-01T10:00:00Z',
  },
  {
    id: 'asset-own-2::vid-own-2', assetId: 'asset-own-2', assetTitle: 'Own Asset — Newsletter',
    assetType: 'resource', promotingVideoId: 'vid-own-2', promotingVideoTitle: 'Owner Video — List Growth',
    contentOwnerId: 'owner', contentOwnerName: 'You', campaignId: 'camp-1', campaignName: 'Global Income Source System',
    marketerId: null, marketerName: null, promotionId: null, promotionName: null,
    platform: 'instagram', assetClicks: 3100, totalRevenue: 0, landingPageClicks: 0, directPurchases: 0,
    leadMagnetClicks: 0, newsletterClicks: 3100, newsletterOptins: 880, callBookingClicks: 0, callBookingsConfirmed: 0,
    consultationPageClicks: 0, consultationPurchases: 0, directOfferSales: 0, estimatedCallRevenue: 0,
    consultationRevenue: 0, revenuePerClick: 0, createdAt: '2026-06-15T12:00:00Z',
  },
];

export const MOCK_CONTENT: MockContentRow[] = [
  { id: 'vid-1', title: 'Video A — Hook for Sales Call', campaignId: 'camp-1', campaignName: 'Global Income Source System', platform: 'youtube', clicks: 4200, revenue: 4800, purchases: 0, consultations: 18, rpc: 1.14, createdAt: '2026-07-12T10:00:00Z' },
  { id: 'vid-2', title: 'Video B — List Building', campaignId: 'camp-1', campaignName: 'Global Income Source System', platform: 'instagram', clicks: 3100, revenue: 0, purchases: 0, consultations: 0, rpc: 0, createdAt: '2026-08-01T14:00:00Z' },
  { id: 'vid-3', title: 'Video C — Offer Close', campaignId: 'camp-1', campaignName: 'Global Income Source System', platform: 'youtube', clicks: 2800, revenue: 6400, purchases: 14, consultations: 0, rpc: 2.29, createdAt: '2026-06-20T09:00:00Z' },
  { id: 'vid-own-1', title: 'Owner Video — Main Hook', campaignId: 'camp-1', campaignName: 'Global Income Source System', platform: 'youtube', clicks: 6200, revenue: 12600, purchases: 28, consultations: 0, rpc: 2.03, createdAt: '2026-05-01T10:00:00Z' },
  { id: 'vid-own-2', title: 'Owner Video — List Growth', campaignId: 'camp-1', campaignName: 'Global Income Source System', platform: 'instagram', clicks: 3400, revenue: 0, purchases: 0, consultations: 0, rpc: 0, createdAt: '2026-06-15T12:00:00Z' },
  { id: 'vid-7', title: 'GIS2 — Intro Clip', campaignId: 'camp-2', campaignName: 'Global Income Source System 2', platform: 'youtube', clicks: 5100, revenue: 9800, purchases: 19, consultations: 8, rpc: 1.92, createdAt: '2026-07-01T10:00:00Z' },
  { id: 'vid-8', title: 'Phase 1 — Test Hook', campaignId: 'camp-3', campaignName: 'Phase 1 Test', platform: 'youtube', clicks: 1900, revenue: 2100, purchases: 6, consultations: 3, rpc: 1.11, createdAt: '2026-08-05T10:00:00Z' },
];

// Helpers for scoped lookups
export function getCampaign(id: string) {
  return MOCK_CAMPAIGNS.find(c => c.id === id) ?? null;
}
export function getMarketersForCampaign(campaignId: string) {
  return MOCK_MARKETERS.filter(m => m.campaignId === campaignId);
}
export function getPromotionsFor(filters: { campaignId?: string | null; marketerId?: string | null }) {
  return MOCK_PROMOTIONS.filter(p => {
    if (filters.campaignId && p.campaignId !== filters.campaignId) return false;
    if (filters.marketerId && p.marketerId !== filters.marketerId) return false;
    return true;
  });
}
export function getAssetsFor(filters: {
  campaignId?: string | null;
  marketerId?: string | null;
  promotionId?: string | null;
  ownOnly?: boolean;
}) {
  return MOCK_ASSETS.filter(a => {
    if (filters.campaignId && a.campaignId !== filters.campaignId) return false;
    if (filters.ownOnly) return a.marketerId == null && a.promotionId == null;
    if (filters.marketerId && a.marketerId !== filters.marketerId) return false;
    if (filters.promotionId && a.promotionId !== filters.promotionId) return false;
    return true;
  });
}
export function getContentFor(filters: { campaignId?: string | null }) {
  return MOCK_CONTENT.filter(c => !filters.campaignId || c.campaignId === filters.campaignId);
}