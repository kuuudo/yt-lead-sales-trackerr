import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useEffectiveIdentity } from '../lib/useEffectiveIdentity';
import { useViewing } from '../lib/ViewingContext';
import { useOnboardingOverlay } from '../lib/onboarding-overlay';
import { useNavigate, Link } from 'react-router-dom';
import { generatePixelSnippet, WEBHOOK_ENDPOINT } from '../lib/tracker';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronDown, ChevronUp, Copy, Check, AlertCircle, CheckCircle2,
  XCircle, Webhook, Zap, Mail, ExternalLink, Video, RefreshCw,
  Info, Loader2, Key, ArrowRight, ShoppingCart, Phone, BookOpen,
  Newspaper, CreditCard, ChevronRight, Star, Globe, MessageSquare
} from 'lucide-react';
import { Modal } from '../components/Modal';
import type { Campaign } from '../lib/supabase';
import {
  type FunnelState,
  type TrackingState,
  type StripeConfig,
  type CampaignExtended,
  getFunnelState,
  getTrackingState,
  computeExpectedCallValue,
  generateAttributionPixel,
} from '../components/installation/installationHelpers';
import { StatusBadge } from '../components/installation/StatusBadge';
import { CopyButton } from '../components/installation/CopyButton';
import { PixelBlock } from '../components/installation/PixelBlock';
import { CheckoutIntentBlock } from '../components/installation/CheckoutIntentBlock';
import { RedirectTrackingBlock } from '../components/installation/RedirectTrackingBlock';
import { StripeSetupBlock } from '../components/installation/StripeSetupBlock';
import { FunnelHeader } from '../components/installation/FunnelHeader';
import { GlobalWebsiteTrackingSection } from '../components/installation/GlobalWebsiteTrackingSection';
import { DirectPurchaseInstallation } from '../components/installation/DirectPurchaseInstallation';
import { NewsletterInstallation } from '../components/installation/NewsletterInstallation';
import { SalesCallInstallation } from '../components/installation/SalesCallInstallation';
import { PaidConsultationInstallation } from '../components/installation/PaidConsultationInstallation';
// ─────────────────────────────────────────────
// CHECKOUT TYPE SELECTOR (legacy — kept for backward compat display only)
// ─────────────────────────────────────────────

const CHECKOUT_OPTIONS = [
  { group: 'STRIPE', options: [{ value: 'stripe_direct', label: 'Stripe Direct (Payment Link / Buy Button / Checkout)' }] },
  { group: 'BOOKING PLATFORMS', options: [
    { value: 'tidycal', label: 'TidyCal' },
    { value: 'calendly', label: 'Calendly' },
    { value: 'gohighlevel', label: 'GoHighLevel' },
  ]},
  { group: 'FUNNEL / COURSE PLATFORMS', options: [
    { value: 'kajabi', label: 'Kajabi' },
    { value: 'thrivecart', label: 'ThriveCart' },
    { value: 'typeform', label: 'Typeform' },
  ]},
  { group: 'OTHER', options: [
    { value: 'custom_redirect', label: 'Custom Redirect' },
    { value: 'other', label: 'Other' },
  ]},
];

