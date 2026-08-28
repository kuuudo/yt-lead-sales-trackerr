// lib/DrillDownContext.tsx
// Shared drill-down / filter context for the unified Analytics hierarchy.
// Locked dimensions = arrived via parent navigation (not free filter change).

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export type DrillDownLevel =
  | 'campaigns'
  | 'campaign_overview'
  | 'content'
  | 'own_assets'
  | 'marketers'
  | 'promotions'
  | 'assets';

export interface BreadcrumbItem {
  label: string;
  level: DrillDownLevel;
  /** Path to navigate when this crumb is clicked */
  to: string;
  /** Context to restore when jumping back to this crumb */
  context?: Partial<DrillDownState>;
}

export interface DrillDownState {
  campaignId: string | null;
  campaignName: string | null;
  marketerId: string | null;
  marketerName: string | null;
  promotionId: string | null;
  promotionName: string | null;
  /** When true, Asset Analytics should only show owner (non-shared) assets */
  ownAssetsOnly: boolean;
  /** Which dimensions are locked (came from drill-down) */
  locked: {
    campaign: boolean;
    marketer: boolean;
    promotion: boolean;
  };
  breadcrumbs: BreadcrumbItem[];
}

const EMPTY: DrillDownState = {
  campaignId: null,
  campaignName: null,
  marketerId: null,
  marketerName: null,
  promotionId: null,
  promotionName: null,
  ownAssetsOnly: false,
  locked: { campaign: false, marketer: false, promotion: false },
  breadcrumbs: [],
};

interface DrillDownContextValue {
  state: DrillDownState;
  /** Enter Campaign Overview from Campaign ranking */
  openCampaignOverview: (campaignId: string, campaignName: string) => void;
  /** From Overview → Content Analytics */
  openContentAnalytics: () => void;
  /** From Overview → Own Asset Analytics */
  openOwnAssetAnalytics: () => void;
  /** From Overview → Marketer Analytics */
  openMarketerAnalytics: () => void;
  /** Marketer row → Promotion Analytics */
  openPromotionAnalytics: (marketerId: string, marketerName: string) => void;
  /** Promotion row → Asset Analytics */
  openAssetAnalytics: (promotionId: string, promotionName: string) => void;
  /** Clear everything and go to Campaign Analytics */
  clearAll: () => void;
  /** Jump to a breadcrumb level (restores that context) */
  goToBreadcrumb: (item: BreadcrumbItem) => void;
}

const DrillDownContext = createContext<DrillDownContextValue | null>(null);

