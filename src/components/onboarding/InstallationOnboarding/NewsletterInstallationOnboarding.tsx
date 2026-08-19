import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Newspaper } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import {
  type CampaignExtended,
  generateAttributionPixel,
  getFunnelState,
  getTrackingState,
} from '../../installation/installationHelpers';
import { CopyButton } from '../../installation/CopyButton';
import { isPixelSetupComplete, setPixelSetupComplete } from './pixelSetupCompletion';
import WhyDoWeNeedThankYouPagePixel from '../PixelSetupVideo/WhyDoWeNeedThankYouPagePixel';
import WhyThankyouPixelOnMultipleWebsite from '../PixelSetupVideo/WhyThankyouPixelOnMultipleWebsite';

type PixelSetupVideoTabKey = 'why' | 'multiple';

const PIXEL_SETUP_VIDEO_TABS: {
  key: PixelSetupVideoTabKey;
  label: string;
  Component: React.ComponentType<{ onSkip?: () => void; onComplete?: () => void }>;
}[] = [
  { key: 'why', label: 'Why It Matters', Component: WhyDoWeNeedThankYouPagePixel },
  { key: 'multiple', label: 'Multiple Pages', Component: WhyThankyouPixelOnMultipleWebsite },
];

/**
 * Installation Onboarding — Newsletter (GlobalAttribution-style white UI).
 * Reuses generateAttributionPixel only — no new tracking system.
 */
export default function NewsletterInstallationOnboarding({
  campaignId,
  onDone,
  onBack,
}: {
  campaignId: string;
  onDone: () => void;
  onBack?: () => void;
}) {
  const [campaign, setCampaign] = useState<CampaignExtended | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [manuallyCompleted, setManuallyCompleted] = useState(() =>
    isPixelSetupComplete(campaignId, 'newsletter')
  );
  const handleToggleComplete = () => {
    const next = !manuallyCompleted;
    setPixelSetupComplete(campaignId, 'newsletter', next);
    setManuallyCompleted(next);
  };
  const [videoTab, setVideoTab] = useState<PixelSetupVideoTabKey>('why');
  const goToNextVideoTab = () => {
    setVideoTab((current: PixelSetupVideoTabKey) => {
      const idx = PIXEL_SETUP_VIDEO_TABS.findIndex((t) => t.key === current);
      const next = PIXEL_SETUP_VIDEO_TABS[idx + 1];
      return next ? next.key : current;
    });
  };
  
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: cErr } = await supabase
          .from('campaigns')
          .select('*')
          .eq('id', campaignId)
          .single();
        if (cErr) throw cErr;
        setCampaign(data as CampaignExtended);
      } catch (e: any) {
        setError(e?.message || 'Failed to load campaign');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [campaignId]);

  if (loading) {
    return (
      <div style={{ padding: 40, display: 'flex', justifyContent: 'center', background: '#fff', minHeight: 200 }}>
        <Loader2 className="animate-spin" size={28} style={{ color: '#5b3df0' }} />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div style={{ padding: 28, background: '#fff', color: '#dc2626', fontSize: 13 }}>
        {error || 'Campaign not found'}
        {onBack && (
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={onBack}
              style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #d9d9e3', background: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
              Back
            </button>
          </div>
        )}
      </div>
    );
  }

  const funnelState = getFunnelState(campaign, 'newsletter');
  const trackingState = getTrackingState(campaign, 'newsletter', null);
  const inactive = funnelState === 'inactive';
  const snippet = generateAttributionPixel(campaign.id, 'newsletter', 0);
  const hasThankYou = !!campaign.newsletter_thankyou_url;

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
        background: '#fff',
      }}
    >
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
          {PIXEL_SETUP_VIDEO_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setVideoTab(tab.key)}
              style={{
                padding: '6px 10px',
                borderRadius: 999,
                border: videoTab === tab.key ? '1.5px solid #16a34a' : '1px solid #d9d9e3',
                background: videoTab === tab.key ? '#16a34a' : '#fff',
                color: videoTab === tab.key ? '#fff' : '#6b6b78',
                fontSize: 10.5,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div
          style={{
            flex: 1,
            minHeight: 260,
            borderRadius: 12,
            overflow: 'hidden',
            background: '#fff',
            border: '1px solid #e4e4e7',
          }}
        >
          {PIXEL_SETUP_VIDEO_TABS.map((tab) => {
            if (tab.key !== videoTab) return null;
            const VideoComponent = tab.Component;
            return <VideoComponent key={tab.key} onSkip={goToNextVideoTab} onComplete={goToNextVideoTab} />;
          })}
        </div>
      </div>

      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: 'auto',
          padding: '28px 24px 24px',
        }}
      >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Newspaper size={18} style={{ color: '#5b3df0' }} />
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#15151f', margin: 0 }}>
          Newsletter Installation
        </h2>
      </div>
      <p
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: '#6b6b78',
          margin: '0 0 16px',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        Funnel: {funnelState} · Tracking: {trackingState}
      </p>

      {inactive ? (
        <div
          style={{
            display: 'flex',
            gap: 12,
            padding: 14,
            borderRadius: 12,
            border: '1px solid #fecaca',
            background: '#fef2f2',
            marginBottom: 16,
          }}
        >
          <AlertCircle size={14} style={{ color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13, color: '#3f3f46', margin: 0, lineHeight: 1.5 }}>
            No newsletter signup URL on this campaign yet. Skip for now, or set Newsletter up from
            the hub first.
          </p>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              gap: 12,
              padding: 14,
              borderRadius: 12,
              border: hasThankYou ? '1px solid #bbf7d0' : '1px solid #fed7aa',
              background: hasThankYou ? '#f0fdf4' : '#fff7ed',
              marginBottom: 16,
            }}
          >
            {hasThankYou ? (
              <CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0, marginTop: 2 }} />
            ) : (
              <AlertCircle size={14} style={{ color: '#ea580c', flexShrink: 0, marginTop: 2 }} />
            )}
            <p style={{ fontSize: 13, color: '#3f3f46', margin: 0, lineHeight: 1.5 }}>
              {hasThankYou
                ? 'Thank-you page detected. Paste this pixel on your newsletter confirmation page.'
                : 'No thank-you page URL yet — pixel is ready below. Add a thank-you page when you can for best tracking.'}
            </p>
          </div>

          <div
            style={{
              border: '1px solid #e4e4e7',
              borderRadius: 12,
              padding: 14,
              marginBottom: 12,
              background: '#fafafa',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#16a34a',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Newsletter tracking pixel
              </span>
              <CopyButton text={snippet} />
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
                wordBreak: 'break-all',
                lineHeight: 1.45,
              }}
            >
              {snippet}
            </pre>
          </div>
        </>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: 14,
          borderRadius: 12,
          border: manuallyCompleted ? '1px solid #bbf7d0' : '1px solid #d9d9e3',
          background: manuallyCompleted ? '#f0fdf4' : '#fafafa',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CheckCircle2 size={18} style={{ color: manuallyCompleted ? '#16a34a' : '#a1a1aa' }} />
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#15151f', margin: 0 }}>
              {manuallyCompleted ? 'Marked as complete' : 'Have you installed this pixel?'}
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
            border: manuallyCompleted ? '1px solid #bbf7d0' : 'none',
            background: manuallyCompleted ? '#fff' : '#16a34a',
            color: manuallyCompleted ? '#16a34a' : '#fff',
            fontSize: 12.5,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {manuallyCompleted ? 'Mark as not complete' : 'Mark as complete ✓'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
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
          {inactive ? 'Skip →' : 'Next →'}
        </button>
      </div>
      </div>
    </div>
  );
}