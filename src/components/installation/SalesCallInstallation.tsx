import React from 'react';
import { Phone, XCircle } from 'lucide-react';
import type { CampaignExtended, FunnelState, TrackingState } from './installationHelpers';
import { FunnelHeader } from './FunnelHeader';
import { PixelBlock } from './PixelBlock';
import { CheckoutIntentBlock } from './CheckoutIntentBlock';
import { RedirectTrackingBlock } from './RedirectTrackingBlock';

export const SalesCallInstallation = ({
  campaign,
  funnelState,
  trackingState,
  salesCallDelivery,
  expectedCallValue,
}: {
  campaign: CampaignExtended;
  funnelState: FunnelState;
  trackingState: TrackingState;
  salesCallDelivery: string;
  expectedCallValue: number;
}) => {
  if (!campaign.has_sales_call) return null;

  return (
    <div className="space-y-4 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800">
      <FunnelHeader
        icon={<Phone size={14} />}
        title="Sales Call Funnel"
        funnelState={funnelState}
        trackingState={trackingState}
      />

      {funnelState === 'inactive' ? (
        <div className="flex gap-3 p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
          <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            No sales call booking URL detected. Add one to your campaign settings.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
              Delivery:
            </span>
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
              {salesCallDelivery === 'embedded_own_website'
                ? 'Embedded on Own Website'
                : 'External Platform'}
            </span>
          </div>

          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Expected revenue per booked call:{' '}
            <span className="text-zinc-300 font-bold">${expectedCallValue}</span>
            <span className="text-zinc-600">
              {' '}
              (${campaign.offer_price ?? 0} × {campaign.estimated_close_rate ?? 0}% close
              rate)
            </span>
            {(campaign.average_upsell_value ?? 0) > 0 && (
              <span className="text-zinc-600">
                {' '}
                + ${campaign.average_upsell_value} avg upsell
              </span>
            )}
          </p>

          {salesCallDelivery === 'embedded_own_website' && (
            <div className="space-y-3">
              <CheckoutIntentBlock
                campaignId={campaign.id}
                checkoutUrl={campaign.sales_call_booking_url}
                hasThankYouUrl={!!campaign.sales_call_thankyou_url}
              />
              <PixelBlock
                campaignId={campaign.id}
                eventType="sales_call"
                amount={null}
                thankyouUrl={campaign.sales_call_thankyou_url}
                pendingMessage="No booking confirmation page URL detected yet."
                activeInstruction="✅ Confirmation page detected. Paste this code on your booking confirmation page."
              />
            </div>
          )}

          {salesCallDelivery === 'external_platform' && (
            <RedirectTrackingBlock
              campaignId={campaign.id}
              destinationUrl={campaign.sales_call_booking_url}
              linkType="sales_call"
              eventLabel="Booking"
              limitationMessage="This tracks when a visitor clicks through to your booking platform — intent only, not a confirmed booking. For best results, use your platform's success redirect URL and add a thank-you page in campaign settings."
            />
          )}
        </div>
      )}
    </div>
  );
};