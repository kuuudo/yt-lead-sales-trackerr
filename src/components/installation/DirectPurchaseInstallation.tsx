import React from 'react';
import { AlertCircle, ShoppingCart, XCircle } from 'lucide-react';
import type { CampaignExtended, FunnelState, TrackingState, StripeConfig } from './installationHelpers';
import { FunnelHeader } from './FunnelHeader';
import { StripeSetupBlock } from './StripeSetupBlock';
import { CheckoutIntentBlock } from './CheckoutIntentBlock';
import { PixelBlock } from './PixelBlock';
import { RedirectTrackingBlock } from './RedirectTrackingBlock';

export const DirectPurchaseInstallation = ({
  campaign,
  stripeConfig,
  userId,
  funnelState,
  trackingState,
  purchaseMethod,
  onRefresh,
}: {
  campaign: CampaignExtended;
  stripeConfig: StripeConfig | null;
  userId: string;
  funnelState: FunnelState;
  trackingState: TrackingState;
  purchaseMethod: string;
  onRefresh: () => void;
}) => {
  return (
    <div className="space-y-4 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800">
      <FunnelHeader
        icon={<ShoppingCart size={14} />}
        title="Direct Purchase Funnel"
        funnelState={funnelState}
        trackingState={trackingState}
      />

      {funnelState === 'inactive' && (
        <div className="flex gap-3 p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
          <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            {!campaign.landing_page_url
              ? 'No landing page URL detected. Add one in your campaign settings to activate this funnel.'
              : 'Funnel inactive.'}
          </p>
        </div>
      )}

      {funnelState === 'partial' && (
        <div className="flex gap-3 p-3 bg-orange-500/5 border border-orange-500/15 rounded-xl">
          <AlertCircle size={13} className="text-orange-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Landing page detected, but no checkout URL found yet. Add a checkout URL to your
            campaign.
          </p>
        </div>
      )}

      {funnelState === 'active' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
              Payment Method:
            </span>
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
              {purchaseMethod === 'stripe_checkout'
                ? 'Stripe Checkout'
                : purchaseMethod === 'stripe_embedded'
                  ? 'Stripe Embedded Checkout'
                  : purchaseMethod === 'embedded_alternative_payment'
                    ? 'Embedded Alternative Payment'
                    : purchaseMethod === 'alternative_payment'
                      ? 'Alternative Payment Method'
                      : purchaseMethod === 'external_platform'
                        ? 'External Platform'
                        : 'Payment Instructions Page'}
            </span>
          </div>

          {purchaseMethod === 'stripe_checkout' && (
            <StripeSetupBlock
              userId={userId}
              stripeConfig={stripeConfig}
              checkoutUrl={campaign.checkout_url}
              campaignId={campaign.id}
              linkType="checkout"
              onSecretSaved={onRefresh}
            />
          )}

          {purchaseMethod === 'stripe_embedded' && (
            <div className="space-y-3">
              <StripeSetupBlock
                userId={userId}
                stripeConfig={stripeConfig}
                checkoutUrl={null}
                campaignId={campaign.id}
                linkType="checkout"
                onSecretSaved={onRefresh}
              />
              <CheckoutIntentBlock
                campaignId={campaign.id}
                checkoutUrl={campaign.checkout_url}
                hasThankYouUrl={!!campaign.purchase_thankyou_url}
              />
              <PixelBlock
                campaignId={campaign.id}
                eventType="purchase"
                amount={campaign.offer_price ?? null}
                thankyouUrl={campaign.purchase_thankyou_url}
                pendingMessage="No thank-you page URL detected yet."
                activeInstruction={`✅ Paste this on your purchase confirmation page to track confirmed orders.`}
              />
            </div>
          )}

          {purchaseMethod === 'alternative_payment' && (
            <RedirectTrackingBlock
              campaignId={campaign.id}
              destinationUrl={campaign.checkout_url}
              linkType="checkout"
              eventLabel="Checkout"
              limitationMessage="Without direct integration, we track visitor intent. For the best attribution accuracy, we recommend using your own website and embedding external tools inside your pages so VS-Track can track the full customer journey."
            />
          )}

          {purchaseMethod === 'payment_instructions_page' && (
            <RedirectTrackingBlock
              campaignId={campaign.id}
              destinationUrl={campaign.checkout_url}
              linkType="checkout"
              eventLabel="Payment Page"
              limitationMessage="Without direct integration, we track visitor intent. For the best attribution accuracy, we recommend using your own website and embedding external tools inside your pages so VS-Track can track the full customer journey."
            />
          )}

          {purchaseMethod === 'embedded_alternative_payment' && (
            <PixelBlock
              campaignId={campaign.id}
              eventType="purchase"
              amount={campaign.offer_price ?? null}
              thankyouUrl={campaign.purchase_thankyou_url}
              pendingMessage="No thank-you page URL detected yet. Add one in your campaign settings."
              activeInstruction="✅ Confirmation page detected. Paste this pixel on your purchase thank-you page to track completed orders."
            />
          )}

          {purchaseMethod === 'external_platform' && (
            <RedirectTrackingBlock
              campaignId={campaign.id}
              destinationUrl={campaign.checkout_url}
              linkType="checkout"
              eventLabel="Checkout"
              limitationMessage="This funnel routes through an external platform. Without direct integration, we track visitor intent only. For full-funnel confirmation tracking, we recommend hosting your checkout on your own website and embedding the payment tool there."
            />
          )}
        </div>
      )}
    </div>
  );
};