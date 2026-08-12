// ─────────────────────────────────────────────────────────────────────────
// components/onboarding/campaignOptionContent.ts
// ─────────────────────────────────────────────────────────────────────────
// Pure content/data — no JSX. Plain-language copy + tracking/installation
// mapping for every option the Campaign Onboarding wizard can present.
//
// Every value here (option keys, tracking quality, installation block name)
// is verified directly against:
//   - pages/Campaigns.tsx      (the <select> option values + required fields)
//   - pages/Installation.tsx   (getFunnelState / getTrackingState + the
//                                per-purchaseMethod blocks around line 1360+)
// Nothing here is invented. If VSTRK's real behavior changes, update this
// file — the wizard just renders whatever is here.
// ─────────────────────────────────────────────────────────────────────────

export type PurchaseMethod =
  | 'stripe_checkout'
  | 'stripe_embedded'
  | 'embedded_alternative_payment'
  | 'alternative_payment'
  | 'payment_instructions_page'
  | 'external_platform';

export type TrackingQuality = 'Full' | 'Partial';

export interface PaymentOptionContent {
  value: PurchaseMethod;
  label: string;
  /** Plain-language, no jargon — what the user actually sees. */
  whatTheyExperience: string;
  /** Short flow diagram, rendered as simple boxes/arrows. */
  flow: string[];
  tracking: TrackingQuality;
  trackingNote: string;
  /** Which Installation.tsx block the user lands on for this choice. */
  installationBlock: string;
  needs: string[];
}

// The 6-value vocabulary shared by Direct Purchase (purchase_method) and,
// minus 'external_platform', by Paid Consultation (consultation_payment_method).
export const PAYMENT_OPTIONS: PaymentOptionContent[] = [
  {
    value: 'stripe_checkout',
    label: 'Stripe Checkout',
    whatTheyExperience:
      'Customers click Buy and are taken to a Stripe-hosted payment page, then return to your site.',
    flow: ['Your website', 'Customer clicks Buy', 'Stripe checkout page', 'Payment', 'Back to your site'],
    tracking: 'Full',
    trackingNote: 'Confirmed automatically the moment Stripe tells us the payment succeeded.',
    installationBlock: 'Stripe Setup (webhook)',
    needs: ['Stripe account connection'],
  },
  {
    value: 'stripe_embedded',
    label: 'Stripe Embedded Checkout',
    whatTheyExperience:
      'Customers stay on your website — the card payment form appears right inside your page.',
    flow: ['Your website', 'Stripe payment form embedded inline', 'Payment', 'Thank-you page'],
    tracking: 'Full',
    trackingNote: 'Confirmed once you add a small confirmation snippet to your thank-you page.',
    installationBlock: 'Confirmation Pixel',
    needs: ['A thank-you page after payment'],
  },
  {
    value: 'embedded_alternative_payment',
    label: 'Embedded Alternative Payment',
    whatTheyExperience:
      'Customers stay on your website, paying through a widget from a provider other than Stripe (e.g. PayPal).',
    flow: ['Your website', 'Payment widget embedded inline (not Stripe)', 'Payment', 'Thank-you page'],
    tracking: 'Full',
    trackingNote: 'Confirmed once you add a confirmation snippet to your thank-you page.',
    installationBlock: 'Confirmation Pixel',
    needs: ['A thank-you page after payment'],
  },
  {
    value: 'alternative_payment',
    label: 'Alternative Payment',
    whatTheyExperience:
      'Customers leave your website to pay somewhere else that isn\u2019t Stripe (a payment link, another checkout tool).',
    flow: ['Your website', 'Customer leaves your site', 'External payment page', 'Payment'],
    tracking: 'Partial',
    trackingNote: 'We can see intent to pay, but not final confirmation — there\u2019s no page to send us a signal back.',
    installationBlock: 'Redirect Tracking (intent link)',
    needs: ['Nothing extra to install'],
  },
  {
    value: 'payment_instructions_page',
    label: 'Payment Instructions Page',
    whatTheyExperience:
      'Customers land on a page that tells them how to pay manually — a bank transfer, wire instructions, etc.',
    flow: ['Your website', 'Payment instructions page', 'Customer pays manually (off-platform)'],
    tracking: 'Partial',
    trackingNote: 'We can see they reached the instructions page, not whether they actually paid.',
    installationBlock: 'Redirect Tracking (intent link)',
    needs: ['Nothing extra to install'],
  },
  {
    value: 'external_platform',
    label: 'External Platform',
    whatTheyExperience:
      'The entire sale happens on someone else\u2019s platform — a marketplace or third-party storefront you don\u2019t control.',
    flow: ['Your website', 'Third-party platform', 'Entire transaction happens there'],
    tracking: 'Partial',
    trackingNote: 'This is the weakest signal we can get — we only know someone clicked through.',
    installationBlock: 'Redirect Tracking (intent link)',
    needs: ['Nothing extra to install'],
  },
];

export const getPaymentOption = (value: string) =>
  PAYMENT_OPTIONS.find((o) => o.value === value) ?? PAYMENT_OPTIONS[0];

// Consultation reuses the exact same vocabulary, minus External Platform —
// verified: Campaigns.tsx's consultation_payment_method <select> has no
// external_platform option.
export const CONSULTATION_PAYMENT_OPTIONS = PAYMENT_OPTIONS.filter(
  (o) => o.value !== 'external_platform'
);

export type DeliveryValue = 'embedded_own_website' | 'external_platform' | 'own_website';

export interface DeliveryOptionContent {
  value: DeliveryValue;
  label: string;
  whatTheyExperience: string;
  flow: string[];
  tracking: TrackingQuality;
  trackingNote: string;
  installationBlock: string;
}

export const SALES_CALL_DELIVERY_OPTIONS: DeliveryOptionContent[] = [
  {
    value: 'embedded_own_website',
    label: 'Embedded on Own Website',
    whatTheyExperience: 'Your booking calendar is embedded directly on your website.',
    flow: ['Your website', 'Booking calendar embedded inline', 'Call booked'],
    tracking: 'Full',
    trackingNote: 'Confirmed once you add a confirmation snippet to your booking-success page.',
    installationBlock: 'Confirmation Pixel',
  },
  {
    value: 'external_platform',
    label: 'External Platform',
    whatTheyExperience: 'You send people to Calendly, TidyCal, or another external booking page.',
    flow: ['Your website', 'External booking page', 'Call booked'],
    tracking: 'Partial',
    trackingNote: 'We can see the click through to the booking page, not the confirmed booking itself.',
    installationBlock: 'Redirect Tracking (intent link)',
  },
];

export const CONSULTATION_DELIVERY_OPTIONS: DeliveryOptionContent[] = [
  {
    value: 'own_website',
    label: 'Own Website',
    whatTheyExperience: 'People book and pay right on your website.',
    flow: ['Your website', 'Booking + payment on your site'],
    tracking: 'Full',
    trackingNote: 'Tracking quality then depends on which payment method you use below.',
    installationBlock: 'Depends on payment method chosen below',
  },
  {
    value: 'external_platform',
    label: 'External Platform',
    whatTheyExperience: 'People book and pay entirely on an external platform you don\u2019t control.',
    flow: ['Your website', 'External platform', 'Booking + payment happen there'],
    tracking: 'Partial',
    trackingNote: 'We can see the click through, not the confirmed booking or payment.',
    installationBlock: 'Redirect Tracking (intent link)',
  },
];
