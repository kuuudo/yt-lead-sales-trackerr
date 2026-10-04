import React, { useState } from 'react';

export type InstallGuide = {
  key: 'stripe' | 'pixel';
  shortLabel: string;
  image: string;
  alt: string;
  href: string;
  linkText: string;
};

export const STRIPE_GUIDE: InstallGuide = {
  key: 'stripe',
  shortLabel: 'Stripe Guide',
  image: '/onboarding/setup.jpg',
  alt: 'Stripe setup guide',
  href: 'https://docs.google.com/document/d/1KI05r0z6zsvQkSS5QOaUxRTDz8XIIRIoZSY59Ut9pEI/edit?tab=t.0',
  linkText: 'Stripe Setup Guide',
};

export const PIXEL_GUIDE: InstallGuide = {
  key: 'pixel',
  shortLabel: 'Pixel Guide',
  image: '/onboarding/pixel.jpg',
  alt: 'Pixel installation guide',
  href: 'https://docs.google.com/document/d/1-Dhb3BGdJLNJJwiwTN1Zg0Rcrznom4eH8ZHBcxPND0k/edit?tab=t.0',
  linkText: 'Installation of Pixel',
};

/**
 * Left guide panel for pixel-setup screens. Local tab state only,
 * intentionally separate from OnboardingOverlay.tsx's hub-level video systems.
 * Renders nothing when there are no guides for the current setup.
 */
export default function InstallGuidePanel({ guides }: { guides: InstallGuide[] }) {
  const [activeKey, setActiveKey] = useState<string>(guides[0]?.key ?? '');
  if (guides.length === 0) return null;
  const active = guides.find((g) => g.key === activeKey) ?? guides[0];

  return (
    <div
      style={{
        width: 320,
        flexShrink: 0,
        borderRight: '1px solid #e4e4e7',
        background: '#fafafa',
        display: 'flex',
        flexDirection: 'column',
        padding: 20,
        overflow: 'auto',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {guides.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setActiveKey(g.key)}
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: active.key === g.key ? '1.5px solid #16a34a' : '1px solid #d9d9e3',
              background: active.key === g.key ? '#16a34a' : '#fff',
              color: active.key === g.key ? '#fff' : '#6b6b78',
              fontSize: 10.5,
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {guides.length > 1 ? g.shortLabel : 'How to Install (Required Guide)'}
          </button>
        ))}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 260,
          borderRadius: 12,
          overflow: 'auto',
          background: '#fff',
          border: '1px solid #e4e4e7',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <img
          src={active.image}
          alt={active.alt}
          style={{
            width: '100%',
            height: 'auto',
            borderRadius: 8,
            border: '1px solid #e4e4e7',
            display: 'block',
          }}
        />
        <a
          href={active.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 12.5,
            fontWeight: 700,
            color: '#5b3df0',
            textDecoration: 'underline',
            lineHeight: 1.4,
          }}
        >
          {active.linkText}
        </a>
      </div>
    </div>
  );
}