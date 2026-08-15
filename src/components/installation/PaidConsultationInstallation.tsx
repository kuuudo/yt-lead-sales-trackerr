import React from 'react';
import { CreditCard, Info, XCircle } from 'lucide-react';
import type { CampaignExtended, FunnelState, TrackingState, StripeConfig } from './installationHelpers';
import { FunnelHeader } from './FunnelHeader';
import { StripeSetupBlock } from './StripeSetupBlock';
import { PixelBlock } from './PixelBlock';
import { RedirectTrackingBlock } from './RedirectTrackingBlock';

type ConsultationArchCStrategy = {
  redirectUrl: string | null;
  linkType: string;
  eventLabel: string;
  limitationMessage: string;
  showConfirmationPixel: boolean;
};

const resolveConsultationArchCRedirect = (
  campaign: CampaignExtended,
  consultationDelivery: string,
  consultationPaymentMethod: string
): ConsultationArchCStrategy => {
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
          'This tracks when a visitor clicks through to your booking platform — intent only, not a confirmed booking. ' +
          'To enable confirmation tracking, paste the tracked link into your platform\'s "redirect after booking" or ' +
          '"success URL" setting and add a thank-you page URL in your campaign settings.',
        showConfirmationPixel: false,
      };
    }
    if (thankyouUrl) {
      return {
        redirectUrl: thankyouUrl,
        linkType: 'external_platform_redirected',
        eventLabel: 'Booking',
        limitationMessage:
          'No booking URL configured. Using your thank-you page as the redirect target — ' +
          'paste this tracked link into your platform\'s "redirect after booking" or "success URL" setting.',
        showConfirmationPixel: false,
      };
    }
    return {
      redirectUrl: null,
      linkType: 'external_platform_redirected',
      eventLabel: 'Booking',
      limitationMessage:
        'No booking URL or thank-you page URL configured. Add a booking URL to generate a tracked redirect link.',
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
          'Replace your payment button URL with the tracked link above — this records intent when a visitor clicks through to pay. ' +
          'It does not confirm payment was completed. ' +
          (thankyouUrl
            ? 'A confirmation pixel is provided below — paste it on your thank-you page to track completed payments.'
            : 'If your payment platform supports a "success redirect", add your thank-you page URL in campaign settings to unlock confirmation tracking.'),
        showConfirmationPixel: !!thankyouUrl,
      };
    }
    if (thankyouUrl) {
      return {
        redirectUrl: thankyouUrl,
        linkType: 'checkout_opened',
        eventLabel: 'Payment',
        limitationMessage:
          'No checkout URL configured — using your thank-you page as the redirect target. ' +
          'If your payment platform supports a "success redirect", paste this tracked link there. ' +
          'A confirmation pixel is also provided below.',
        showConfirmationPixel: true,
      };
    }
    return {
      redirectUrl: null,
      linkType: 'checkout_opened',
      eventLabel: 'Payment',
      limitationMessage:
        'No checkout URL or thank-you page URL configured. ' +
        'Add a checkout URL to generate a tracked redirect, or add a thank-you page URL to enable confirmation tracking.',
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
          'Replace the link to your payment instruction page with the tracked link above — ' +
          'this records when a visitor reaches your payment instructions, not that payment was completed. ' +
          (thankyouUrl
            ? 'A confirmation pixel is provided below — paste it on your thank-you page if your platform supports a success redirect.'
            : 'Confirmation tracking is not available for manual payment flows unless your platform supports a success redirect URL. ' +
              'Add a thank-you page URL in your campaign settings if so.'),
        showConfirmationPixel: !!thankyouUrl,
      };
    }
    if (thankyouUrl) {
      return {
        redirectUrl: thankyouUrl,
        linkType: 'payment_instruction_viewed',
        eventLabel: 'Payment Page',
        limitationMessage:
          'No instruction page URL configured — using your thank-you page as the redirect target. ' +
          'A confirmation pixel is also provided below.',
        showConfirmationPixel: true,
      };
    }
    return {
      redirectUrl: null,
      linkType: 'payment_instruction_viewed',
      eventLabel: 'Payment Page',
      limitationMessage:
        'No payment instruction page URL or thank-you page URL configured. ' +
        'Add a checkout / instruction page URL to generate a tracked redirect.',
      showConfirmationPixel: false,
    };
  }

  return {
    redirectUrl: checkoutUrl,
    linkType: 'consultation',
    eventLabel: 'Payment',
    limitationMessage:
      'Without direct integration, we track visitor intent only. ' +
      'For the best attribution accuracy, embed external tools on your own website.',
    showConfirmationPixel: false,
  };
};

