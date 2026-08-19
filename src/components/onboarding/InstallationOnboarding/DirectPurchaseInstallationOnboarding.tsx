import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Key,
  Loader2,
  ShoppingCart,
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

function generateToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Installation Onboarding — Direct Purchase (GlobalAttribution-style white UI).
 * Tracking logic reused from helpers / Stripe / redirect_links — no redesign.
 */
export default function DirectPurchaseInstallationOnboarding({
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
  isPixelSetupComplete(campaignId, 'purchase')
);

  const handleToggleComplete = () => {
  const next = !completed;
  setPixelSetupComplete(campaignId, 'purchase', next);
  setCompleted(next);
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

  const purchaseMethod: string =
    campaign?.purchase_method ??
    (campaign?.uses_stripe ? 'stripe_checkout' : 'alternative_payment');

  const needsTrackedCheckout =
    purchaseMethod === 'stripe_checkout' ||
    purchaseMethod === 'alternative_payment' ||
    purchaseMethod === 'payment_instructions_page' ||
    purchaseMethod === 'external_platform';

  useEffect(() => {
    if (!campaign || !needsTrackedCheckout || !campaign.checkout_url) {
      setTrackedUrl(null);
      return;
    }
    const checkoutUrl = campaign.checkout_url;
    const sync = async () => {
      const { data: existing } = await supabase
        .from('redirect_links')
        .select('token, destination_url')
        .eq('campaign_id', campaign.id)
        .eq('link_type', 'checkout')
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
          link_type: 'checkout',
          destination_url: checkoutUrl,
          video_id: null,
        });
        if (!insErr) setTrackedUrl(`${window.location.origin}/${token}`);
      } else if (existing.destination_url !== checkoutUrl) {
        await supabase
          .from('redirect_links')
          .update({ destination_url: checkoutUrl })
          .eq('campaign_id', campaign.id)
          .eq('link_type', 'checkout')
          .is('video_id', null);
        setTrackedUrl(`${window.location.origin}/${existing.token}`);
      } else {
        setTrackedUrl(`${window.location.origin}/${existing.token}`);
      }
    };
    sync();
  }, [campaign?.id, campaign?.checkout_url, needsTrackedCheckout, isReadOnly]);

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
      <div style={{ padding: 28, background: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif' }}>
        <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error || 'Campaign not found'}</p>
        {onBack && (
          <button type="button" onClick={onBack} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #d9d9e3', background: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            Back
          </button>
        )}
      </div>
    );
  }

  const funnelState = getFunnelState(campaign, 'purchase');
  const trackingState = getTrackingState(campaign, 'purchase', stripeConfig);
  const isConnected = !!(stripeConfig?.stripe_webhook_secret);
  const maskSecret = (s: string) => s.slice(0, 8) + '••••••••••••' + s.slice(-4);

  const methodLabel =
    purchaseMethod === 'stripe_checkout'
      ? 'Stripe Checkout'
      : purchaseMethod === 'stripe_embedded'
        ? 'Stripe Embedded Checkout'
        : purchaseMethod === 'embedded_alternative_payment'
          ? 'Embedded Alternative Payment'
          : purchaseMethod === 'alternative_payment'
            ? 'Alternative Payment Method'
            : purchaseMethod === 'external_platform'
              ? 'External Platform'
              : 'Payment Instructions Page';

  const purchasePixel = generateAttributionPixel(campaign.id, 'purchase', campaign.offer_price ?? null);
  const intentPixel = generateAttributionPixel(campaign.id, 'checkout_intent', 0);

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
        <ShoppingCart size={18} style={{ color: '#5b3df0' }} />
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#15151f', margin: 0 }}>
          Direct Purchase Installation
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
        Funnel: {funnelState} · Tracking: {trackingState} · {methodLabel}
      </p>

      {funnelState === 'inactive' && (
        <div style={{ display: 'flex', gap: 12, padding: 14, borderRadius: 12, border: '1px solid #fecaca', background: '#fef2f2', marginBottom: 16 }}>
          <AlertCircle size={14} style={{ color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13, color: '#3f3f46', margin: 0, lineHeight: 1.5 }}>
            {!campaign.landing_page_url
              ? 'No landing page URL yet. Add one in campaign settings, then come back.'
              : 'Funnel inactive. Check campaign settings.'}
          </p>
        </div>
      )}

      {funnelState === 'partial' && (
        <div style={{ display: 'flex', gap: 12, padding: 14, borderRadius: 12, border: '1px solid #fed7aa', background: '#fff7ed', marginBottom: 16 }}>
          <AlertCircle size={14} style={{ color: '#ea580c', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13, color: '#3f3f46', margin: 0, lineHeight: 1.5 }}>
            Landing page found, but no checkout URL yet. Add a checkout URL in campaign settings.
          </p>
        </div>
      )}

      {funnelState === 'active' && (
        <>
          {/* Stripe checkout / embedded — webhook */}
          {(purchaseMethod === 'stripe_checkout' || purchaseMethod === 'stripe_embedded') && (
            <div style={{ ...card, border: '1px solid #ddd6fe', background: '#f5f3ff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#5b21b6', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <Webhook size={14} /> Stripe Webhook
                </span>
                <span style={{ fontSize: 11, fontWeight: 800, color: isConnected ? '#16a34a' : '#ea580c' }}>
                  {isConnected ? 'Connected' : 'Not connected'}
                </span>
              </div>

              {purchaseMethod === 'stripe_checkout' && (
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#15151f', margin: '0 0 6px' }}>1. Your tracked checkout link</p>
                  <p style={{ fontSize: 12, color: '#6b6b78', margin: '0 0 8px', lineHeight: 1.45 }}>
                    Use this as your Buy Now button — routes through VS-Track.
                  </p>
                  {trackedUrl ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#52525b', wordBreak: 'break-all' }}>
                        {trackedUrl}
                      </div>
                      <CopyButton text={trackedUrl} />
                    </div>
                  ) : (
                    <p style={{ fontSize: 12, color: '#71717a', margin: 0 }}>Generating tracked link…</p>
                  )}
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#15151f', margin: '0 0 6px' }}>
                  {purchaseMethod === 'stripe_checkout' ? '2' : '1'}. Webhook endpoint
                </p>
                <p style={{ fontSize: 12, color: '#6b6b78', margin: '0 0 8px', lineHeight: 1.45 }}>
                  Stripe → Developers → Webhooks → Add endpoint. Event:{' '}
                  <code style={{ color: '#5b3df0' }}>checkout.session.completed</code>
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#52525b', wordBreak: 'break-all' }}>
                    {WEBHOOK_ENDPOINT}
                  </div>
                  <CopyButton text={WEBHOOK_ENDPOINT} />
                </div>
              </div>

              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#15151f', margin: '0 0 6px' }}>
                  {purchaseMethod === 'stripe_checkout' ? '3' : '2'}. Signing secret
                </p>
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
                        placeholder="whsec_••••••••••••"
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
            </div>
          )}

          {/* stripe_embedded — optional intent + confirmation pixel */}
          {purchaseMethod === 'stripe_embedded' && (
            <>
              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#5b3df0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Optional: Checkout intent pixel
                  </span>
                  <CopyButton text={intentPixel} />
                </div>
                <p style={{ fontSize: 12, color: '#6b6b78', margin: '0 0 8px', lineHeight: 1.45 }}>
                  Paste on the checkout page if you want mid-funnel intent (not payment confirmation).
                </p>
                <pre style={{ margin: 0, padding: 12, borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#52525b', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.45 }}>
                  {intentPixel}
                </pre>
              </div>
              <div style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Purchase confirmation pixel
                  </span>
                  <CopyButton text={purchasePixel} />
                </div>
                <p style={{ fontSize: 12, color: '#6b6b78', margin: '0 0 8px', lineHeight: 1.45 }}>
                  {campaign.purchase_thankyou_url
                    ? 'Paste on your purchase thank-you page.'
                    : 'No thank-you URL yet — pixel is ready; add a thank-you page when you can.'}
                </p>
                <pre style={{ margin: 0, padding: 12, borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#52525b', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.45 }}>
                  {purchasePixel}
                </pre>
              </div>
            </>
          )}

          {/* Redirect methods */}
          {(purchaseMethod === 'alternative_payment' ||
            purchaseMethod === 'payment_instructions_page' ||
            purchaseMethod === 'external_platform') && (
            <div style={card}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                <Info size={14} style={{ color: '#5b3df0', flexShrink: 0, marginTop: 2 }} />
                <p style={{ fontSize: 12, color: '#3f3f46', margin: 0, lineHeight: 1.5 }}>
                  Without direct integration we track visitor intent. Use the tracked link below as
                  your checkout / payment button.
                </p>
              </div>
              {trackedUrl ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#52525b', wordBreak: 'break-all' }}>
                    {trackedUrl}
                  </div>
                  <CopyButton text={trackedUrl} />
                </div>
              ) : (
                <p style={{ fontSize: 12, color: '#71717a', margin: 0 }}>
                  {campaign.checkout_url ? 'Generating tracked link…' : 'Add a checkout URL in campaign settings first.'}
                </p>
              )}
            </div>
          )}

          {/* Embedded alternative — pixel only */}
          {purchaseMethod === 'embedded_alternative_payment' && (
            <div style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Purchase confirmation pixel
                </span>
                <CopyButton text={purchasePixel} />
              </div>
              <p style={{ fontSize: 12, color: '#6b6b78', margin: '0 0 8px', lineHeight: 1.45 }}>
                Paste on your purchase thank-you page.
              </p>
              <pre style={{ margin: 0, padding: 12, borderRadius: 10, border: '1px solid #e4e4e7', background: '#fff', fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#52525b', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.45 }}>
                {purchasePixel}
              </pre>
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
          Next →
        </button>
      </div>
    </div>
  );
}