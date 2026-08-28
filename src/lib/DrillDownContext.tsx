// lib/DrillDownContext.tsx
// Horizontal L→R drill-down state for Analytics hierarchy.
// Expand nodes live on the canvas; full tables are destinations only.

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export type BranchKind = 'content' | 'own_assets' | 'marketers';

export interface PathNode {
  id: string;
  label: string;
  kind: 'campaign' | 'branch' | 'marketer' | 'promotion' | 'asset';
}

export interface DrillDownState {
  /** Ordered path — root left, deeper nodes right */
  path: PathNode[];
  campaignId: string | null;
  campaignName: string | null;
  branch: BranchKind | null;
  marketerId: string | null;
  marketerName: string | null;
  promotionId: string | null;
  promotionName: string | null;
  ownAssetsOnly: boolean;
  locked: {
    campaign: boolean;
    marketer: boolean;
    promotion: boolean;
  };
}

const EMPTY: DrillDownState = {
  path: [],
  campaignId: null,
  campaignName: null,
  branch: null,
  marketerId: null,
  marketerName: null,
  promotionId: null,
  promotionName: null,
  ownAssetsOnly: false,
  locked: { campaign: false, marketer: false, promotion: false },
};

interface DrillDownContextValue {
  state: DrillDownState;
  /** Select campaign on canvas — grows 3 branches to the right */
  selectCampaign: (id: string, name: string) => void;
  /** Select Content / Own Asset / Marketer branch */
  selectBranch: (branch: BranchKind) => void;
  /** Select a marketer — grows promotions to the right */
  selectMarketer: (id: string, name: string) => void;
  /** Select a promotion — grows assets to the right */
  selectPromotion: (id: string, name: string) => void;
  /** Open full destination table (Content / Own Assets / Asset Analytics) */
  openDestination: (kind: 'content' | 'own_assets' | 'assets') => void;
  /** Truncate path to index (breadcrumb / back) */
  goToPathIndex: (index: number) => void;
  clearAll: () => void;
  /** Breadcrumb labels derived from path */
  breadcrumbs: { label: string; index: number }[];
}

const DrillDownContext = createContext<DrillDownContextValue | null>(null);

export function DrillDownProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<DrillDownState>(EMPTY);

  const selectCampaign = useCallback((id: string, name: string) => {
    setState({
      ...EMPTY,
      path: [{ id, label: name, kind: 'campaign' }],
      campaignId: id,
      campaignName: name,
      locked: { campaign: true, marketer: false, promotion: false },
    });
  }, []);

  const selectBranch = useCallback((branch: BranchKind) => {
    setState(prev => {
      if (!prev.campaignId) return prev;
      const label =
        branch === 'content'
          ? 'Content Analytics'
          : branch === 'own_assets'
            ? 'Own Asset Analytics'
            : 'Marketer Analytics';
      // Keep only campaign, then this branch
      const path: PathNode[] = [
        { id: prev.campaignId, label: prev.campaignName ?? 'Campaign', kind: 'campaign' },
        { id: branch, label, kind: 'branch' },
      ];
      return {
        ...prev,
        path,
        branch,
        marketerId: null,
        marketerName: null,
        promotionId: null,
        promotionName: null,
        ownAssetsOnly: branch === 'own_assets',
        locked: { campaign: true, marketer: false, promotion: false },
      };
    });
  }, []);

  const selectMarketer = useCallback((id: string, name: string) => {
    setState(prev => {
      if (!prev.campaignId || prev.branch !== 'marketers') return prev;
      const path: PathNode[] = [
        { id: prev.campaignId, label: prev.campaignName ?? 'Campaign', kind: 'campaign' },
        { id: 'marketers', label: 'Marketer Analytics', kind: 'branch' },
        { id, label: name, kind: 'marketer' },
      ];
      return {
        ...prev,
        path,
        marketerId: id,
        marketerName: name,
        promotionId: null,
        promotionName: null,
        ownAssetsOnly: false,
        locked: { campaign: true, marketer: true, promotion: false },
      };
    });
  }, []);

  const selectPromotion = useCallback((id: string, name: string) => {
    setState(prev => {
      if (!prev.marketerId) return prev;
      const path: PathNode[] = [
        { id: prev.campaignId!, label: prev.campaignName ?? 'Campaign', kind: 'campaign' },
        { id: 'marketers', label: 'Marketer Analytics', kind: 'branch' },
        { id: prev.marketerId, label: prev.marketerName ?? 'Marketer', kind: 'marketer' },
        { id, label: name, kind: 'promotion' },
      ];
      return {
        ...prev,
        path,
        promotionId: id,
        promotionName: name,
        ownAssetsOnly: false,
        locked: { campaign: true, marketer: true, promotion: true },
      };
    });
  }, []);

  const openDestination = useCallback(
    (kind: 'content' | 'own_assets' | 'assets') => {
      if (kind === 'content') {
        navigate('/analytics/indepth');
      } else {
        // Own assets or promotion-scoped assets — real AllAssetsAnalytics later;
        // for now mock destination page still acceptable, or /assets/analytics
        navigate('/assets/analytics');
      }
    },
    [navigate],
  );

  const goToPathIndex = useCallback((index: number) => {
    setState(prev => {
      if (index < 0) return EMPTY;
      const path = prev.path.slice(0, index + 1);
      const campaign = path.find(n => n.kind === 'campaign');
      const branchNode = path.find(n => n.kind === 'branch');
      const marketer = path.find(n => n.kind === 'marketer');
      const promotion = path.find(n => n.kind === 'promotion');
      const branch =
        branchNode?.id === 'content'
          ? 'content'
          : branchNode?.id === 'own_assets'
            ? 'own_assets'
            : branchNode?.id === 'marketers'
              ? 'marketers'
              : null;
      return {
        path,
        campaignId: campaign?.id ?? null,
        campaignName: campaign?.label ?? null,
        branch,
        marketerId: marketer?.id ?? null,
        marketerName: marketer?.label ?? null,
        promotionId: promotion?.id ?? null,
        promotionName: promotion?.label ?? null,
        ownAssetsOnly: branch === 'own_assets',
        locked: {
          campaign: !!campaign,
          marketer: !!marketer,
          promotion: !!promotion,
        },
      };
    });
  }, []);

  const clearAll = useCallback(() => {
    setState(EMPTY);
  }, []);

  const breadcrumbs = useMemo(
    () => state.path.map((n, index) => ({ label: n.label, index })),
    [state.path],
  );

  const value = useMemo(
    () => ({
      state,
      selectCampaign,
      selectBranch,
      selectMarketer,
      selectPromotion,
      openDestination,
      goToPathIndex,
      clearAll,
      breadcrumbs,
    }),
    [
      state,
      selectCampaign,
      selectBranch,
      selectMarketer,
      selectPromotion,
      openDestination,
      goToPathIndex,
      clearAll,
      breadcrumbs,
    ],
  );

  return (
    <DrillDownContext.Provider value={value}>{children}</DrillDownContext.Provider>
  );
}

export function useDrillDown() {
  const ctx = useContext(DrillDownContext);
  if (!ctx) throw new Error('useDrillDown must be used within DrillDownProvider');
  return ctx;
}

export function useDrillDownOptional() {
  return useContext(DrillDownContext);
}