export function DrillDownProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<DrillDownState>(EMPTY);

  const openCampaignOverview = useCallback((campaignId: string, campaignName: string) => {
    const next: DrillDownState = {
      ...EMPTY,
      campaignId,
      campaignName,
      locked: { campaign: true, marketer: false, promotion: false },
      breadcrumbs: [
        { label: 'Campaigns', level: 'campaigns', to: '/campaigns/analytics', context: EMPTY },
        {
          label: campaignName,
          level: 'campaign_overview',
          to: `/campaigns/${campaignId}/analytics`,
          context: {
            campaignId,
            campaignName,
            locked: { campaign: true, marketer: false, promotion: false },
          },
        },
      ],
    };
    setState(next);
    navigate(`/campaigns/${campaignId}/analytics`);
  }, [navigate]);

  const openContentAnalytics = useCallback(() => {
    setState(prev => {
      const crumbs = [
        ...prev.breadcrumbs,
        {
          label: 'Content',
          level: 'content' as const,
          to: '/analytics/indepth',
          context: {
            campaignId: prev.campaignId,
            campaignName: prev.campaignName,
            locked: { campaign: true, marketer: false, promotion: false },
          },
        },
      ];
      return {
        ...prev,
        ownAssetsOnly: false,
        marketerId: null,
        marketerName: null,
        promotionId: null,
        promotionName: null,
        locked: { campaign: true, marketer: false, promotion: false },
        breadcrumbs: crumbs,
      };
    });
    navigate('/analytics/indepth');
  }, [navigate]);

  const openOwnAssetAnalytics = useCallback(() => {
    setState(prev => {
      const crumbs = [
        ...prev.breadcrumbs,
        {
          label: 'Own Assets',
          level: 'own_assets' as const,
          to: '/assets/analytics',
          context: {
            campaignId: prev.campaignId,
            campaignName: prev.campaignName,
            ownAssetsOnly: true,
            locked: { campaign: true, marketer: false, promotion: false },
          },
        },
      ];
      return {
        ...prev,
        ownAssetsOnly: true,
        marketerId: null,
        marketerName: null,
        promotionId: null,
        promotionName: null,
        locked: { campaign: true, marketer: false, promotion: false },
        breadcrumbs: crumbs,
      };
    });
    navigate('/assets/analytics');
  }, [navigate]);

  const openMarketerAnalytics = useCallback(() => {
    setState(prev => {
      const crumbs = [
        ...prev.breadcrumbs,
        {
          label: 'Marketers',
          level: 'marketers' as const,
          to: '/marketplace/marketer-analytics',
          context: {
            campaignId: prev.campaignId,
            campaignName: prev.campaignName,
            locked: { campaign: true, marketer: false, promotion: false },
          },
        },
      ];
      return {
        ...prev,
        ownAssetsOnly: false,
        marketerId: null,
        marketerName: null,
        promotionId: null,
        promotionName: null,
        locked: { campaign: true, marketer: false, promotion: false },
        breadcrumbs: crumbs,
      };
    });
    navigate('/marketplace/marketer-analytics');
  }, [navigate]);

  const openPromotionAnalytics = useCallback((marketerId: string, marketerName: string) => {
    setState(prev => {
      const crumbs = [
        ...prev.breadcrumbs.filter(c => c.level !== 'promotions' && c.level !== 'assets'),
        {
          label: marketerName,
          level: 'marketers' as const,
          to: '/marketplace/marketer-analytics',
          context: {
            campaignId: prev.campaignId,
            campaignName: prev.campaignName,
            locked: { campaign: true, marketer: false, promotion: false },
          },
        },
        {
          label: 'Promotions',
          level: 'promotions' as const,
          to: '/marketplace/promotions-analytics',
          context: {
            campaignId: prev.campaignId,
            campaignName: prev.campaignName,
            marketerId,
            marketerName,
            locked: { campaign: true, marketer: true, promotion: false },
          },
        },
      ];
      return {
        ...prev,
        marketerId,
        marketerName,
        promotionId: null,
        promotionName: null,
        ownAssetsOnly: false,
        locked: { campaign: true, marketer: true, promotion: false },
        breadcrumbs: crumbs,
      };
    });
    navigate('/marketplace/promotions-analytics');
  }, [navigate]);

  const openAssetAnalytics = useCallback((promotionId: string, promotionName: string) => {
    setState(prev => {
      const crumbs = [
        ...prev.breadcrumbs.filter(c => c.level !== 'assets'),
        {
          label: promotionName,
          level: 'promotions' as const,
          to: '/marketplace/promotions-analytics',
          context: {
            campaignId: prev.campaignId,
            campaignName: prev.campaignName,
            marketerId: prev.marketerId,
            marketerName: prev.marketerName,
            locked: { campaign: true, marketer: true, promotion: false },
          },
        },
        {
          label: 'Assets',
          level: 'assets' as const,
          to: '/assets/analytics',
          context: {
            campaignId: prev.campaignId,
            campaignName: prev.campaignName,
            marketerId: prev.marketerId,
            marketerName: prev.marketerName,
            promotionId,
            promotionName,
            locked: { campaign: true, marketer: true, promotion: true },
          },
        },
      ];
      return {
        ...prev,
        promotionId,
        promotionName,
        ownAssetsOnly: false,
        locked: { campaign: true, marketer: true, promotion: true },
        breadcrumbs: crumbs,
      };
    });
    navigate('/assets/analytics');
  }, [navigate]);

  const clearAll = useCallback(() => {
    setState(EMPTY);
    navigate('/campaigns/analytics');
  }, [navigate]);

  const goToBreadcrumb = useCallback((item: BreadcrumbItem) => {
    if (item.context) {
      setState(prev => ({
        ...EMPTY,
        ...item.context,
        breadcrumbs: prev.breadcrumbs.slice(
          0,
          prev.breadcrumbs.findIndex(c => c.to === item.to) + 1,
        ),
      }));
    } else {
      setState(EMPTY);
    }
    navigate(item.to);
  }, [navigate]);

  const value = useMemo(
    () => ({
      state,
      openCampaignOverview,
      openContentAnalytics,
      openOwnAssetAnalytics,
      openMarketerAnalytics,
      openPromotionAnalytics,
      openAssetAnalytics,
      clearAll,
      goToBreadcrumb,
    }),
    [
      state,
      openCampaignOverview,
      openContentAnalytics,
      openOwnAssetAnalytics,
      openMarketerAnalytics,
      openPromotionAnalytics,
      openAssetAnalytics,
      clearAll,
      goToBreadcrumb,
    ],
  );

  return (
    <DrillDownContext.Provider value={value}>
      {children}
    </DrillDownContext.Provider>
  );
}

export function useDrillDown() {
  const ctx = useContext(DrillDownContext);
  if (!ctx) {
    throw new Error('useDrillDown must be used within DrillDownProvider');
  }
  return ctx;
}

/** Safe version for pages that may render outside the provider during transition */
export function useDrillDownOptional() {
  return useContext(DrillDownContext);
}