import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { Bounds, Center, OrbitControls, useGLTF } from '@react-three/drei';
import { supabase } from '../lib/supabase';
import {
  getOrRefreshCampaignMonthMetrics,
  listOrgCampaigns,
  periodFromCampaignTreePreset,
  utcMonthPeriod,
  type CampaignMonthMetrics,
  type CampaignTreePreset,
  type MonthPeriod,
} from '../services/analytics/campaignMonthlySnapshots';

// ─────────────────────────────────────────────────────────────────────────────
// Tree.tsx — Campaign metrics (All Assets / InDepth rules). Snapshot-first.
// Default: first real Campaign + All Time. No mid-page spinner.
// ─────────────────────────────────────────────────────────────────────────────

type HeroButtonKey = 'structure' | 'journey' | 'analytics';

const TREE_MODEL_URL = `${import.meta.env.BASE_URL}models/tree.glb`;

function TreeModel() {
  const { scene } = useGLTF(TREE_MODEL_URL);
  return <primitive object={scene} />;
}
useGLTF.preload(TREE_MODEL_URL);

function formatRevenue(n: number): string {
    return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const PRESET_OPTIONS: { key: CampaignTreePreset | 'pick_month'; label: string }[] = [
  { key: 'all_time', label: 'All Time' },
  { key: 'last_7_days', label: 'Last 7 days' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'this_month', label: 'This month' },
  { key: 'pick_month', label: 'Choose month…' },
];

function buildMonthChoices(yearsBack = 2): { value: string; label: string; period: MonthPeriod }[] {
  const now = new Date();
  const out: { value: string; label: string; period: MonthPeriod }[] = [];
  for (let y = now.getUTCFullYear(); y >= now.getUTCFullYear() - yearsBack; y--) {
    const maxM = y === now.getUTCFullYear() ? now.getUTCMonth() : 11;
    for (let m = maxM; m >= 0; m--) {
      const period = utcMonthPeriod(y, m);
      out.push({
        value: period.periodStart,
        label: `${MONTH_NAMES[m]} ${y}`,
        period: { ...period, rankingWindow: 'custom' },
      });
    }
  }
  return out;
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
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);

  // Default time: All Time (not current month)
  const [timePreset, setTimePreset] = useState<CampaignTreePreset | 'pick_month'>('all_time');
  const [pickedMonthStart, setPickedMonthStart] = useState<string | null>(null);
  const monthChoices = useMemo(() => buildMonthChoices(3), []);

  const period: MonthPeriod = useMemo(() => {
    if (timePreset === 'pick_month' && pickedMonthStart) {
      const found = monthChoices.find((c) => c.value === pickedMonthStart);
      if (found) return found.period;
    }
    if (timePreset === 'pick_month') {
      return periodFromCampaignTreePreset('this_month');
    }
    return periodFromCampaignTreePreset(timePreset);
  }, [timePreset, pickedMonthStart, monthChoices]);

  const [rows, setRows] = useState<CampaignMonthMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Bumps when campaign/period changes so we never flash the previous selection's numbers. */
  const [metricsStale, setMetricsStale] = useState(false);

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
        if (cancelled) return;
        setCampaigns(list);
        setCampaignsLoaded(true);
        // Default = first real campaign (deterministic list order), not All Campaigns
        setSelectedCampaignId((prev) => {
          if (prev && prev !== 'all' && list.some((c) => c.id === prev)) return prev;
          if (list.length > 0) return list[0].id;
          return null;
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setCampaignsLoaded(true);
        }
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
      setMetricsStale(true);
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
        setMetricsStale(false);
      }
    },
    [organizationId, period],
  );

  useEffect(() => {
    void loadMetrics(false);
  }, [loadMetrics]);


  const display = useMemo(() => {
    if (selectedCampaignId === 'all') {
      const visibleIds = new Set(campaigns.map((c) => c.id));
      return rows
        .filter((r) => visibleIds.has(r.campaignId))
        .reduce(
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
    if (!selectedCampaignId) return { ...EMPTY };
    return (
      rows.find((r) => r.campaignId === selectedCampaignId) ?? {
        ...EMPTY,
        campaignId: selectedCampaignId,
      }
    );
  }, [rows, selectedCampaignId, campaigns]);

  const showPlaceholder = loading || metricsStale;
  const metricCards = [
    { label: 'Purchases', value: display.purchases, color: '#4ade80' },
    { label: 'Sales Calls', value: display.salesCalls, color: '#ef4444' },
    { label: 'Newsletter', value: display.newsletterOptins, color: '#f97316' },
    { label: 'Consultations', value: display.consultations, color: '#a78bfa' },
  ];

  const statusLine = (() => {
    if (error) return error;
    if (refreshing) return 'Updating campaign analytics…';
    if (loading || metricsStale) return 'Loading campaign analytics…';
    if (campaignsLoaded && campaigns.length === 0) return 'No campaigns in this organization';
    return null;
  })();

  return (
    <div style={styles.outerCanvas}>
      <style>{RESPONSIVE_CSS}</style>

      <nav className="vstrk-tabs" aria-label="Tree views">
        {(['structure', 'journey', 'analytics'] as HeroButtonKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className="vstrk-tab"
            style={
              hoveredBtn === key
                ? { color: '#f97316', borderColor: '#f97316' }
                : undefined
            }
            onClick={() => {
              if (key === 'structure') navigate('/tree/structure');
              if (key === 'journey') navigate('/tree/journey');
              if (key === 'analytics') navigate('/analytics/journey');
            }}
            onMouseEnter={() => setHoveredBtn(key)}
            onMouseLeave={() => setHoveredBtn((cur) => (cur === key ? null : cur))}
          >
            {key === 'structure' ? 'Structure' : key === 'journey' ? 'Journey' : 'Analytics'}
          </button>
        ))}
      </nav>

      <div className="vstrk-controls">
        <select
          className="vstrk-sel-campaign"
          aria-label="Campaign"
          value={selectedCampaignId ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            setSelectedCampaignId(v === '' ? null : v);
          }}
          disabled={!campaignsLoaded}
        >
          {campaigns.length === 0 ? (
            <option value="">No campaigns</option>
          ) : (
            <>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="all">All Campaigns</option>
            </>
          )}
        </select>

        <select
          className="vstrk-sel-time"
          aria-label="Time range"
          value={timePreset === 'pick_month' ? 'pick_month' : timePreset}
          onChange={(e) => {
            const v = e.target.value as CampaignTreePreset | 'pick_month';
            setTimePreset(v);
            if (v === 'pick_month' && !pickedMonthStart && monthChoices[0]) {
              setPickedMonthStart(monthChoices[0].value);
            }
          }}
        >
          {PRESET_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="vstrk-refresh"
          aria-label="Refresh analytics"
          title="Refresh"
          disabled={!organizationId || refreshing || loading}
          onClick={() => void loadMetrics(true)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#e5e5e5"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 4v5h-5" />
          </svg>
        </button>

        {timePreset === 'pick_month' && (
          <select
            className="vstrk-sel-month"
            aria-label="Month"
            value={pickedMonthStart ?? ''}
            onChange={(e) => setPickedMonthStart(e.target.value)}
          >
            {monthChoices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </div>

     

      <div style={styles.heroFrame}>
        <div className="vstrk-hero">
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

        </div>

          <div className="vstrk-revenue">
            <span
              style={{
                ...styles.revenueValue,
                opacity: showPlaceholder ? 0.35 : 1,
              }}
            >
              {formatRevenue(showPlaceholder ? 0 : display.revenue)}
            </span>
            <span style={styles.revenueLabel}>Revenue</span>
          </div>
        </div>

        <div className="vstrk-metrics-strip">
          {metricCards.map((m) => (
            <div key={m.label} style={styles.metricCard}>
              <span style={styles.metricLabel}>{m.label}</span>
              <span
                style={{
                  ...styles.metricValue,
                  color: m.color,
                  opacity: showPlaceholder ? 0.35 : 1,
                }}
              >
                {showPlaceholder ? '—' : m.value}
              </span>
            </div>
          ))}
        </div>

        {/* Subtle status under metrics — no centered spinner */}
        <div style={styles.statusBar} aria-live="polite">
          {statusLine ? (
            <span style={error ? styles.statusError : styles.statusMuted}>{statusLine}</span>
          ) : (
            <span style={styles.statusMuted}>
              {timePreset === 'all_time'
                ? 'All Time'
                : timePreset === 'pick_month' && pickedMonthStart
                  ? monthChoices.find((c) => c.value === pickedMonthStart)?.label
                  : PRESET_OPTIONS.find((o) => o.key === timePreset)?.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const RESPONSIVE_CSS = `
.vstrk-tabs {
  display: flex;
  justify-content: center;
  gap: 8px;
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
  padding: 0 16px;
  box-sizing: border-box;
}
.vstrk-tab {
  flex: 1 1 0;
  max-width: 200px;
  min-height: 44px;
  background: #141414;
  border: 1px solid #262626;
  border-radius: 10px;
  color: #a3a3a3;
  font-size: 14px;
  cursor: pointer;
}
.vstrk-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
  padding: 16px 16px 0;
  box-sizing: border-box;
}
.vstrk-controls select {
  min-height: 48px;
  padding: 0 12px;
  border-radius: 12px;
  border: 1px solid #262626;
  background: #141414;
  color: #e5e5e5;
  font-size: 14px;
}
.vstrk-sel-campaign { flex: 1 1 0; min-width: 0; }
.vstrk-sel-time { flex: 0 0 128px; }
.vstrk-sel-month { flex: 1 1 100%; }
.vstrk-refresh {
  flex: none;
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #141414;
  border: 1px solid #262626;
  border-radius: 12px;
  cursor: pointer;
}
.vstrk-refresh:disabled { opacity: 0.5; cursor: default; }

.vstrk-hero {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
}
.vstrk-tree-stage {
  position: relative;
  flex: 0 0 52%;
  height: 240px;
  min-width: 0;
  touch-action: pan-y;
}
.vstrk-tree-stage canvas { touch-action: pan-y !important; }
.vstrk-revenue {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}
.vstrk-metrics-strip {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%;
  max-width: 980px;
  margin: 0 auto;
  padding: 0 16px;
  box-sizing: border-box;
}
@media (min-width: 768px) {
  .vstrk-sel-campaign { flex: 0 1 340px; }
  .vstrk-sel-time { flex: 0 0 160px; }
  .vstrk-sel-month { flex: 0 0 160px; }
  .vstrk-refresh { order: 1; }
  .vstrk-hero { gap: 48px; }
  .vstrk-tree-stage { flex: 0 0 420px; height: 420px; }
  .vstrk-metrics-strip { grid-template-columns: repeat(4, 1fr); }
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
    alignItems: 'flex-end',
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
    minWidth: '160px',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid #262626',
    backgroundColor: '#141414',
    color: '#e5e5e5',
    fontSize: '12px',
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
    gap: '24px',
    padding: '16px 12px 40px 12px',
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
    fontSize: 'clamp(28px, 8vw, 52px)',
    fontWeight: 600,
    color: '#4ade80',
    lineHeight: 1.1,
    whiteSpace: 'nowrap' as const,
    transition: 'opacity 0.15s ease',
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
    fontSize: '26px',
    fontWeight: 600,
    transition: 'opacity 0.15s ease',
  },
  statusBar: {
    textAlign: 'center' as const,
    fontSize: '11px',
    minHeight: '18px',
    flexShrink: 0,
  },
  statusMuted: {
    color: '#4d4d4d',
  },
  statusError: {
    color: '#f87171',
  },
};

export default Tree;
