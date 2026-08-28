// lib/DrillDownContext.tsx
// Drill-down context: locked filters + path.
// Expansion is triggered FROM real analytics tables (hover ≠ expand).

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export type BranchKind = 'content' | 'own_assets' | 'marketers';

export interface PathNode {
  id: string;
  label: string;
  kind: 'campaign' | 'branch' | 'marketer' | 'promotion';
}

export interface DrillDownState {
  path: PathNode[];
  campaignId: string | null;
  campaignName: string | null;
  branch: BranchKind | null;
  marketerId: string | null;
  marketerName: string | null;
  promotionId: string | null;
  promotionName: string | null;
  ownAssetsOnly: boolean;
  /** Which row is expanded on the current table (middle-stage open) */
  expandedRowId: string | null;
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
  expandedRowId: null,
  locked: { campaign: false, marketer: false, promotion: false },
};

interface DrillDownContextValue {
  state: DrillDownState;
  /** Click campaign row → open middle stage (3 branches). Does not leave Campaign Analytics. */
  expandCampaign: (id: string, name: string) => void;
  /** From campaign middle stage → enter a real destination */
  enterBranch: (branch: BranchKind) => void;
  /** Click marketer row → open promotion middle stage on Marketer Analytics */
  expandMarketer: (id: string, name: string) => void;
  /** From marketer middle stage → enter Promotion Analytics table */
  enterPromotionAnalytics: () => void;
  /** Click promotion row → open asset middle stage on Promotion Analytics */
  expandPromotion: (id: string, name: string) => void;
  /** From promotion middle stage → enter Asset Analytics table */
  enterAssetAnalytics: () => void;
  collapseExpand: () => void;
  goToPathIndex: (index: number) => void;
  clearAll: () => void;
  breadcrumbs: { label: string; index: number }[];
}

const DrillDownContext = createContext<DrillDownContextValue | null>(null);

export function DrillDownProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [state, setState] = useState<DrillDownState>(EMPTY);

  const expandCampaign = useCallback((id: string, name: string) => {
    setState({
      ...EMPTY,
      path: [{ id, label: name, kind: 'campaign' }],
      campaignId: id,
      campaignName: name,
      expandedRowId: id,
      locked: { campaign: true, marketer: false, promotion: false },
    });
  }, []);

  const enterBranch = useCallback(
    (branch: BranchKind) => {
      setState(prev => {
        if (!prev.campaignId) return prev;
        const label =
          branch === 'content'
            ? 'Content Analytics'
            : branch === 'own_assets'
              ? 'Own Asset Analytics'
              : 'Marketer Analytics';
        return {
          ...prev,
          path: [
            { id: prev.campaignId, label: prev.campaignName ?? 'Campaign', kind: 'campaign' },
            { id: branch, label, kind: 'branch' },
          ],
          branch,
          marketerId: null,
          marketerName: null,
          promotionId: null,
          promotionName: null,
          ownAssetsOnly: branch === 'own_assets',
          expandedRowId: null,
          locked: { campaign: true, marketer: false, promotion: false },
        };
      });
      if (branch === 'content') navigate('/analytics/indepth');
      else if (branch === 'own_assets') navigate('/assets/analytics');
      else navigate('/marketplace/marketer-analytics');
    },
    [navigate],
  );

  const expandMarketer = useCallback((id: string, name: string) => {
    setState(prev => ({
      ...prev,
      path: [
        ...(prev.campaignId
          ? [{ id: prev.campaignId, label: prev.campaignName ?? 'Campaign', kind: 'campaign' as const }]
          : []),
        { id: 'marketers', label: 'Marketer Analytics', kind: 'branch' },
        { id, label: name, kind: 'marketer' },
      ],
      marketerId: id,
      marketerName: name,
      promotionId: null,
      promotionName: null,
      expandedRowId: id,
      ownAssetsOnly: false,
      locked: {
        campaign: !!prev.campaignId,
        marketer: true,
        promotion: false,
      },
    }));
  }, []);

  const enterPromotionAnalytics = useCallback(() => {
    setState(prev => ({
      ...prev,
      expandedRowId: null,
      path: [
        ...(prev.campaignId
          ? [{ id: prev.campaignId, label: prev.campaignName ?? 'Campaign', kind: 'campaign' as const }]
          : []),
        { id: 'marketers', label: 'Marketer Analytics', kind: 'branch' as const },
        ...(prev.marketerId
          ? [{ id: prev.marketerId, label: prev.marketerName ?? 'Marketer', kind: 'marketer' as const }]
          : []),
        { id: 'promotions', label: 'Promotion Analytics', kind: 'branch' as const },
      ],
    }));
    navigate('/marketplace/promotions-analytics');
  }, [navigate]);

  const expandPromotion = useCallback((id: string, name: string) => {
    setState(prev => ({
      ...prev,
      path: [
        ...(prev.campaignId
          ? [{ id: prev.campaignId, label: prev.campaignName ?? 'Campaign', kind: 'campaign' as const }]
          : []),
        ...(prev.marketerId
          ? [
              { id: 'marketers', label: 'Marketer Analytics', kind: 'branch' as const },
              { id: prev.marketerId, label: prev.marketerName ?? 'Marketer', kind: 'marketer' as const },
            ]
          : []),
        { id, label: name, kind: 'promotion' as const },
      ],
      promotionId: id,
      promotionName: name,
      expandedRowId: id,
      locked: {
        campaign: !!prev.campaignId,
        marketer: !!prev.marketerId,
        promotion: true,
      },
    }));
  }, []);

  const enterAssetAnalytics = useCallback(() => {
    setState(prev => ({ ...prev, expandedRowId: null }));
    navigate('/assets/analytics');
  }, [navigate]);

  const collapseExpand = useCallback(() => {
    setState(prev => ({ ...prev, expandedRowId: null }));
  }, []);

  const goToPathIndex = useCallback(
    (index: number) => {
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
              : branchNode?.id === 'marketers' || branchNode?.id === 'promotions'
                ? 'marketers'
                : null;
        return {
          ...prev,
          path,
          campaignId: campaign?.id ?? null,
          campaignName: campaign?.label ?? null,
          branch: branch as BranchKind | null,
          marketerId: marketer?.id ?? null,
          marketerName: marketer?.label ?? null,
          promotionId: promotion?.id ?? null,
          promotionName: promotion?.label ?? null,
          ownAssetsOnly: branchNode?.id === 'own_assets',
          expandedRowId: null,
          locked: {
            campaign: !!campaign,
            marketer: !!marketer,
            promotion: !!promotion,
          },
        };
      });
    },
    [],
  );

  const clearAll = useCallback(() => setState(EMPTY), []);

  const breadcrumbs = useMemo(
    () => state.path.map((n, index) => ({ label: n.label, index })),
    [state.path],
  );

  const value = useMemo(
    () => ({
      state,
      expandCampaign,
      enterBranch,
      expandMarketer,
      enterPromotionAnalytics,
      expandPromotion,
      enterAssetAnalytics,
      collapseExpand,
      goToPathIndex,
      clearAll,
      breadcrumbs,
    }),
    [
      state,
      expandCampaign,
      enterBranch,
      expandMarketer,
      enterPromotionAnalytics,
      expandPromotion,
      enterAssetAnalytics,
      collapseExpand,
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