export const PaidConsultationInstallation = ({
  campaign,
  stripeConfig,
  userId,
  funnelState,
  trackingState,
  consultationDelivery,
  consultationPaymentMethod,
  onRefresh,
}: {
  campaign: CampaignExtended;
  stripeConfig: StripeConfig | null;
  userId: string;
  funnelState: FunnelState;
  trackingState: TrackingState;
  consultationDelivery: string;
  consultationPaymentMethod: string;
  onRefresh: () => void;
}) => {
  if (!campaign.has_paid_consultation) return null;

  return (
    <div className="space-y-4 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800">
      <FunnelHeader
        icon={<CreditCard size={14} />}
        title="Paid Consultation Funnel"
        funnelState={funnelState}
        trackingState={trackingState}
      />

      {funnelState === 'inactive' ? (
        <div className="flex gap-3 p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
          <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            No consultation booking URL detected. Add one to your campaign settings.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
              Delivery:
            </span>
            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
              {consultationDelivery === 'own_website' ? 'Own Website' : 'External Platform'}
            </span>
          </div>

          {consultationDelivery === 'external_platform' &&
            (() => {
              const archC = resolveConsultationArchCRedirect(
                campaign,
                consultationDelivery,
                consultationPaymentMethod
              );
              return archC.redirectUrl ? (
                <RedirectTrackingBlock
                  campaignId={campaign.id}
                  destinationUrl={archC.redirectUrl}
                  linkType={archC.linkType}
                  eventLabel={archC.eventLabel}
                  limitationMessage={archC.limitationMessage}
                />
              ) : (
                <div className="flex gap-3 p-3.5 bg-zinc-800/40 border border-zinc-700/50 rounded-xl">
                  <Info size={12} className="text-zinc-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    {archC.limitationMessage}
                  </p>
                </div>
              );
            })()}

          {consultationDelivery === 'own_website' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                  Payment Method:
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
                  {consultationPaymentMethod === 'stripe_checkout'
                    ? 'Stripe Checkout Page'
                    : consultationPaymentMethod === 'stripe_embedded'
                      ? 'Stripe Embedded Checkout'
                      : consultationPaymentMethod === 'embedded_alternative_payment'
                        ? 'Embedded Alternative Payment'
                        : consultationPaymentMethod === 'alternative_payment'
                          ? 'Alternative Payment Method'
                          : 'Payment Instructions Page'}
                </span>
              </div>

              {consultationPaymentMethod === 'stripe_checkout' && (
                <StripeSetupBlock
                  userId={userId}
                  stripeConfig={stripeConfig}
                  checkoutUrl={campaign.paid_consultation_checkout_url}
                  campaignId={campaign.id}
                  linkType="consultation"
                  onSecretSaved={onRefresh}
                />
              )}

              {consultationPaymentMethod === 'stripe_embedded' && (
                <StripeSetupBlock
                  userId={userId}
                  stripeConfig={stripeConfig}
                  checkoutUrl={null}
                  campaignId={campaign.id}
                  linkType="consultation"
                  onSecretSaved={onRefresh}
                />
              )}

              {consultationPaymentMethod === 'embedded_alternative_payment' && (
                <PixelBlock
                  campaignId={campaign.id}
                  eventType="consultation"
                  amount={campaign.consultation_fee ?? null}
                  thankyouUrl={campaign.consultation_thankyou_url}
                  pendingMessage="No consultation confirmation page URL detected yet. Add one in your campaign settings."
                  activeInstruction="✅ Confirmation page detected. Paste this pixel on your consultation thank-you page to track completed payments."
                />
              )}

              {consultationPaymentMethod === 'alternative_payment' &&
                (() => {
                  const archC = resolveConsultationArchCRedirect(
                    campaign,
                    consultationDelivery,
                    consultationPaymentMethod
                  );
                  return (
                    <div className="space-y-3">
                      {archC.redirectUrl ? (
                        <RedirectTrackingBlock
                          campaignId={campaign.id}
                          destinationUrl={archC.redirectUrl}
                          linkType={archC.linkType}
                          eventLabel={archC.eventLabel}
                          limitationMessage={archC.limitationMessage}
                        />
                      ) : (
                        <div className="flex gap-3 p-3.5 bg-zinc-800/40 border border-zinc-700/50 rounded-xl">
                          <Info size={12} className="text-zinc-500 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-zinc-500 leading-relaxed">
                            {archC.limitationMessage}
                          </p>
                        </div>
                      )}
                      {archC.showConfirmationPixel && (
                        <PixelBlock
                          campaignId={campaign.id}
                          eventType="consultation_confirmed"
                          amount={campaign.consultation_fee ?? null}
                          thankyouUrl={campaign.consultation_thankyou_url}
                          pendingMessage="Thank-you page URL detected but pixel not yet placed."
                          activeInstruction="✅ Paste this pixel on your payment thank-you page to track confirmed consultations."
                        />
                      )}
                    </div>
                  );
                })()}

              {consultationPaymentMethod === 'payment_instructions_page' &&
                (() => {
                  const archC = resolveConsultationArchCRedirect(
                    campaign,
                    consultationDelivery,
                    consultationPaymentMethod
                  );
                  return (
                    <div className="space-y-3">
                      {archC.redirectUrl ? (
                        <RedirectTrackingBlock
                          campaignId={campaign.id}
                          destinationUrl={archC.redirectUrl}
                          linkType={archC.linkType}
                          eventLabel={archC.eventLabel}
                          limitationMessage={archC.limitationMessage}
                        />
                      ) : (
                        <div className="flex gap-3 p-3.5 bg-zinc-800/40 border border-zinc-700/50 rounded-xl">
                          <Info size={12} className="text-zinc-500 shrink-0 mt-0.5" />
                          <p className="text-[11px] text-zinc-500 leading-relaxed">
                            {archC.limitationMessage}
                          </p>
                        </div>
                      )}
                      {archC.showConfirmationPixel && (
                        <PixelBlock
                          campaignId={campaign.id}
                          eventType="consultation_confirmed"
                          amount={campaign.consultation_fee ?? null}
                          thankyouUrl={campaign.consultation_thankyou_url}
                          pendingMessage="Thank-you page URL detected but pixel not yet placed."
                          activeInstruction="✅ Paste this pixel on your payment thank-you page to track confirmed consultations."
                        />
                      )}
                    </div>
                  );
                })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};