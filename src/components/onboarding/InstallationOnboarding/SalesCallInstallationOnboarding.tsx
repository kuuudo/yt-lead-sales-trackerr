import React, { useEffect, useState } from 'react';
import { Loader2, Phone } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import {
  type CampaignExtended,
  getFunnelState,
  getTrackingState,
  computeExpectedCallValue,
} from '../../installation/installationHelpers';
import { SalesCallInstallation } from '../../installation/SalesCallInstallation';

/**
 * Installation Onboarding — Sales Call path.
 * Reuses SalesCallInstallation. No new tracking logic.
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
  const [campaign, setCampaign] = useState<CampaignExtended | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      <div
        style={{
          padding: 40,
          display: 'flex',
          justifyContent: 'center',
          background: '#0a0a0b',
          minHeight: 200,
        }}
      >
        <Loader2 className="animate-spin" size={28} style={{ color: '#5b3df0' }} />
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div style={{ padding: 28, background: '#0a0a0b', color: '#fca5a5', fontSize: 13 }}>
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

  const funnelState = getFunnelState(campaign, 'salesCall');
  const trackingState = getTrackingState(campaign, 'salesCall', null);
  const salesCallDelivery: string = campaign.sales_call_delivery ?? 'external_platform';
  const expectedCallValue = computeExpectedCallValue(campaign);
  const notEnabled = !campaign.has_sales_call;

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
        <Phone size={18} style={{ color: '#a1a1aa' }} />
        <h2 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: 0 }}>
          Sales Call Installation
        </h2>
      </div>
      <p style={{ fontSize: 12, color: '#71717a', margin: '0 0 16px', lineHeight: 1.5 }}>
        {notEnabled
          ? 'Sales Call is not enabled on this campaign. Skip and set it up later from the hub if you want.'
          : 'Install booking tracking below, then continue.'}
      </p>

      {!notEnabled && (
        <SalesCallInstallation
          campaign={campaign}
          funnelState={funnelState}
          trackingState={trackingState}
          salesCallDelivery={salesCallDelivery}
          expectedCallValue={expectedCallValue}
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
          {notEnabled ? 'Skip →' : 'Next →'}
        </button>
      </div>
    </div>
  );
}