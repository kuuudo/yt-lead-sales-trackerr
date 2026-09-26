import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// ─────────────────────────────────────────────────────────────────────────────
// Tree.tsx — Follow-the-Money hero (Phase 1)
//
// SCOPE OF THIS PASS
// ═══════════════════
// Tree.tsx is now VSTRK's first-impression screen: Visitor → Content → Journey
// → Conversion → Revenue, told as one continuous flow, plus a supporting stat
// strip (Purchases / Sales Calls / Opt-ins).
//
// STRUCTURE and JOURNEY buttons exist as visual placeholders ONLY. They are
// intentionally NOT wired to CampaignStructureMap / CampaignJourneyMap yet —
// the Structure visual direction (embedded workspace vs. native VSTRK canvas)
// is still undecided. Do not add onClick routing here until that's settled.
//
// Data below is realistic sample/demo data, not yet connected to the
// analytics engine. Swap SAMPLE for live data in a later pass.
// ─────────────────────────────────────────────────────────────────────────────

type HeroButtonKey = 'structure' | 'journey';

const SAMPLE = {
  revenue: 84291,
  purchases: 51,
  salesCalls: 11,
  optins: 22,
  visitorLabel: 'Visitor',
  contentTitle: 'Content',
  contentSubtitle: 'Youtube',
  conversionTitle: 'Sales call booked',
  conversionSubtitle: 'Entry content',
  dateLabel: 'Sep 2026',
  tagline: 'The global income source',
};

