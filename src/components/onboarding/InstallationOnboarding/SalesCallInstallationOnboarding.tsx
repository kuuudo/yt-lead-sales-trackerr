import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2, Phone } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useViewing } from '../../../lib/ViewingContext';
import {
  type CampaignExtended,
  generateAttributionPixel,
  getFunnelState,
  getTrackingState,
  computeExpectedCallValue,
} from '../../installation/installationHelpers';
import { CopyButton } from '../../installation/CopyButton';
import { isPixelSetupComplete, setPixelSetupComplete } from './pixelSetupCompletion';

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Installation Onboarding — Sales Call (GlobalAttribution-style white UI).
 * Reuses generateAttributionPixel + redirect_links — no new tracking system.
 */
export default function SalesCallInstallationOnboarding({
  campaignId,
  onDone,
  onBack,
}: {
  campaignId: string;
  onDone: () => void;
  onBack?: () => void;
}) {
  const { isReadOnly } = useViewing();
  const [campaign, setCampaign] = useState<CampaignExtended | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackedUrl, setTrackedUrl] = useState<string | null>(null);
  const [completed, setCompleted] = useState(() =>
    isPixelSetupComplete(campaignId, 'salesCall')
  );

  const handleToggleComplete = () => {
    const next = !completed;
    setPixelSetupComplete(campaignId, 'salesCall', next);
    setCompleted(next);
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

  const salesCallDelivery: string = campaign?.sales_call_delivery ?? 'external_platform';
  const notEnabled = !campaign?.has_sales_call;
  const isExternal = salesCallDelivery === 'external_platform';

  useEffect(() => {
    if (!campaign || notEnabled || !isExternal || !campaign.sales_call_booking_url) {
      setTrackedUrl(null);
      return;
    }
    const bookingUrl = campaign.sales_call_booking_url;
    const sync = async () => {
      const { data: existing } = await supabase
        .from('redirect_links')
        .select('token, destination_url')
        .eq('campaign_id', campaign.id)
        .eq('link_type', 'sales_call')
        .is('video_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (isReadOnly) {
        if (existing) setTrackedUrl(`${window.location.origin}/${existing.token}`);
        return;
      }

      if (!existing) {
        const token = generateToken();
        const { error: insErr } = await supabase.from('redirect_links').insert({
          token,
          campaign_id: campaign.id,
          link_type: 'sales_call',
          destination_url: bookingUrl,
          video_id: null,
        });
        if (!insErr) setTrackedUrl(`${window.location.origin}/${token}`);
      } else if (existing.destination_url !== bookingUrl) {
        await supabase
          .from('redirect_links')
          .update({ destination_url: bookingUrl })
          .eq('campaign_id', campaign.id)
          .eq('link_type', 'sales_call')
          .is('video_id', null);
        setTrackedUrl(`${window.location.origin}/${existing.token}`);
      } else {
        setTrackedUrl(`${window.location.origin}/${existing.token}`);
      }
    };
    sync();
  }, [campaign?.id, campaign?.sales_call_booking_url, notEnabled, isExternal, isReadOnly]);

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
            <button type="button" onClick={onBack} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #d9d9e3', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              Back
            </button>
          </div>
        )}
      </div>
    );
  }

  const funnelState = getFunnelState(campaign, 'salesCall');
  const trackingState = getTrackingState(campaign, 'salesCall', null);
  const expectedCallValue = computeExpectedCallValue(campaign);
  const salesPixel = generateAttributionPixel(campaign.id, 'sales_call', null);

  const hasThankYou = !!campaign.sales_call_thankyou_url;

  const card = {
    border: '1px solid #e4e4e7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    background: '#fafafa',
  } as const;

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
        <Phone size={18} style={{ color: '#5b3df0' }} />
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#15151f', margin: 0 }}>
          Sales Call Installation
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
        {notEnabled
          ? 'Not enabled on this campaign'
          : `Funnel: ${funnelState} · Tracking: ${trackingState} · ${
              isExternal ? 'External platform' : 'Embedded on own website'
            }`}
      </p>

      {notEnabled ? (
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
            Sales Call is not enabled. Skip, or set it up from the hub first.
          </p>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 13, color: '#6b6b78', margin: '0 0 14px', lineHeight: 1.5 }}>
            Expected revenue per booked call:{' '}
            <strong style={{ color: '#15151f' }}>${expectedCallValue}</strong>
            <span style={{ color: '#a1a1aa' }}>
              {' '}
              (${campaign.offer_price ?? 0} × {campaign.estimated_close_rate ?? 0}% close rate)
              {(campaign.average_upsell_value ?? 0) > 0
                ? ` + $${campaign.average_upsell_value} avg upsell`
                : ''}
            </span>
          </p>

          {funnelState === 'inactive' && (
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
                No booking URL yet. Add one in campaign settings.
              </p>
            </div>
          )}

          {!isExternal && funnelState !== 'inactive' && (
            <>
             

              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: 14,
                  borderRadius: 12,
                  border: hasThankYou ? '1px solid #bbf7d0' : '1px solid #fed7aa',
                  background: hasThankYou ? '#f0fdf4' : '#fff7ed',
                  marginBottom: 12,
                }}
              >
                {hasThankYou ? (
                  <CheckCircle2 size={14} style={{ color: '#16a34a', flexShrink: 0, marginTop: 2 }} />
                ) : (
                  <AlertCircle size={14} style={{ color: '#ea580c', flexShrink: 0, marginTop: 2 }} />
                )}
                <p style={{ fontSize: 13, color: '#3f3f46', margin: 0, lineHeight: 1.5 }}>
                  {hasThankYou
                    ? 'Confirmation page detected. Paste the pixel below on your booking thank-you page.'
                    : 'No confirmation page URL yet — pixel is ready; add a thank-you page when you can.'}
                </p>
              </div>

              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Sales call confirmation pixel
                  </span>
                  <CopyButton text={salesPixel} />
                </div>
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid #e4e4e7',
                    background: '#fff',
                    fontSize: 11,
                    fontFamily: 'ui-monospace, monospace',
                    color: '#52525b',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    lineHeight: 1.45,
                  }}
                >
                  {salesPixel}
                </pre>
              </div>
            </>
          )}

          {isExternal && funnelState !== 'inactive' && (
            <div style={card}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <Info size={14} style={{ color: '#5b3df0', flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: 12, color: '#3f3f46', margin: 0, lineHeight: 1.5 }}>
                  External booking tracks click-through intent. Use the tracked link as your booking
                  button. Confirmation needs your platform success URL + thank-you page when possible.
                </p>
              </div>
              {trackedUrl ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div
                    style={{
                      flex: 1,
                      padding: 10,
                      borderRadius: 10,
                      border: '1px solid #e4e4e7',
                      background: '#fff',
                      fontSize: 11,
                      fontFamily: 'ui-monospace, monospace',
                      color: '#52525b',
                      wordBreak: 'break-all',
                    }}
                  >
                    {trackedUrl}
                  </div>
                  <CopyButton text={trackedUrl} />
                </div>
              ) : (
                <p style={{ fontSize: 12, color: '#71717a', margin: 0 }}>Generating tracked link…</p>
              )}
            </div>
          )}
        </>
      )}

      <button
        type="button"
        onClick={handleToggleComplete}
        style={{
          width: '100%',
          marginTop: 16,
          padding: '12px 16px',
          borderRadius: 10,
          border: completed ? '1px solid #bbf7d0' : '1px solid #d9d9e3',
          background: completed ? '#f0fdf4' : '#fff',
          color: completed ? '#16a34a' : '#3f3f46',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {completed ? '✓ Marked as complete' : '○ Mark as complete'}
      </button>

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
          {notEnabled ? 'Skip →' : 'Next →'}
        </button>
      </div>
    </div>
  );
}