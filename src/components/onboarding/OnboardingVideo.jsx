import React, { useState } from 'react';
import OnboardingVideoSection01 from './OnboardingVideo/OnboardingVideoSection01';
import OnboardingVideoSection02 from './OnboardingVideo/OnboardingVideoSection02';
import OnboardingVideoSection03 from './OnboardingVideo/OnboardingVideoSection03';
import OnboardingVideoSection04 from './OnboardingVideo/OnboardingVideoSection04';
import OnboardingVideoSection05 from './OnboardingVideo/OnboardingVideoSection05';
import OnboardingVideoSection06 from './OnboardingVideo/OnboardingVideoSection06';

const SECTIONS = [
  {
    id: 1,
    label: '01 Tracking',
    short: 'Tracking',
    component: OnboardingVideoSection01,
  },
  {
    id: 2,
    label: '02 Asset',
    short: 'Asset',
    component: OnboardingVideoSection02,
  },
  {
    id: 3,
    label: '03 Collab',
    short: 'Collab',
    component: OnboardingVideoSection03,
  },
  {
    id: 4,
    label: '04 Operator',
    short: 'Operator',
    component: OnboardingVideoSection04,
  },
  {
    id: 5,
    label: '05 Workspace',
    short: 'Workspace',
    component: OnboardingVideoSection05,
  },
  {
    id: 6,
    label: '06 Marketplace',
    short: 'Marketplace',
    component: OnboardingVideoSection06,
  },
];

export default function OnboardingVideo({ onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const current = SECTIONS[currentIndex];
  const CurrentSection = current.component;

  const goTo = (index) => {
    if (index < 0 || index >= SECTIONS.length) return;
    setCurrentIndex(index);
  };

  const goNext = () => {
    if (currentIndex < SECTIONS.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      onClose?.();
    }
  };

  const goBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  };

  // When a section finishes or user hits its internal "Skip" / "Next step"
  const handleSectionComplete = () => {
    goNext();
  };

  const handleSectionSkip = () => {
    goNext();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20000,
        background: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
      }}
    >
      {/* Top bar — section navigation */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 20px',
          borderBottom: '1px solid #e8e8ee',
          background: '#fafafa',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {SECTIONS.map((s, i) => {
            const isActive = i === currentIndex;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => goTo(i)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  border: isActive ? '1px solid #5b3df0' : '1px solid #d9d9e3',
                  background: isActive ? '#5b3df0' : '#ffffff',
                  color: isActive ? '#ffffff' : '#6b6b78',
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {s.short}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onClose?.()}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '1px solid #d9d9e3',
            background: '#ffffff',
            color: '#6b6b78',
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Close onboarding"
        >
          ✕
        </button>
      </div>

      {/* Current section */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        <CurrentSection
          key={current.id} // force remount so each section starts from t=0
          onSkip={handleSectionSkip}
          onComplete={handleSectionComplete}
        />
      </div>

      {/* Bottom bar — Back / Next */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderTop: '1px solid #e8e8ee',
          background: '#fafafa',
        }}
      >
        <button
          type="button"
          onClick={goBack}
          disabled={currentIndex === 0}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: '1px solid #d9d9e3',
            background: currentIndex === 0 ? '#f3f3f7' : '#ffffff',
            color: currentIndex === 0 ? '#b0b0bc' : '#15151f',
            fontSize: 13,
            fontWeight: 600,
            cursor: currentIndex === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          ← Back
        </button>

        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: '#9a9aa8',
          }}
        >
          {current.label} · {currentIndex + 1} / {SECTIONS.length}
        </span>

        <button
          type="button"
          onClick={goNext}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: 'none',
            background: '#5b3df0',
            color: '#ffffff',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 6px 16px rgba(91,61,240,0.3)',
          }}
        >
          {currentIndex === SECTIONS.length - 1 ? 'Finish' : 'Next →'}
        </button>
      </div>
    </div>
  );
}