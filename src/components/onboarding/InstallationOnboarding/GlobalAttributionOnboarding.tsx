import React, { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Globe,
  Info,
  MessageSquare,
} from 'lucide-react';
import { GLOBAL_TRACKING_SCRIPT } from '../../installation/GlobalWebsiteTrackingSection';
import { CopyButton } from '../../installation/CopyButton';
import {
  isGlobalAttributionComplete,
  setGlobalAttributionComplete,
  type GlobalAttributionPath,
} from './globalAttributionCompletion';

/**
 * Installation Onboarding — Global Attribution (shared, once).
 * Reuses GLOBAL_TRACKING_SCRIPT from the Installation page. Does not change tracking logic.
 *
 * Shared across all four paths (Direct Purchase / Newsletter / Sales Call /
 * Paid Consultation) — campaignId + path scope the "Mark as complete"
 * localStorage flag (see globalAttributionCompletion.ts) so each
 * campaign/path combination has an independent completion state. No
 * Supabase column involved — this is a manual, browser-remembered flag.
 */
export default function GlobalAttributionOnboarding({
  campaignId,
  path,
  onDone,
  onBack,
}: {
  campaignId: string;
  path: GlobalAttributionPath;
  onDone: () => void;
  onBack?: () => void;
}) {
  const platforms = ['Webflow', 'WordPress', 'Framer', 'Wix', 'Shopify', 'Custom HTML'];
  const chatgptPrompt =
    'Help me install this tracking script into my website. Show me exactly where to place it in the <head> section. My website platform is: [INSERT PLATFORM NAME].';

  const [completed, setCompleted] = useState(() => isGlobalAttributionComplete(campaignId, path));

  const handleToggleComplete = () => {
    const next = !completed;
    setGlobalAttributionComplete(campaignId, path, next);
    setCompleted(next);
  };

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '28px 24px 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Globe size={18} style={{ color: '#16a34a' }} />
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#15151f', margin: 0 }}>
          Global Website Tracking
        </h2>
      </div>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#6b6b78', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Persistent Attribution · Required once
      </p>

      <div
        style={{
          display: 'flex',
          gap: 12,
          padding: 14,
          borderRadius: 12,
          border: '1px solid #bbf7d0',
          background: '#f0fdf4',
          marginBottom: 16,
        }}
      >
        <Info size={14} style={{ color: '#16a34a', flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#15151f', margin: '0 0 8px', lineHeight: 1.5 }}>
            Install this once on your website so visitor attribution survives across Landing,
            Newsletter, Call, and Consultation pages.
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {[
              'Stores vt_* params in the browser across page loads',
              'Improves embedded Calendly / TidyCal tracking',
              'Keeps attribution across multi-step funnels',
              'Put it on every entry / funnel page you control',
            ].map((item) => (
              <li
                key={item}
                style={{
                  display: 'flex',
                  gap: 8,
                  fontSize: 12,
                  color: '#3f3f46',
                  marginBottom: 4,
                  lineHeight: 1.45,
                }}
              >
                <CheckCircle2 size={12} style={{ color: '#16a34a', flexShrink: 0, marginTop: 2 }} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Global Attribution Script
          </span>
          <CopyButton text={GLOBAL_TRACKING_SCRIPT} label="Copy Script" />
        </div>
        <pre
          style={{
            margin: 0,
            padding: 14,
            borderRadius: 12,
            border: '1px solid #e4e4e7',
            background: '#fafafa',
            fontSize: 11,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            color: '#52525b',
            overflowX: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            lineHeight: 1.5,
          }}
        >
          {GLOBAL_TRACKING_SCRIPT}
        </pre>
      </div>

      <div style={{ marginBottom: 16 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: '#6b6b78',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            margin: '0 0 10px',
          }}
        >
          <BookOpen size={12} /> Installation steps
        </p>
        {[
          {
            step: '1',
            title: 'Open your website builder or code editor',
            desc: 'Access settings or source code for each funnel page you control.',
          },
          {
            step: '2',
            title: 'Paste inside the <head> on all entry / funnel pages',
            desc: 'Landing, Newsletter, Booking, Consultation, Product — any page that can be an entry.',
          },
          {
            step: '3',
            title: 'Publish or save',
            desc: 'The script runs on each load and keeps attribution in localStorage.',
          },
        ].map((item) => (
          <div
            key={item.step}
            style={{
              display: 'flex',
              gap: 12,
              padding: 12,
              borderRadius: 12,
              border: '1px solid #e4e4e7',
              marginBottom: 8,
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                background: '#f4f4f5',
                border: '1px solid #e4e4e7',
                fontSize: 10,
                fontWeight: 800,
                color: '#71717a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {item.step}
            </span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#15151f', margin: 0 }}>{item.title}</p>
              <p style={{ fontSize: 12, color: '#71717a', margin: '4px 0 0', lineHeight: 1.45 }}>
                {item.desc}
              </p>
            </div>
          </div>
        ))}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#a1a1aa', textTransform: 'uppercase' }}>
            Works with:
          </span>
          {platforms.map((p) => (
            <span
              key={p}
              style={{
                fontSize: 10,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                padding: '2px 8px',
                borderRadius: 999,
                background: '#f4f4f5',
                border: '1px solid #e4e4e7',
                color: '#71717a',
              }}
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{
          padding: 14,
          borderRadius: 12,
          border: '1px solid #e4e4e7',
          background: '#fafafa',
          marginBottom: 20,
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: '#6b6b78',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            margin: '0 0 8px',
          }}
        >
          <MessageSquare size={12} /> Need help installing?
        </p>
        <p style={{ fontSize: 12, color: '#71717a', margin: '0 0 10px', lineHeight: 1.45 }}>
          Copy this prompt into ChatGPT for step-by-step help on your platform.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <CopyButton text={chatgptPrompt} label="Copy Prompt" />
        </div>
        <pre
          style={{
            margin: 0,
            padding: 12,
            borderRadius: 10,
            border: '1px solid #e4e4e7',
            background: '#fff',
            fontSize: 11,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            color: '#52525b',
            whiteSpace: 'pre-wrap',
            lineHeight: 1.45,
          }}
        >
          {chatgptPrompt}
        </pre>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: 14,
          borderRadius: 12,
          border: completed ? '1px solid #bbf7d0' : '1px solid #d9d9e3',
          background: completed ? '#f0fdf4' : '#fafafa',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={18} style={{ color: completed ? '#16a34a' : '#a1a1aa' }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#15151f', margin: 0 }}>
              {completed ? 'Marked as complete' : 'Have you installed this script?'}
            </p>
            <p style={{ fontSize: 11.5, color: '#71717a', margin: '2px 0 0', lineHeight: 1.4 }}>
              This is a manual confirmation — VSTRK doesn't verify installation automatically.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleToggleComplete}
          style={{
            flexShrink: 0,
            padding: '9px 14px',
            borderRadius: 8,
            border: completed ? '1px solid #bbf7d0' : 'none',
            background: completed ? '#fff' : '#16a34a',
            color: completed ? '#16a34a' : '#fff',
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {completed ? 'Mark as not complete' : 'Mark as complete ✓'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 8,
              border: '1px solid #d9d9e3',
              background: '#fff',
              color: '#3f3f46',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Back
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          style={{
            flex: 1,
            padding: '12px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#5b3df0',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 6px 16px rgba(91,61,240,0.3)',
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}