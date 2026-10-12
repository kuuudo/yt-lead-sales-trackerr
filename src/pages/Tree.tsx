import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// ─────────────────────────────────────────────────────────────────────────────
// Tree.tsx — VSTRK home screen
//
// Currently: header (VS-TRK + Structure / Journey / Analytics) and a full-bleed
// Sketchfab 3D model ("Ryppypaju" by carelessantics) as the hero.
//
// LATER: wire real data here — total revenue, Purchases, Sales Calls, Opt-ins,
// and a campaign switcher. A natural spot is an overlay positioned on top of the
// model frame (see `styles.overlay` — currently unused placeholder) so the
// 3D scene stays full-bleed underneath.
// ─────────────────────────────────────────────────────────────────────────────

type HeroButtonKey = 'structure' | 'journey' | 'analytics';

const BUTTONS: { key: HeroButtonKey; label: string; path: string }[] = [
  { key: 'structure', label: 'Structure', path: '/tree/structure' },
  { key: 'journey', label: 'Journey', path: '/tree/journey' },
  { key: 'analytics', label: 'Analytics', path: '/analytics/journey' },
];

const MODEL = {
  title: 'Ryppypaju',
  embedUrl:
    'https://sketchfab.com/models/da5b7216ddf34ef1a7103a7ebd26ca20/embed?camera=0&transparent=1',
  modelUrl: 'https://sketchfab.com/3d-models/ryppypaju-da5b7216ddf34ef1a7103a7ebd26ca20',
  author: 'carelessantics',
  authorUrl: 'https://sketchfab.com/carelessantics',
};

export function Tree() {
  const [hoveredBtn, setHoveredBtn] = useState<HeroButtonKey | null>(null);
  const navigate = useNavigate();

  return (
    <div style={styles.outerCanvas}>
      {/* ── Header: brand + Structure / Journey / Analytics ────────────── */}
      <div style={styles.topBar}>
        <div style={styles.brand}>
          <div style={styles.brandDot} />
          <span style={styles.brandLabel}>VS-TRK</span>
        </div>

        <div style={styles.headerActions}>
          {BUTTONS.map(({ key, label, path }) => (
            <button
              key={key}
              type="button"
              aria-label={label}
              onClick={() => navigate(path)}
              onMouseEnter={() => setHoveredBtn(key)}
              onMouseLeave={() => setHoveredBtn((cur) => (cur === key ? null : cur))}
              style={{
                ...styles.headerButton,
                ...(hoveredBtn === key ? styles.headerButtonHover : {}),
              }}
            >
              <span style={styles.headerButtonIcon}>▭</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 3D model hero ───────────────────────────────────────────────── */}
      <div style={styles.modelFrame}>
        <iframe
          title={MODEL.title}
          src={MODEL.embedUrl}
          frameBorder="0"
          allowFullScreen
          allow="autoplay; fullscreen; xr-spatial-tracking"
          style={styles.iframe}
        />
      </div>

      {/* Sketchfab attribution (required by the model's license) */}
      <div style={styles.credit}>
        <a href={MODEL.modelUrl} target="_blank" rel="nofollow noreferrer" style={styles.creditLink}>
          {MODEL.title}
        </a>{' '}
        by{' '}
        <a href={MODEL.authorUrl} target="_blank" rel="nofollow noreferrer" style={styles.creditLink}>
          {MODEL.author}
        </a>{' '}
        on{' '}
        <a href="https://sketchfab.com" target="_blank" rel="nofollow noreferrer" style={styles.creditLink}>
          Sketchfab
        </a>
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
    backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px)',
    backgroundSize: '24px 24px',
    overflow: 'hidden',
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
  modelFrame: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  iframe: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    border: 'none',
    background: 'transparent',
  },
  credit: {
    position: 'absolute',
    left: '24px',
    bottom: '12px',
    zIndex: 10,
    fontSize: '10px',
    color: '#4d4d4d',
  },
  creditLink: {
    color: '#666666',
    textDecoration: 'none',
  },
  // Placeholder for later: real metrics (revenue, Purchases, Sales Calls,
  // Opt-ins) + campaign switcher can be layered over the model with this.
  overlay: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 5,
  },
};

export default Tree;