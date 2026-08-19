import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Info,
  Key,
  Loader2,
  Webhook,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useEffectiveIdentity } from '../../../lib/useEffectiveIdentity';
import { useViewing } from '../../../lib/ViewingContext';
import { WEBHOOK_ENDPOINT } from '../../../lib/tracker';
import {
  type CampaignExtended,
  type StripeConfig,
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

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

type ArchC = {
  redirectUrl: string | null;
  linkType: string;
  eventLabel: string;
  limitationMessage: string;
  showConfirmationPixel: boolean;
};

function resolveArchC(
  campaign: CampaignExtended,
  consultationDelivery: string,
  consultationPaymentMethod: string
): ArchC {
  const bookingUrl = campaign.consultation_booking_url ?? null;
  const checkoutUrl = campaign.paid_consultation_checkout_url ?? null;
  const thankyouUrl = campaign.consultation_thankyou_url ?? null;

  if (consultationDelivery === 'external_platform') {
    if (bookingUrl) {
      return {
        redirectUrl: bookingUrl,
        linkType: 'external_platform_redirected',
        eventLabel: 'Booking',
        limitationMessage:
          'Tracks click-through to your booking platform — intent only. Use platform success URL + thank-you page for confirmation when possible.',
        showConfirmationPixel: false,
      };
    }
    if (thankyouUrl) {
      return {
        redirectUrl: thankyouUrl,
        linkType: 'external_platform_redirected',
        eventLabel: 'Booking',
        limitationMessage:
          'No booking URL — using thank-you page as redirect. Paste tracked link into platform success URL if available.',
        showConfirmationPixel: false,
      };
    }
    return {
      redirectUrl: null,
      linkType: 'external_platform_redirected',
      eventLabel: 'Booking',
      limitationMessage: 'Add a booking URL to generate a tracked redirect.',
      showConfirmationPixel: false,
    };
  }

  if (consultationPaymentMethod === 'alternative_payment') {
    if (checkoutUrl) {
      return {
        redirectUrl: checkoutUrl,
        linkType: 'checkout_opened',
        eventLabel: 'Payment',
        limitationMessage:
          'Tracked link records payment intent, not confirmed payment.' +
          (thankyouUrl ? ' Confirmation pixel is below.' : ''),
        showConfirmationPixel: !!thankyouUrl,
      };
    }
    if (thankyouUrl) {
      return {
        redirectUrl: thankyouUrl,
        linkType: 'checkout_opened',
        eventLabel: 'Payment',
        limitationMessage: 'No checkout URL — using thank-you as redirect. Confirmation pixel below.',
        showConfirmationPixel: true,
      };
    }
    return {
      redirectUrl: null,
      linkType: 'checkout_opened',
      eventLabel: 'Payment',
      limitationMessage: 'Add checkout or thank-you URL in campaign settings.',
      showConfirmationPixel: false,
    };
  }

  if (consultationPaymentMethod === 'payment_instructions_page') {
    if (checkoutUrl) {
      return {
        redirectUrl: checkoutUrl,
        linkType: 'payment_instruction_viewed',
        eventLabel: 'Payment Page',
        limitationMessage:
          'Tracks when someone opens payment instructions, not that they paid.' +
          (thankyouUrl ? ' Confirmation pixel is below.' : ''),
        showConfirmationPixel: !!thankyouUrl,
      };
    }
    if (thankyouUrl) {
      return {
        redirectUrl: thankyouUrl,
        linkType: 'payment_instruction_viewed',
        eventLabel: 'Payment Page',
        limitationMessage: 'No instruction URL — using thank-you as redirect. Confirmation pixel below.',
        showConfirmationPixel: true,
      };
    }
    return {
      redirectUrl: null,
      linkType: 'payment_instruction_viewed',
      eventLabel: 'Payment Page',
      limitationMessage: 'Add payment instruction or thank-you URL in campaign settings.',
      showConfirmationPixel: false,
    };
  }

  return {
    redirectUrl: checkoutUrl,
    linkType: 'consultation',
    eventLabel: 'Payment',
    limitationMessage: 'Intent tracking only without direct integration.',
    showConfirmationPixel: false,
  };
}

/**
 * Installation Onboarding — Paid Consultation (GlobalAttribution-style white UI).
 */
export default function PaidConsultationInstallationOnboarding({
  campaignId,
  onDone,
  onBack,
}: {
  campaignId: string;
  onDone: () => void;
  onBack?: () => void;
}) {
  const { userId } = useEffectiveIdentity();
  const { isReadOnly } = useViewing();
  const [campaign, setCampaign] = useState<CampaignExtended | null>(null);
  const [stripeConfig, setStripeConfig] = useState<StripeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trackedUrl, setTrackedUrl] = useState<string | null>(null);
  const [webhookSecret, setWebhookSecret] = useState('');
  const [savingSecret, setSavingSecret] = useState(false);

  const [completed, setCompleted] = useState(() =>
  isPixelSetupComplete(campaignId, 'consultation')
);

  const handleToggleComplete = () => {
  const next = !completed;
  setPixelSetupComplete(campaignId, 'consultation', next);
  setCompleted(next);
};
  const [videoTab, setVideoTab] = useState<PixelSetupVideoTabKey>('why');
  const goToNextVideoTab = () => {
    setVideoTab((current: PixelSetupVideoTabKey) => {
      const idx = PIXEL_SETUP_VIDEO_TABS.findIndex((t) => t.key === current);
      const next = PIXEL_SETUP_VIDEO_TABS[idx + 1];
      return next ? next.key : current;
    });
  };

  const load = async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: camp, error: cErr }, { data: stripeConf }] = await Promise.all([
        supabase.from('campaigns').select('*').eq('id', campaignId).single(),
        userId
          ? supabase
              .from('stripe_configs')
              .select('stripe_webhook_secret')
              .eq('user_id', userId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      if (cErr) throw cErr;
      setCampaign(camp as CampaignExtended);
      setStripeConfig((stripeConf as StripeConfig) ?? null);
    } catch (e: any) {
      setError(e?.message || 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [campaignId, userId]);

  const notEnabled = !campaign?.has_paid_consultation;
  const consultationDelivery: string = campaign?.consultation_delivery ?? 'external_platform';
  const consultationPaymentMethod: string =
    campaign?.consultation_payment_method ??
    (campaign?.uses_stripe_consultation ? 'stripe_checkout' : 'alternative_payment');

  const archC =
    campaign && !notEnabled
      ? resolveArchC(campaign, consultationDelivery, consultationPaymentMethod)
      : null;

  const needsRedirect =
    !!archC?.redirectUrl &&
    (consultationDelivery === 'external_platform' ||
      consultationPaymentMethod === 'alternative_payment' ||
      consultationPaymentMethod === 'payment_instructions_page');

  const needsStripeTracked =
    consultationDelivery === 'own_website' && consultationPaymentMethod === 'stripe_checkout';

  useEffect(() => {
    if (!campaign || notEnabled) {
      setTrackedUrl(null);
      return;
    }

    const dest =
      needsStripeTracked
        ? campaign.paid_consultation_checkout_url
        : needsRedirect
          ? archC?.redirectUrl
          : null;
    const linkType = needsStripeTracked ? 'consultation' : archC?.linkType ?? 'consultation';

    if (!dest) {
      setTrackedUrl(null);
      return;
    }

    const sync = async () => {
      const { data: existing } = await supabase
        .from('redirect_links')
        .select('token, destination_url')
        .eq('campaign_id', campaign.id)
        .eq('link_type', linkType)
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
          link_type: linkType,
          destination_url: dest,
          video_id: null,
        });
        if (!insErr) setTrackedUrl(`${window.location.origin}/${token}`);
      } else if (existing.destination_url !== dest) {
        await supabase
          .from('redirect_links')
          .update({ destination_url: dest })
          .eq('campaign_id', campaign.id)
          .eq('link_type', linkType)
          .is('video_id', null);
        setTrackedUrl(`${window.location.origin}/${existing.token}`);
      } else {
        setTrackedUrl(`${window.location.origin}/${existing.token}`);
      }
    };
    sync();
  }, [
    campaign?.id,
    campaign?.paid_consultation_checkout_url,
    notEnabled,
    needsRedirect,
    needsStripeTracked,
    archC?.redirectUrl,
    archC?.linkType,
    isReadOnly,
  ]);

  const handleSaveSecret = async () => {
    if (isReadOnly || !userId || !webhookSecret.trim()) return;
    setSavingSecret(true);
    await supabase.from('stripe_configs').upsert(
      { user_id: userId, stripe_webhook_secret: webhookSecret.trim() },
      { onConflict: 'user_id' }
    );
    setSavingSecret(false);
    setWebhookSecret('');
    await load();
  };

  if (loading) {
    return (
      <div style={{ padding: 40, display: 'flex', justifyContent: 'center', background: '#fff', minHeight: 200 }}>
        <Loader2 className="animate-spin" size={28} style={{ color: '#5b3df0' }} />
      </div>
    );
  }

  if (error || !campaign || !userId) {
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

  const funnelState = getFunnelState(campaign, 'consultation');
  const trackingState = getTrackingState(campaign, 'consultation', stripeConfig);
  const isConnected = !!(stripeConfig?.stripe_webhook_secret);
  const maskSecret = (s: string) => s.slice(0, 8) + '••••••••••••' + s.slice(-4);

  const consultPixel = generateAttributionPixel(
    campaign.id,
    'consultation',
    campaign.consultation_fee ?? null
  );
  const confirmedPixel = generateAttributionPixel(
    campaign.id,
    'consultation_confirmed',
    campaign.consultation_fee ?? null
  );

  const card = {
    border: '1px solid #e4e4e7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    background: '#fafafa',
  } as const;

  const methodLabel =
    consultationPaymentMethod === 'stripe_checkout'
      ? 'Stripe Checkout'
      : consultationPaymentMethod === 'stripe_embedded'
        ? 'Stripe Embedded'
        : consultationPaymentMethod === 'embedded_alternative_payment'
          ? 'Embedded alternative payment'
          : consultationPaymentMethod === 'alternative_payment'
            ? 'Alternative payment'
            : 'Payment instructions page';

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
        <CreditCard size={18} style={{ color: '#5b3df0' }} />
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#15151f', margin: 0 }}>
          Paid Consultation Installation
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
              consultationDelivery === 'own_website' ? 'Own website' : 'External'
            } · ${methodLabel}`}
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
            Paid Consultation is not enabled. Skip, or set it up from the hub first.
          </p>
        </div>
      ) : (
        <>
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
                No consultation booking URL yet. Add one in campaign settings.
              </p>
            </div>
          )}

          {funnelState !== 'inactive' &&
            consultationDelivery === 'own_website' &&
            (consultationPaymentMethod === 'stripe_checkout' ||
              consultationPaymentMethod === 'stripe_embedded') && (
              <div style={{ ...card, border: '1px solid #ddd6fe', background: '#f5f3ff' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#5b21b6', textTransform: 'uppercase' }}>
                    <Webhook size={14} /> Stripe Webhook
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: isConnected ? '#16a34a' : '#ea580c' }}>
                    {isConnected ? 'Connected' : 'Not connected'}
                  </span>
                </div>

                {consultationPaymentMethod === 'stripe_checkout' && (
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#15151f', margin: '0 0 6px' }}>
                      Tracked checkout link
                    </p>
                    {trackedUrl ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <div style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#52525b', wordBreak: 'break-all' }}>
                          {trackedUrl}
                        </div>
                        <CopyButton text={trackedUrl} />
                      </div>
                    ) : (
                      <p style={{ fontSize: 12, color: '#71717a', margin: 0 }}>
                        {campaign.paid_consultation_checkout_url
                          ? 'Generating…'
                          : 'Add consultation checkout URL in settings.'}
                      </p>
                    )}
                  </div>
                )}

                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#15151f', margin: '0 0 6px' }}>
                    Webhook endpoint
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#52525b', wordBreak: 'break-all' }}>
                      {WEBHOOK_ENDPOINT}
                    </div>
                    <CopyButton text={WEBHOOK_ENDPOINT} />
                  </div>
                </div>

                {isConnected && stripeConfig?.stripe_webhook_secret && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, border: '1px solid #bbf7d0', background: '#f0fdf4', marginBottom: 8 }}>
                    <CheckCircle2 size={14} style={{ color: '#16a34a' }} />
                    <span style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#3f3f46' }}>
                      {maskSecret(stripeConfig.stripe_webhook_secret)}
                    </span>
                  </div>
                )}
                {!isReadOnly && (
                  <>
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <Key size={13} style={{ position: 'absolute', left: 12, top: 12, color: '#a1a1aa' }} />
                      <input
                        type="password"
                        value={webhookSecret}
                        onChange={(e) => setWebhookSecret(e.target.value)}
                        placeholder="whsec_••••••••"
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          padding: '10px 12px 10px 36px',
                          borderRadius: 10,
                          border: '1px solid #e4e4e7',
                          fontSize: 13,
                          fontFamily: 'ui-monospace, monospace',
                          color: '#15151f',
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveSecret}
                      disabled={savingSecret || !webhookSecret.trim()}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 10,
                        border: 'none',
                        background: '#5b3df0',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: savingSecret || !webhookSecret.trim() ? 'not-allowed' : 'pointer',
                        opacity: savingSecret || !webhookSecret.trim() ? 0.5 : 1,
                      }}
                    >
                      {savingSecret ? 'Saving…' : 'Save webhook secret'}
                    </button>
                  </>
                )}
              </div>
            )}

          {funnelState !== 'inactive' &&
            consultationDelivery === 'own_website' &&
            consultationPaymentMethod === 'embedded_alternative_payment' && (
              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase' }}>
                    Consultation confirmation pixel
                  </span>
                  <CopyButton text={consultPixel} />
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
                  {consultPixel}
                </pre>
              </div>
            )}

          {funnelState !== 'inactive' && archC && needsRedirect && (
            <div style={card}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <Info size={14} style={{ color: '#5b3df0', flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: 12, color: '#3f3f46', margin: 0, lineHeight: 1.5 }}>
                  {archC.limitationMessage}
                </p>
              </div>
              {trackedUrl ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', fontSize: 11, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
                    {trackedUrl}
                  </div>
                  <CopyButton text={trackedUrl} />
                </div>
              ) : (
                <p style={{ fontSize: 12, color: '#71717a', margin: 0 }}>
                  {archC.redirectUrl ? 'Generating tracked link…' : 'No redirect URL available yet.'}
                </p>
              )}
              {archC.showConfirmationPixel && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase' }}>
                      Confirmation pixel
                    </span>
                    <CopyButton text={confirmedPixel} />
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
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      lineHeight: 1.45,
                    }}
                  >
                    {confirmedPixel}
                  </pre>
                </div>
              )}
            </div>
          )}
        </>
      )}

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
          {notEnabled ? 'Skip →' : 'Done →'}
        </button>
      </div>
    </div>
  );
}