export function Tree() {
  const [hoveredBtn, setHoveredBtn] = useState<HeroButtonKey | null>(null);
  const navigate = useNavigate();

  return (
    <div style={styles.outerCanvas}>
      <style>{RESPONSIVE_CSS}</style>

      {/* ── Header: brand + unwired Structure/Journey placeholders ─────── */}
      <div style={styles.topBar}>
        <div style={styles.brand}>
          <div style={styles.brandDot} />
          <span style={styles.brandLabel}>VS-TRK</span>
        </div>

        <div style={styles.headerActions}>
          {(['structure', 'journey'] as HeroButtonKey[]).map((key) => (
<button
  key={key}
  type="button"
  aria-label={key === 'structure' ? 'Structure (coming soon)' : 'Journey (coming soon)'}
  onClick={() => {
    if (key === 'structure') navigate('/tree/structure');
    if (key === 'journey') navigate('/tree/journey');
  }}
  onMouseEnter={() => setHoveredBtn(key)}
              onMouseLeave={() => setHoveredBtn((cur) => (cur === key ? null : cur))}
              style={{
                ...styles.headerButton,
                ...(hoveredBtn === key ? styles.headerButtonHover : {}),
              }}
            >
              <span style={styles.headerButtonIcon}>▭</span>
              <span>{key === 'structure' ? 'Structure' : 'Journey'}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Follow-the-money hero ────────────────────────────────────────── */}
      <div style={styles.heroFrame}>
        <div className="vstrk-money-flow">
          {/* Desktop connector: dashed line + traveling dot */}
          <div className="vstrk-connector-line" aria-hidden="true" />
          <div className="vstrk-connector-dot" aria-hidden="true" />

          {/* Mobile connector: vertical track + traveling segment */}
          <div className="vstrk-vertical-track" aria-hidden="true">
            <div className="vstrk-vertical-dot" />
          </div>

          <div className="vstrk-node vstrk-node-visitor">
            <div style={styles.visitorDot} />
            <span style={styles.visitorLabel}>{SAMPLE.visitorLabel}</span>
          </div>

          <div className="vstrk-node vstrk-node-card" style={{ ...styles.card, borderLeftColor: '#f97316' }}>
            <div style={styles.cardTitle}>{SAMPLE.contentTitle}</div>
            <div style={styles.cardSubtitle}>{SAMPLE.contentSubtitle}</div>
          </div>

          <div className="vstrk-node vstrk-node-card" style={{ ...styles.card, borderLeftColor: '#8b5cf6' }}>
            <div style={styles.cardTitle}>{SAMPLE.conversionTitle}</div>
            <div style={styles.cardSubtitle}>{SAMPLE.conversionSubtitle}</div>
          </div>

          <div className="vstrk-node vstrk-node-revenue">
            <div style={styles.revenueValue}>${SAMPLE.revenue.toLocaleString()}</div>
            <div style={styles.revenueLabel}>total revenue</div>
          </div>
        </div>

        {/* Supporting stat strip */}
        <div className="vstrk-metrics-strip">
          {[
            { label: 'Purchases', value: SAMPLE.purchases, color: '#4ade80' },
            { label: 'Sales Calls', value: SAMPLE.salesCalls, color: '#ef4444' },
            { label: 'Opt-ins', value: SAMPLE.optins, color: '#f97316' },
          ].map((m) => (
            <div key={m.label} style={styles.metricCard}>
              <span style={styles.metricLabel}>{m.label}</span>
              <span style={{ ...styles.metricValue, color: m.color }}>{m.value}</span>
            </div>
          ))}
        </div>

        <div style={styles.footer}>
          {SAMPLE.dateLabel} · {SAMPLE.tagline}
        </div>
      </div>
    </div>
  );
}

const RESPONSIVE_CSS = `
.vstrk-money-flow {
  position: relative;
  width: 100%;
  max-width: 980px;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 48px 12px;
  margin: 0 auto;
}
.vstrk-connector-line {
  position: absolute;
  top: 50%;
  left: 6%;
  right: 8%;
  height: 0;
  border-top: 1px dashed #2e2e2e;
  transform: translateY(-19px);
  z-index: 0;
}
.vstrk-connector-dot {
  position: absolute;
  top: calc(50% - 22.5px);
  left: 6%;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f97316;
  box-shadow: 0 0 8px rgba(249, 115, 22, 0.6);
  z-index: 1;
  animation: vstrk-travel-h 4.5s linear infinite;
}
.vstrk-vertical-track { display: none; }
.vstrk-node { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; gap: 6px; }

@keyframes vstrk-travel-h {
  0%   { left: 6%;  opacity: 0; }
  8%   { opacity: 1; }
  92%  { opacity: 1; }
  100% { left: 88%; opacity: 0; }
}

.vstrk-metrics-strip {
  display: flex;
  gap: 12px;
  max-width: 980px;
  margin: 0 auto;
  padding: 0 12px;
}

@media (max-width: 680px) {
  .vstrk-money-flow {
    flex-direction: column;
    align-items: stretch;
    min-height: 0;
    gap: 22px;
    padding: 28px 8px 8px 8px;
  }
  .vstrk-connector-line, .vstrk-connector-dot { display: none; }
  .vstrk-vertical-track {
    display: block;
    position: absolute;
    left: 21px;
    top: 54px;
    bottom: 96px;
    width: 4px;
    background: #262626;
    border-radius: 3px;
    z-index: 0;
  }
  .vstrk-vertical-dot {
    position: absolute;
    left: -2px;
    width: 8px;
    height: 34px;
    border-radius: 4px;
    background: #f97316;
    box-shadow: 0 0 8px rgba(249, 115, 22, 0.6);
    animation: vstrk-travel-v 3.6s ease-in-out infinite;
  }
  .vstrk-node {
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    padding-left: 44px;
    text-align: left;
  }
  .vstrk-node-revenue {
    padding-left: 0;
    align-items: center;
    text-align: center;
    margin-top: 4px;
  }
  .vstrk-metrics-strip { flex-wrap: wrap; }
}

@keyframes vstrk-travel-v {
  0%, 100% { top: 0; }
  50%      { top: calc(100% - 34px); }
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
    cursor: 'default',
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
  heroFrame: {
    position: 'relative',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '32px',
    padding: '16px 12px 56px 12px',
  },
  visitorDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    border: '1px solid #888888',
    boxSizing: 'border-box',
    flexShrink: 0,
  },
  visitorLabel: {
    fontSize: '12px',
    color: '#888888',
    whiteSpace: 'nowrap',
  },
  card: {
    backgroundColor: '#141414',
    border: '1px solid #262626',
    borderLeftWidth: '3px',
    borderLeftStyle: 'solid',
    borderRadius: '8px',
    padding: '10px 14px',
    minWidth: '150px',
    maxWidth: '180px',
    boxSizing: 'border-box',
  },
  cardTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#f5f5f5',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cardSubtitle: {
    fontSize: '11px',
    color: '#888888',
    marginTop: '2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  revenueValue: {
    fontSize: '28px',
    fontWeight: 600,
    color: '#4ade80',
    lineHeight: 1.1,
    whiteSpace: 'nowrap',
  },
  revenueLabel: {
    fontSize: '12px',
    color: '#666666',
    marginTop: '2px',
    whiteSpace: 'nowrap',
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
    textAlign: 'center',
    fontSize: '11px',
    color: '#4d4d4d',
    flexShrink: 0,
  },
};

export default Tree;