const CheckoutTypeSelector = ({
  value,
  onChange,
  saving,
}: {
  value: string | null | undefined;
  onChange: (val: string) => void;
  saving: boolean;
}) => (
  <div className="space-y-1.5">
    <label className="label-caps">Checkout / Payment Platform</label>
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        disabled={saving}
        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:border-red-600 outline-none transition-all appearance-none pr-10 disabled:opacity-50"
      >
        <option value="" disabled>Select platform...</option>
        {CHECKOUT_OPTIONS.map(group => (
          <optgroup key={group.group} label={group.group}>
            {group.options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
      {saving
        ? <Loader2 size={14} className="absolute right-3 top-3.5 text-zinc-500 animate-spin" />
        : <ChevronDown size={14} className="absolute right-3 top-3.5 text-zinc-500 pointer-events-none" />
      }
    </div>
    {(value === 'stripe_direct') && (
      <p className="text-[10px] text-violet-400 font-bold uppercase tracking-widest flex items-center gap-1 pt-1">
        <Zap size={10} /> Stripe webhook tracking will be used
      </p>
    )}
    {value && value !== 'stripe_direct' && (
      <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest flex items-center gap-1 pt-1">
        <Zap size={10} /> Pixel tracking will be used
      </p>
    )}
  </div>
);




// ─────────────────────────────────────────────
// CONSULTATION ARCHITECTURE C — REDIRECT RESOLVER
//
// Implements the redirect priority hierarchy for Architecture C
// (alternative_payment, payment_instructions_page, external_platform).
// Returns the redirect destination, linkType (intent event name),
// and whether a confirmation pixel should also be shown.
//
// Priority:
//   1. checkout_url  → generates checkout redirect   (highest)
//   2. thankyou_url  → generates thankyou redirect   (second)
//   3. no urls       → no redirect generated         (lowest)
//
// IMPORTANT: all linkType values here are INTENT events only.
// They must never be interpreted as confirmed purchases or revenue.
// ─────────────────────────────────────────────

type ConsultationArchCStrategy = {
  // The URL to use as the redirect destination. null = no redirect.
  redirectUrl: string | null;
  // The link_type value stored in redirect_links. Determines which intent event fires.
  linkType: string;
  // Human-readable label for the redirect block header.
  eventLabel: string;
  // Installation instruction shown inside the redirect block.
  limitationMessage: string;
  // Whether to also render a confirmation PixelBlock after the redirect.
  // Only true when consultation_thankyou_url exists AND the payment method
  // can logically have a server-side or pixel confirmation.
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

  // ── external_platform ──────────────────────────────────────────────────
  // Redirect intent only. No pixel (user cannot place code on external platform).
  // Redirect priority: booking URL → thankyou URL → no redirect.
  // (booking_only = no redirect per spec; thankyou_only = thankyou redirect)
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
      // thankyou_only: generate thankyou redirect, tell user to use it as platform success redirect
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
    // booking_only with no booking URL and no thankyou URL → no redirect
    return {
      redirectUrl: null,
      linkType: 'external_platform_redirected',
      eventLabel: 'Booking',
      limitationMessage:
        'No booking URL or thank-you page URL configured. Add a booking URL to generate a tracked redirect link.',
      showConfirmationPixel: false,
    };
  }

  // ── own_website + alternative_payment ──────────────────────────────────
  // Intent: checkout_opened. Optional confirmation pixel if thankyou URL exists.
  // Priority: checkout → thankyou → no redirect.
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

  // ── own_website + payment_instructions_page ────────────────────────────
  // Intent: payment_instruction_viewed. Optional confirmation pixel if thankyou URL exists.
  // Priority: checkout (instruction page URL) → thankyou → no redirect.
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

  // ── Fallback: should not be reached for Architecture C ─────────────────
  // Preserves existing behavior for any unrecognised payment method value
  // already stored in the database, rather than breaking silently.
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

// ─────────────────────────────────────────────
// CAMPAIGN CARD
// ─────────────────────────────────────────────

const CampaignCard = ({
  campaign,
  stripeConfig,
  userId,
  isExpanded,
  onToggle,
  onRefresh,
}: {
  campaign: CampaignExtended;
  stripeConfig: StripeConfig | null;
  userId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) => {
  const funnelStates = {
    purchase: getFunnelState(campaign, 'purchase'),
    newsletter: getFunnelState(campaign, 'newsletter'),
    salesCall: getFunnelState(campaign, 'salesCall'),
    consultation: getFunnelState(campaign, 'consultation'),
  };
  const trackingStates = {
    purchase: getTrackingState(campaign, 'purchase', stripeConfig),
    newsletter: getTrackingState(campaign, 'newsletter', stripeConfig),
    salesCall: getTrackingState(campaign, 'salesCall', stripeConfig),
    consultation: getTrackingState(campaign, 'consultation', stripeConfig),
  };

  const allStates = Object.values(trackingStates);
  const activeCount = allStates.filter(s => s === 'active').length;
  const totalRelevant = [
    true,
    !!campaign.newsletter_url,
    !!campaign.has_sales_call,
    !!campaign.has_paid_consultation,
  ].filter(Boolean).length;

  const overallHealth: 'active' | 'partial' | 'inactive' =
    activeCount === totalRelevant ? 'active' :
    activeCount > 0 ? 'partial' : 'inactive';

  const expectedCallValue = computeExpectedCallValue(campaign);

  // ── Backward-compat method resolution ──
  // New campaigns have explicit purchase_method / delivery fields.
  // Old campaigns fall back based on uses_stripe boolean.
  const purchaseMethod: string =
    campaign.purchase_method ??
    (campaign.uses_stripe ? 'stripe_checkout' : 'alternative_payment');

  const salesCallDelivery: string =
    campaign.sales_call_delivery ?? 'external_platform';

  const consultationDelivery: string =
    campaign.consultation_delivery ?? 'external_platform';

  const consultationPaymentMethod: string =
    campaign.consultation_payment_method ??
    (campaign.uses_stripe_consultation ? 'stripe_checkout' : 'alternative_payment');

  // Legacy flags kept for getTrackingState compatibility
  const isStripeMain = purchaseMethod === 'stripe_checkout' || purchaseMethod === 'stripe_embedded';
  const isStripeConsult = consultationPaymentMethod === 'stripe_checkout' || consultationPaymentMethod === 'stripe_embedded';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden"
    >
      {/* Collapsed Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 hover:bg-zinc-800/50 transition-all text-left"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${
            overallHealth === 'active' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' :
            overallHealth === 'partial' ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]' :
            'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
          }`} />
          <div className="min-w-0">
            <p className="text-sm font-black text-white uppercase tracking-tight truncate">{campaign.campaign_name}</p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {(['purchase', 'newsletter', 'salesCall', 'consultation'] as const).map(type => {
                const fs = funnelStates[type];
                const ts = trackingStates[type];
                if (fs === 'inactive' && type !== 'purchase') return null;
                const labels = { purchase: 'Purchase', newsletter: 'Newsletter', salesCall: 'Sales Call', consultation: 'Consultation' };
                return (
                  <span key={type} className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${
                    ts === 'active' ? 'text-green-500' :
                    ts === 'pending' ? 'text-orange-400' :
                    'text-zinc-600'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      ts === 'active' ? 'bg-green-500' :
                      ts === 'pending' ? 'bg-orange-400' :
                      'bg-zinc-700'
                    }`} />
                    {labels[type]}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] font-bold text-zinc-500">
            {activeCount}/{totalRelevant} tracking
          </span>
          {isExpanded ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800 p-5 space-y-6">

              {/* Intro */}
              <div className="flex items-start gap-3 p-4 bg-zinc-800/40 rounded-xl border border-zinc-800">
                <Info size={14} className="text-zinc-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Your tracking links work by routing visitors through VS-Track before sending them to your destination. Each redirect is auto-generated per video. Configure your funnel tracking below, then{' '}
                    <Link to="/videos" className="text-red-400 hover:text-red-300 font-bold underline underline-offset-2">go to Videos</Link>{' '}
                    to attach this campaign to your content.
                  </p>
                </div>
              </div>

              {/* ── GLOBAL WEBSITE TRACKING ── */}
              <GlobalWebsiteTrackingSection />

                           {/* ── DIRECT PURCHASE FUNNEL ── */}
              <DirectPurchaseInstallation
                campaign={campaign}
                stripeConfig={stripeConfig}
                userId={userId}
                funnelState={funnelStates.purchase}
                trackingState={trackingStates.purchase}
                purchaseMethod={purchaseMethod}
                onRefresh={onRefresh}
              />

                           {/* ── NEWSLETTER FUNNEL ── */}
              <NewsletterInstallation
                campaign={campaign}
                funnelState={funnelStates.newsletter}
                trackingState={trackingStates.newsletter}
              />

              {/* ── SALES CALL FUNNEL ── */}
              <SalesCallInstallation
                campaign={campaign}
                funnelState={funnelStates.salesCall}
                trackingState={trackingStates.salesCall}
                salesCallDelivery={salesCallDelivery}
                expectedCallValue={expectedCallValue}
              />
             
              {/* ── PAID CONSULTATION FUNNEL ── */}
              <PaidConsultationInstallation
                campaign={campaign}
                stripeConfig={stripeConfig}
                userId={userId}
                funnelState={funnelStates.consultation}
                trackingState={trackingStates.consultation}
                consultationDelivery={consultationDelivery}
                consultationPaymentMethod={consultationPaymentMethod}
                onRefresh={onRefresh}
              />

              {/* ── LEAD MAGNET NOTE ── */}
              {campaign.has_lead_magnet && (
                <div className="flex items-start gap-3 p-4 bg-blue-500/5 border border-blue-500/15 rounded-xl">
                  <BookOpen size={13} className="text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1">Lead Magnet Tracking</p>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Lead magnet tracking is handled <span className="text-zinc-300 font-bold">automatically</span> via your video tracking links. When a viewer clicks your lead magnet link in the video description, VS-Track records the click event instantly — no pixel or thank-you page needed.
                    </p>
                  </div>
                </div>
              )}

              {/* ── COMPLETION SUMMARY ── */}
              <div className="flex items-center justify-between p-4 bg-zinc-800/40 rounded-xl border border-zinc-800">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    Tracking: <span className={activeCount === totalRelevant ? 'text-green-400' : activeCount > 0 ? 'text-orange-400' : 'text-red-400'}>{activeCount}/{totalRelevant} Active</span>
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    Stripe: <span className={stripeConfig?.stripe_webhook_secret ? 'text-green-400' : 'text-zinc-500'}>{stripeConfig?.stripe_webhook_secret ? 'Connected' : 'Not Connected'}</span>
                  </div>
                </div>
                <Link
                  to="/videos"
                  className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors"
                >
                  <Video size={12} /> Go to Videos <ArrowRight size={11} />
                </Link>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─────────────────────────────────────────────
// WHY STRIPE CARD
// ─────────────────────────────────────────────


  const WhyStripeCard = ({ userId }: { userId: string }) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    await supabase.from('stripe_interest').insert({ user_id: userId, email: email.trim() });
    setSubmitting(false);
    setSubmitted(true);
    setEmail('');
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-5 hover:bg-zinc-800/40 transition-all text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
            <Zap size={15} className="text-violet-400" />
          </div>
          <div>
            <p className="text-sm font-black text-white uppercase tracking-tight">Do I Need Stripe?</p>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">Stripe is optional — understand when to use it</p>
          </div>
        </div>
        {open ? <ChevronUp size={16} className="text-zinc-500 shrink-0" /> : <ChevronDown size={16} className="text-zinc-500 shrink-0" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800 p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-zinc-800/40 rounded-xl border border-zinc-800 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-violet-400 flex items-center gap-1"><Webhook size={11} /> With Stripe</p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">Stripe webhooks confirm purchases <span className="text-white font-bold">server-side</span> — no thank-you page needed. More reliable because it fires on actual payment confirmation, not just page visit.</p>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-2">Best for: Stripe Payment Links, Buy Buttons, Checkout</p>
                </div>
                <div className="p-4 bg-zinc-800/40 rounded-xl border border-zinc-800 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 flex items-center gap-1"><Zap size={11} /> Without Stripe (Pixel)</p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">Pixel tracking fires when a visitor lands on your thank-you page. Works with <span className="text-white font-bold">any platform</span> — TidyCal, Calendly, Kajabi, ThriveCart, GoHighLevel, and more.</p>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-2">Best for: Booking platforms, course platforms, custom funnels</p>
                </div>
              </div>

              <div className="p-4 bg-zinc-800/40 rounded-xl border border-zinc-800">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2 flex items-center gap-1"><Info size={11} /> Key Insight</p>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  The tracking method is determined by <span className="text-white font-bold">who controls the conversion event</span> — not which payment processor you use. If TidyCal handles your booking (even if Stripe processes payment behind the scenes), use pixel tracking, not webhook tracking.
                </p>
              </div>

              {!submitted ? (
                <div className="space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Interested in Stripe integration? Leave your email and we'll guide you:</p>
                  <form onSubmit={handleSubmit} className="flex gap-2">
                    <div className="relative flex-1">
                      <Mail size={13} className="absolute left-3 top-3 text-zinc-600" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:border-violet-500 outline-none transition-all placeholder:text-zinc-700"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="bg-violet-600 hover:bg-violet-500 text-white px-5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 flex items-center gap-2 shrink-0"
                    >
                      {submitting ? <Loader2 size={13} className="animate-spin" /> : 'Notify Me'}
                    </button>
                  </form>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-green-500/5 border border-green-500/20 rounded-xl">
                  <CheckCircle2 size={14} className="text-green-400" />
                  <p className="text-[11px] text-green-400 font-bold">Got it! We'll be in touch about Stripe setup.</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─────────────────────────────────────────────
// MAIN INSTALLATION PAGE
// ─────────────────────────────────────────────

export default function Installation() {
  const { userId, isReadOnly, loading: identityLoading } = useEffectiveIdentity();
  const { open: openOnboarding } = useOnboardingOverlay();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<CampaignExtended[]>([]);
  const [stripeConfig, setStripeConfig] = useState<StripeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(() => {
    return localStorage.getItem('vtrack_installation_expanded') ?? null;
  });
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!userId) return;
    const [{ data: camps }, { data: stripeConf }] = await Promise.all([
      supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('stripe_configs')
        .select('stripe_webhook_secret')
        .eq('user_id', userId)
        .single(),
    ]);
    setCampaigns((camps ?? []) as CampaignExtended[]);
    setStripeConfig(stripeConf ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const returnPath = localStorage.getItem('campaign_form_return');
    if (returnPath === '/installation') {
      localStorage.removeItem('campaign_form_return');
      fetchData();
    }
  }, [fetchData]);

  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('campaign-updated', handler);
    return () => window.removeEventListener('campaign-updated', handler);
  }, [fetchData]);

  const handleToggle = (id: string) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next) {
      localStorage.setItem('vtrack_installation_expanded', next);
    } else {
      localStorage.removeItem('vtrack_installation_expanded');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleNewCampaign = () => {
    localStorage.setItem('campaign_form_return', '/installation');
    navigate('/campaigns');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="text-red-600 animate-spin" size={28} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 max-w-3xl mx-auto pb-20 pt-8"
    >
      {/* Header */}
      <header className="space-y-2">
        <div className="flex items-center gap-2 label-caps text-zinc-500">
          <Zap size={11} />
          Setup & Tracking
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black text-white italic tracking-tighter">
              INSTALLATION
            </h1>
            <p className="text-zinc-500 text-[10px] uppercase tracking-widest font-black mt-1 leading-relaxed">
              Configure your funnels and activate conversion tracking
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-zinc-300 transition-all text-[10px] font-black uppercase tracking-widest disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      {/* Getting Started */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <p className="label-caps text-zinc-500 mb-3">Getting Started</p>
        <h2 className="text-lg font-bold text-white mb-2">
          🦊Your Fox is waiting for you.
        </h2>
        <p className="text-sm text-zinc-500 mb-5 leading-relaxed">
          We'll get your first campaign ready together — who you're selling
          to, how they buy, and how VSTRK tracks it back here.
        </p>
        <button
          onClick={openOnboarding}
          className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white text-xs font-black uppercase tracking-widest rounded-xl px-6 h-11 transition-colors"
        >
          Continue Setup
        </button>
      </div>

      {/* Why Stripe */}
      <WhyStripeCard userId={userId!} />

      {/* Campaigns Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[11px] font-black uppercase tracking-widest text-white">Your Campaigns</h2>
            <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest mt-0.5">{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} found</p>
          </div>
          <button
            onClick={handleNewCampaign}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-[0_8px_24px_rgba(220,38,38,0.25)]"
          >
            <ChevronRight size={12} />
            New Campaign
          </button>
        </div>

        {campaigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
              <Zap size={20} className="text-zinc-600" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-black text-white uppercase tracking-tight">No Campaigns Yet</p>
              <p className="text-[11px] text-zinc-500">Create your first campaign to start configuring tracking.</p>
            </div>
            <button
              onClick={handleNewCampaign}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[10px] font-black uppercase tracking-widest transition-all"
            >
              <ChevronRight size={12} />
              Create First Campaign
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map(campaign => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                stripeConfig={stripeConfig}
                userId={userId!}
                isExpanded={expandedId === campaign.id}
                onToggle={() => handleToggle(campaign.id)}
                onRefresh={handleRefresh}
              />
            ))}
          </div>
        )}
      </section>

      {/* Quick Reference */}
      <section className="p-5 bg-zinc-900 border border-zinc-800 rounded-2xl space-y-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
          <BookOpen size={12} /> Quick Reference
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { color: 'bg-green-500', label: 'Tracking Active', desc: 'Pixel or webhook is configured and firing.' },
            { color: 'bg-orange-500', label: 'Tracking Pending', desc: 'Pixel generated but no thank-you page yet — paste the code once you have the page.' },
            { color: 'bg-red-500', label: 'Funnel Inactive', desc: 'Missing required URLs in your campaign settings.' },
            { color: 'bg-violet-500', label: 'Stripe Webhook', desc: 'Server-side confirmation — most reliable for direct sales.' },
          ].map(item => (
            <div key={item.label} className="flex items-start gap-3 p-3 bg-zinc-800/40 rounded-xl border border-zinc-800">
              <span className={`w-2 h-2 rounded-full ${item.color} shrink-0 mt-1`} />
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-300">{item.label}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

    </motion.div>
  );
}
