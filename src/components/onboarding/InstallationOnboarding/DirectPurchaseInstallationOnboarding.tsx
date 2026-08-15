import React, { useEffect, useState } from 'react';
import { Loader2, ShoppingCart } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useEffectiveIdentity } from '../../../lib/useEffectiveIdentity';
import {
  type CampaignExtended,
  type StripeConfig,
  getFunnelState,
  getTrackingState,
} from '../../installation/installationHelpers';
import { DirectPurchaseInstallation } from '../../installation/DirectPurchaseInstallation';

/**
 * Installation Onboarding — Direct Purchase path.
 * Reuses DirectPurchaseInstallation (page logic). No new tracking system.
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
          alignItems: 'center',
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
      <div style={{ padding: 28, background: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif' }}>
        <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>
          {error || 'Campaign not found'}
        </p>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: '1px solid #d9d9e3',
              background: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Back
          </button>
        )}
      </div>
    );
  }

  const purchaseMethod: string =
    campaign.purchase_method ??
    (campaign.uses_stripe ? 'stripe_checkout' : 'alternative_payment');

  const funnelState = getFunnelState(campaign, 'purchase');
  const trackingState = getTrackingState(campaign, 'purchase', stripeConfig);

  return (
    <div
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '24px 20px 20px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
        background: '#0a0a0b',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <ShoppingCart size={18} style={{ color: '#a1a1aa' }} />
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>
          Direct Purchase Installation
        </h2>
      </div>
      <p style={{ fontSize: 12, color: '#71717a', margin: '0 0 16px', lineHeight: 1.5 }}>
        Install tracking for the main offer you just set up. Copy links / pixels below, then
        continue.
      </p>

      <DirectPurchaseInstallation
        campaign={campaign}
        stripeConfig={stripeConfig}
        userId={userId}
        funnelState={funnelState}
        trackingState={trackingState}
        purchaseMethod={purchaseMethod}
        onRefresh={load}
      />

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 8,
              border: '1px solid #3f3f46',
              background: '#18181b',
              color: '#e4e4e7',
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