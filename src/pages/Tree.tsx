import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { Bounds, Center, OrbitControls, useGLTF } from '@react-three/drei';
import { supabase } from '../lib/supabase';
import {
  getOrRefreshCampaignMonthMetrics,
  listOrgCampaigns,
  utcMonthPeriod,
  type CampaignMonthMetrics,
  type MonthPeriod,
} from '../services/analytics/campaignMonthlySnapshots';

// ─────────────────────────────────────────────────────────────────────────────
// Tree.tsx — Follow-the-Money hero with real Campaign month metrics
//
// Metrics (All Assets / InDepth classification, not a new attribution engine):
//   Purchases, Sales Calls, Newsletter Opt-ins, Consultations, Revenue
// Campaign membership = purchase.campaign_id (same as InDepth scope).
// Snapshot-first via campaign_monthly_snapshots; Update forces recompute.
// ─────────────────────────────────────────────────────────────────────────────

type HeroButtonKey = 'structure' | 'journey' | 'analytics';

const TREE_MODEL_URL = `${import.meta.env.BASE_URL}models/tree.glb`;

function TreeModel() {
  const { scene } = useGLTF(TREE_MODEL_URL);
  return <primitive object={scene} />;
}
useGLTF.preload(TREE_MODEL_URL);

function formatRevenue(n: number): string {
  return n.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function shiftMonth(period: MonthPeriod, delta: number): MonthPeriod {
  const [y, m] = period.periodStart.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return utcMonthPeriod(d.getUTCFullYear(), d.getUTCMonth());
}

function periodLabel(period: MonthPeriod): string {
  const [y, m] = period.periodStart.split('-').map(Number);
  const names = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${names[(m - 1 + 12) % 12]} ${y}`;
}

const EMPTY: CampaignMonthMetrics = {
  campaignId: '',
  purchases: 0,
  salesCalls: 0,
  newsletterOptins: 0,
  consultations: 0,
  revenue: 0,
  revenueConversions: 0,
};

export function Tree() {
  const [hoveredBtn, setHoveredBtn] = useState<HeroButtonKey | null>(null);
  const navigate = useNavigate();

  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('all');
  const [period, setPeriod] = useState<MonthPeriod>(() =>
    utcMonthPeriod(new Date().getUTCFullYear(), new Date().getUTCMonth()),
  );
  const [rows, setRows] = useState<CampaignMonthMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve org (same pattern as other analytics pages)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) {
          if (!cancelled) setError('Not signed in');
          return;
        }
        const { data, error: mErr } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', uid)
          .limit(1)
          .maybeSingle();
        if (mErr) throw new Error(mErr.message);
        const orgId = (data as { organization_id?: string } | null)?.organization_id ?? null;
        if (!cancelled) setOrganizationId(orgId);
        if (!orgId && !cancelled) setError('No organization');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listOrgCampaigns(organizationId);
        if (!cancelled) setCampaigns(list);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const loadMetrics = useCallback(
    async (forceRefresh: boolean) => {
      if (!organizationId) return;
      setError(null);
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);
      try {
        const metrics = await getOrRefreshCampaignMonthMetrics(organizationId, period, {
          forceRefresh,
        });
        setRows(metrics);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setRows([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [organizationId, period],
  );

  useEffect(() => {
    void loadMetrics(false);
  }, [loadMetrics]);

  const display = useMemo(() => {
    if (selectedCampaignId === 'all') {
      return rows.reduce(
        (acc, r) => ({
          campaignId: 'all',
          purchases: acc.purchases + r.purchases,
          salesCalls: acc.salesCalls + r.salesCalls,
          newsletterOptins: acc.newsletterOptins + r.newsletterOptins,
          consultations: acc.consultations + r.consultations,
          revenue: acc.revenue + r.revenue,
          revenueConversions: acc.revenueConversions + r.revenueConversions,
        }),
        { ...EMPTY },
      );
    }
    return rows.find((r) => r.campaignId === selectedCampaignId) ?? { ...EMPTY, campaignId: selectedCampaignId };
  }, [rows, selectedCampaignId]);

  const metricCards = [
    { label: 'Purchases', value: display.purchases, color: '#4ade80' },
    { label: 'Sales Calls', value: display.salesCalls, color: '#ef4444' },
    { label: 'Newsletter Opt-ins', value: display.newsletterOptins, color: '#f97316' },
    { label: 'Consultations', value: display.consultations, color: '#a78bfa' },
  ];

  return (
    <div style={styles.outerCanvas}>
      <style>{RESPONSIVE_CSS}</style>

      <div style={styles.topBar}>
        <div style={styles.brand}>
          <div style={styles.brandDot} />
          <span style={styles.brandLabel}>VS-TRK</span>
        </div>

        <div style={styles.headerActions}>
          {(['structure', 'journey', 'analytics'] as HeroButtonKey[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-label={
                key === 'structure' ? 'Structure' : key === 'journey' ? 'Journey' : 'Analytics'
              }
              onClick={() => {
                if (key === 'structure') navigate('/tree/structure');
                if (key === 'journey') navigate('/tree/journey');
                if (key === 'analytics') navigate('/analytics/journey');
              }}
              onMouseEnter={() => setHoveredBtn(key)}
              onMouseLeave={() => setHoveredBtn((cur) => (cur === key ? null : cur))}
              style={{
                ...styles.headerButton,
                ...(hoveredBtn === key ? styles.headerButtonHover : {}),
              }}
            >
              <span style={styles.headerButtonIcon}>▭</span>
              <span>
                {key === 'structure' ? 'Structure' : key === 'journey' ? 'Journey' : 'Analytics'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Campaign + month controls */}
      <div style={styles.controlsBar}>
        <label style={styles.controlLabel}>
          Campaign
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            style={styles.select}
          >
            <option value="all">All Campaigns</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div style={styles.monthNav}>
          <button
            type="button"
            style={styles.monthBtn}
            onClick={() => setPeriod((p) => shiftMonth(p, -1))}
            aria-label="Previous month"
          >
            ‹
          </button>
          <span style={styles.monthLabel}>{periodLabel(period)}</span>
          <button
            type="button"
            style={styles.monthBtn}
            onClick={() => setPeriod((p) => shiftMonth(p, 1))}
            aria-label="Next month"
          >
            ›
          </button>
        </div>

        <button
          type="button"
          style={styles.updateBtn}
          disabled={!organizationId || refreshing || loading}
          onClick={() => void loadMetrics(true)}
        >
          {refreshing ? 'Updating…' : 'Update'}
        </button>
      </div>

      <div style={styles.heroFrame}>
        <div className="vstrk-tree-stage">
          <Canvas camera={{ position: [0, 12, 70], fov: 35 }} dpr={[1, 2]} gl={{ alpha: true }}>
            <ambientLight intensity={0.9} />
            <hemisphereLight args={['#ffffff', '#222222', 0.8]} />
            <directionalLight position={[20, 40, 25]} intensity={1.6} />
            <Suspense fallback={null}>
              <Bounds fit clip observe margin={1.15}>
                <Center>
                  <TreeModel />
                </Center>
              </Bounds>
            </Suspense>
            <OrbitControls
              makeDefault
              enablePan={false}
              enableZoom={false}
              autoRotate
              autoRotateSpeed={0.8}
              minPolarAngle={Math.PI / 3}
              maxPolarAngle={Math.PI / 1.9}
            />
          </Canvas>

          {/* Revenue overlay on stage */}
          <div style={styles.revenueOverlay}>
            <span style={styles.revenueValue}>
              {loading ? '…' : formatRevenue(display.revenue)}
            </span>
            <span style={styles.revenueLabel}>Revenue</span>
          </div>
        </div>

        <div className="vstrk-metrics-strip">
          {metricCards.map((m) => (
            <div key={m.label} style={styles.metricCard}>
              <span style={styles.metricLabel}>{m.label}</span>
              <span style={{ ...styles.metricValue, color: m.color }}>
                {loading ? '…' : m.value}
              </span>
            </div>
          ))}
        </div>

        <div style={styles.footer}>
          {periodLabel(period)}
          {error ? ` · ${error}` : null}
        </div>
      </div>
    </div>
  );
}

const RESPONSIVE_CSS = `
.vstrk-tree-stage {
  position: relative;
  flex: 1;
  min-height: 320px;
  width: 100%;
}
.vstrk-metrics-strip {
  display: flex;
  gap: 12px;
  max-width: 980px;
  margin: 0 auto;
  padding: 0 12px;
}
@media (max-width: 680px) {
  .vstrk-metrics-strip { flex-wrap: wrap; }
}
@media (prefers-reduced-motion: reduce) {
  .vstrk-connector-dot, .vstrk-vertical-dot {
    animation: none !important;
    opacity: 0.9;
  }
}
`;

const styles: Record<string, React.CSSProperties> = {
  outerCanvas: {
    position: 'relative',
    width: '100%',
    height: 'calc(100vh - 56px)',
    backgroundColor: '#0a0a0a',
    backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
    backgroundSize: '24px 24px',
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  topBar: {
    position: 'relative',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px 0 24px',
    flexShrink: 0,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  brandDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#ef4444',
  },
  brandLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#f5f5f5',
    fontFamily: 'monospace, sans-serif',
    letterSpacing: '0.02em',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  headerButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '8px',
    fontSize: '11px',
    fontWeight: 500,
    color: '#666666',
    backgroundColor: 'transparent',
    border: '1px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
  },
  headerButtonHover: {
    color: '#a3a3a3',
    borderColor: '#262626',
    backgroundColor: '#141414',
  },
  headerButtonIcon: {
    fontSize: '10px',
    lineHeight: 1,
  },
  controlsBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 24px 0 24px',
    zIndex: 10,
  },
  controlLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '10px',
    color: '#737373',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
  },
  select: {
    minWidth: '180px',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid #262626',
    backgroundColor: '#141414',
    color: '#e5e5e5',
    fontSize: '12px',
  },
  monthNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  monthBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '6px',
    border: '1px solid #262626',
    backgroundColor: '#141414',
    color: '#a3a3a3',
    cursor: 'pointer',
    fontSize: '16px',
    lineHeight: 1,
  },
  monthLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#e5e5e5',
    minWidth: '72px',
    textAlign: 'center' as const,
  },
  updateBtn: {
    marginLeft: 'auto',
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid #333',
    backgroundColor: '#1a1a1a',
    color: '#e5e5e5',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
  },
  heroFrame: {
    position: 'relative',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '32px',
    padding: '16px 12px 56px 12px',
  },
  revenueOverlay: {
    position: 'absolute',
    right: '12%',
    top: '42%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    pointerEvents: 'none' as const,
    zIndex: 2,
  },
  revenueValue: {
    fontSize: '28px',
    fontWeight: 600,
    color: '#4ade80',
    lineHeight: 1.1,
    whiteSpace: 'nowrap' as const,
  },
  revenueLabel: {
    fontSize: '12px',
    color: '#666666',
    marginTop: '2px',
  },
  metricCard: {
    flex: '1 1 0',
    minWidth: '120px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    backgroundColor: '#111111',
    border: '1px solid #222222',
    borderRadius: '10px',
    padding: '14px 16px',
  },
  metricLabel: {
    fontSize: '11px',
    color: '#737373',
  },
  metricValue: {
    fontSize: '20px',
    fontWeight: 600,
  },
  footer: {
    textAlign: 'center' as const,
    fontSize: '11px',
    color: '#4d4d4d',
    flexShrink: 0,
  },
};

export default Tree;
