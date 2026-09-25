import React, { useState } from 'react';
import { DashboardWidget } from '../components/DashboardWidget';
import CampaignStructureMap from './CampaignStructureMap';
import CampaignJourneyMap from './CampaignJourneyMap';

type LensMode = 'revenue' | 'structure' | 'journey';

export function Tree() {
  const [activeMode, setActiveMode] = useState<LensMode>('revenue');

  return (
    <div style={styles.outerCanvas}>
      {/* Top Floating Miro-Style Toolbar */}
      <div style={styles.floatingToolbar}>
        <div style={styles.pillGroup}>
          <button
            type="button"
            onClick={() => setActiveMode('revenue')}
            style={{
              ...styles.pillButton,
              ...(activeMode === 'revenue' ? styles.pillActive : styles.pillInactive),
            }}
          >
            <span style={styles.radioDot}>{activeMode === 'revenue' ? '◉' : '○'}</span>
            <span>Revenue</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('structure')}
            style={{
              ...styles.pillButton,
              ...(activeMode === 'structure' ? styles.pillActive : styles.pillInactive),
            }}
          >
            <span style={styles.radioDot}>{activeMode === 'structure' ? '◉' : '○'}</span>
            <span>Structure</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveMode('journey')}
            style={{
              ...styles.pillButton,
              ...(activeMode === 'journey' ? styles.pillActive : styles.pillInactive),
            }}
          >
            <span style={styles.radioDot}>{activeMode === 'journey' ? '◉' : '○'}</span>
            <span>Journey</span>
          </button>
        </div>
      </div>

      {/* Inner Mirror Canvas Container */}
      <div style={styles.innerCanvasFrame}>
        {activeMode === 'revenue' && (
          <div style={styles.revenueViewport}>
            <DashboardWidget />
          </div>
        )}

        {activeMode === 'structure' && (
          <CampaignStructureMap embedded />
        )}

        {activeMode === 'journey' && (
          <CampaignJourneyMap embedded />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  outerCanvas: {
    position: 'relative',
    width: '100%',
    height: 'calc(100vh - 56px)',
    backgroundColor: '#0a0a0a',
    backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px)',
    backgroundSize: '24px 24px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  floatingToolbar: {
    position: 'absolute',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 100,
    pointerEvents: 'auto',
  },
  pillGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: '#141414',
    border: '1px solid #282828',
    borderRadius: '9999px',
    padding: '4px 6px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
    backdropFilter: 'blur(8px)',
  },
  pillButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 600,
    fontFamily: 'monospace, sans-serif',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    outline: 'none',
    border: 'none',
  },
  pillActive: {
    backgroundColor: '#262626',
    color: '#ffffff',
    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
  },
  pillInactive: {
    backgroundColor: 'transparent',
    color: '#888888',
  },
  radioDot: {
    fontSize: '11px',
    lineHeight: 1,
  },
  innerCanvasFrame: {
    position: 'relative',
    width: '100%',
    height: '100%',
    zIndex: 1,
  },
  revenueViewport: {
    width: '100%',
    height: '100%',
    overflowY: 'auto',
    padding: '72px 24px 24px 24px',
  },
};