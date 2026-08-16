import React, { useEffect, useState } from 'react';
import { CreditCard, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useEffectiveIdentity } from '../../../lib/useEffectiveIdentity';
import {
  type CampaignExtended,
  type StripeConfig,
  getFunnelState,
  getTrackingState,
} from '../../installation/installationHelpers';
import { PaidConsultationInstallation } from '../../installation/PaidConsultationInstallation';

/**
 * Installation Onboarding — Paid Consultation path.
 * Reuses PaidConsultationInstallation. No new tracking logic.
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
  const [campaign, setCampaign] = useState<CampaignExtended | null>(null);
  const [stripeConfig, setStripeConfig] = useState<StripeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div
        style={{
          padding: 40,
          display: 'flex',
          justifyContent: 'center',
          background: '#fff',
          minHeight: 200,
        }}
      >
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
            <button type="button" onClick={onBack} style={{ padding: '10px 16px', cursor: 'pointer' }}>
              Back
            </button>
          </div>
        )}
      </div>
    );
  }

  const notEnabled = !campaign.has_paid_consultation;
  const consultationDelivery: string = campaign.consultation_delivery ?? 'external_platform';
  const consultationPaymentMethod: string =
    campaign.consultation_payment_method ??
    (campaign.uses_stripe_consultation ? 'stripe_checkout' : 'alternative_payment');
  const funnelState = getFunnelState(campaign, 'consultation');
  const trackingState = getTrackingState(campaign, 'consultation', stripeConfig);

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '24px 20px 20px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
        background: '#fff',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <CreditCard size={18} style={{ color: '#6b6b78' }} />
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#15151f', margin: 0 }}>
          Paid Consultation Installation
        </h2>
      </div>
      <p style={{ fontSize: 12, color: '#6b6b78', margin: '0 0 16px', lineHeight: 1.5 }}>
        {notEnabled
          ? 'Paid Consultation is not enabled on this campaign. Skip and set it up later from the hub if you want.'
          : 'Install consultation tracking below, then finish.'}
      </p>

      {!notEnabled && (
        <PaidConsultationInstallation
          campaign={campaign}
          stripeConfig={stripeConfig}
          userId={userId}
          funnelState={funnelState}
          trackingState={trackingState}
          consultationDelivery={consultationDelivery}
          consultationPaymentMethod={consultationPaymentMethod}
          onRefresh={load}
        />
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