import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronDown, ChevronUp, Copy, Check, AlertCircle, CheckCircle2,
  XCircle, Webhook, Zap, Mail, ExternalLink, Video, RefreshCw,
  Info, Loader2, Key, ArrowRight, ShoppingCart, Phone, BookOpen,
  Newspaper, CreditCard, ChevronRight, Star
} from 'lucide-react';
import { Modal } from '../components/Modal';
import type { Campaign } from '../lib/supabase';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

type FunnelState = 'inactive' | 'partial' | 'active';
type TrackingState = 'inactive' | 'pending' | 'active';

interface StripeConfig {
  stripe_webhook_secret: string | null;
}

interface CampaignWithState extends Campaign {
  funnelStates: {
    purchase: FunnelState;
    newsletter: FunnelState;
    salesCall: FunnelState;
    consultation: FunnelState;
  };
  trackingStates: {
    purchase: TrackingState;
    newsletter: TrackingState;
    salesCall: TrackingState;
    consultation: TrackingState;
  };
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const isStripeCheckout = (checkoutType: string | null | undefined): boolean => {
  return checkoutType === 'stripe_direct' || checkoutType === null || checkoutType === undefined
    ? false
    : checkoutType === 'stripe_direct';
};

const getFunnelState = (campaign: Campaign, funnelType: 'purchase' | 'newsletter' | 'salesCall' | 'consultation'): FunnelState => {
  switch (funnelType) {
    case 'purchase':
      if (!campaign.landing_page_url) return 'inactive';
      if (!campaign.checkout_url) return 'partial';
      return 'active';
    case 'newsletter':
      if (!campaign.newsletter_url) return 'inactive';
      return 'active';
    case 'salesCall':
      if (!campaign.has_sales_call) return 'inactive';
      if (!campaign.sales_call_booking_url) return 'inactive';
      return 'active';
    case 'consultation':
      if (!campaign.has_paid_consultation) return 'inactive';
      if (!campaign.consultation_booking_url) return 'inactive';
      return 'active';
    default:
      return 'inactive';
  }
};

const getTrackingState = (
  campaign: Campaign,
  funnelType: 'purchase' | 'newsletter' | 'salesCall' | 'consultation',
  stripeConfig: StripeConfig | null
): TrackingState => {
  const funnelActive = getFunnelState(campaign, funnelType);
  if (funnelActive === 'inactive') return 'inactive';

  const hasStripeWebhook = !!(stripeConfig?.stripe_webhook_secret);

  switch (funnelType) {
    case 'purchase':
      if (campaign.checkout_type === 'stripe_direct' || campaign.uses_stripe) {
        return hasStripeWebhook ? 'active' : 'pending';
      }
      // Non-stripe: pixel-based. Tracking works but pending if no thank-you URL
      return campaign.purchase_thankyou_url ? 'active' : 'pending';
    case 'newsletter':
      return campaign.newsletter_thankyou_url ? 'active' : 'pending';
    case 'salesCall':
      return campaign.sales_call_thankyou_url ? 'active' : 'pending';
    case 'consultation':
      if (campaign.consultation_checkout_type === 'stripe_direct' || campaign.uses_stripe_consultation) {
        return hasStripeWebhook ? 'active' : 'pending';
      }
      return campaign.consultation_thankyou_url ? 'active' : 'pending';
    default:
      return 'inactive';
  }
};

const generatePixelSnippet = (campaignId: string, eventType: string, amount: number | null): string => {
  const amountStr = amount !== null ? amount.toString() : '0';
  return `<!-- V-Track Pixel: ${eventType} -->
<script>
  fetch('https://vstrk.com/api/pixel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      campaign_id: '${campaignId}',
      event_type: '${eventType}',
      amount: ${amountStr}
    })
  });
</script>`;
};

const computeExpectedCallValue = (campaign: Campaign): number => {
  const price = campaign.offer_price ?? 0;
  const rate = campaign.estimated_close_rate ?? 0;
  return Math.round(price * (rate / 100) * 100) / 100;
};

// ─────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────

const StatusBadge = ({ state, label }: { state: FunnelState | TrackingState; label?: string }) => {
  const configs = {
    active: { color: 'text-green-400 bg-green-500/10 border-green-500/20', icon: <CheckCircle2 size={10} />, text: label ?? 'Active' },
    partial: { color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', icon: <AlertCircle size={10} />, text: label ?? 'Partial' },
    pending: { color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', icon: <AlertCircle size={10} />, text: label ?? 'Pending' },
    inactive: { color: 'text-red-400 bg-red-500/10 border-red-500/20', icon: <XCircle size={10} />, text: label ?? 'Inactive' },
  };
  const c = configs[state];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black uppercase tracking-widest ${c.color}`}>
      {c.icon} {c.text}
    </span>
  );
};

// ─────────────────────────────────────────────
// COPY BUTTON
// ─────────────────────────────────────────────

const CopyButton = ({ text, label = 'Copy' }: { text: string; label?: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] font-black uppercase tracking-widest text-zinc-300 hover:text-white transition-all active:scale-95 shrink-0"
    >
      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
      {copied ? 'Copied!' : label}
    </button>
  );
};

// ─────────────────────────────────────────────
// PIXEL BLOCK
// ─────────────────────────────────────────────

const PixelBlock = ({
  campaignId,
  eventType,
  amount,
  thankyouUrl,
  pendingMessage,
  activeInstruction,
}: {
  campaignId: string;
  eventType: string;
  amount: number | null;
  thankyouUrl: string | null | undefined;
  pendingMessage: string;
  activeInstruction: string;
}) => {
  const snippet = generatePixelSnippet(campaignId, eventType, amount);

  return (
    <div className="space-y-3 mt-4">
      {!thankyouUrl && (
        <div className="flex gap-3 p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
          <AlertCircle size={14} className="text-orange-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-[11px] font-bold text-orange-300 uppercase tracking-widest">Tracking Pending</p>
            <p className="text-[11px] text-zinc-400 leading-relaxed">{pendingMessage}</p>
            <p className="text-[11px] text-zinc-500 leading-relaxed mt-1">
              We understand you may not have a thank-you page set up yet — <span className="text-zinc-300 font-bold">your tracking pixel is already generated and ready below.</span> The system is already working. For best results, we strongly recommend a dedicated thank-you page. Once you have it, simply paste this code inside and tracking activates instantly.
            </p>
          </div>
        </div>
      )}
      {thankyouUrl && (
        <div className="flex gap-3 p-4 bg-green-500/5 border border-green-500/20 rounded-xl">
          <CheckCircle2 size={14} className="text-green-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-300 leading-relaxed">{activeInstruction}</p>
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="label-caps">Your Tracking Pixel</span>
          <CopyButton text={snippet} />
        </div>
        <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-[11px] font-mono text-zinc-400 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
          {snippet}
        </pre>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// CHECKOUT TYPE SELECTOR
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
// STRIPE SETUP BLOCK
// ─────────────────────────────────────────────

const StripeSetupBlock = ({
  userId,
  stripeConfig,
  checkoutUrl,
  onSecretSaved,
}: {
  userId: string;
  stripeConfig: StripeConfig | null;
  checkoutUrl: string | null | undefined;
  onSecretSaved: () => void;
}) => {
  const [webhookSecret, setWebhookSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const webhookEndpoint = 'https://vstrk.com/api/stripe-webhook';
  const isConnected = !!(stripeConfig?.stripe_webhook_secret);

  const handleSave = async () => {
    if (!webhookSecret.trim()) return;
    setSaving(true);
    await supabase.from('stripe_configs').upsert(
      { user_id: userId, stripe_webhook_secret: webhookSecret.trim() },
      { onConflict: 'user_id' }
    );
    setSaving(false);
    setWebhookSecret('');
    onSecretSaved();
  };

  const maskSecret = (s: string) => s.slice(0, 8) + '••••••••••••' + s.slice(-4);

  return (
    <div className="mt-4 space-y-4 bg-violet-500/5 border border-violet-500/15 rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Webhook size={14} className="text-violet-400" />
          <span className="text-[11px] font-black uppercase tracking-widest text-violet-300">Stripe Webhook Setup</span>
        </div>
        {isConnected
          ? <span className="flex items-center gap-1 text-[10px] font-black text-green-400 uppercase tracking-widest"><CheckCircle2 size={11} /> Connected</span>
          : <span className="flex items-center gap-1 text-[10px] font-black text-orange-400 uppercase tracking-widest"><AlertCircle size={11} /> Not Connected</span>
        }
      </div>

      {/* Step 1 - Checkout URL */}
      {checkoutUrl && (
        <div className="space-y-2 pt-2 border-t border-violet-500/10">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-[9px] font-black text-zinc-400 flex items-center justify-center">1</span>
            <p className="text-[11px] font-bold text-white uppercase tracking-wide">Your Checkout URL</p>
          </div>
          <p className="text-[11px] text-zinc-500 pl-7 leading-relaxed">
            This is the URL customers visit to purchase. Make sure your "Buy Now" button on your landing page points here.
          </p>
          <div className="flex gap-2 pl-7">
            <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 font-mono text-[11px] text-zinc-400 break-all">{checkoutUrl}</div>
            <CopyButton text={checkoutUrl} />
          </div>
        </div>
      )}

      {/* Step 2 - Webhook endpoint */}
      <div className="space-y-2 pt-2 border-t border-violet-500/10">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-[9px] font-black text-zinc-400 flex items-center justify-center">{checkoutUrl ? '2' : '1'}</span>
          <p className="text-[11px] font-bold text-white uppercase tracking-wide">Add Webhook in Stripe Dashboard</p>
        </div>
        <p className="text-[11px] text-zinc-500 pl-7 leading-relaxed">
          Go to <span className="text-zinc-300 font-bold">Stripe Dashboard → Developers → Webhooks → Add endpoint</span>. Paste the URL below and select event: <code className="text-violet-400">checkout.session.completed</code>
        </p>
        <div className="flex gap-2 pl-7">
          <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 font-mono text-[11px] text-zinc-400 break-all">{webhookEndpoint}</div>
          <CopyButton text={webhookEndpoint} />
        </div>
      </div>

      {/* Step 3 - Signing secret */}
      <div className="space-y-2 pt-2 border-t border-violet-500/10">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-[9px] font-black text-zinc-400 flex items-center justify-center">{checkoutUrl ? '3' : '2'}</span>
          <p className="text-[11px] font-bold text-white uppercase tracking-wide">Paste Your Webhook Signing Secret</p>
        </div>
        <p className="text-[11px] text-zinc-500 pl-7 leading-relaxed">
          After creating the endpoint, Stripe shows a <span className="text-zinc-300 font-bold">Signing Secret</span> starting with <code className="text-violet-400">whsec_</code>. Paste it below.
        </p>
        {isConnected && (
          <div className="ml-7 flex items-center gap-2 px-3 py-2 bg-green-500/5 border border-green-500/20 rounded-xl">
            <CheckCircle2 size={11} className="text-green-500 shrink-0" />
            <span className="text-[11px] text-zinc-400 font-mono">{maskSecret(stripeConfig!.stripe_webhook_secret!)}</span>
            <span className="ml-auto text-[10px] text-green-500 font-black uppercase tracking-widest">Active</span>
          </div>
        )}
        <div className="pl-7 space-y-2">
          <div className="relative">
            <Key size={13} className="absolute left-3 top-3 text-zinc-600" />
            <input
              type="password"
              value={webhookSecret}
              onChange={e => setWebhookSecret(e.target.value)}
              placeholder="whsec_••••••••••••••••••••••"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 pl-9 pr-4 text-sm text-white font-mono focus:border-violet-500 outline-none transition-all placeholder:text-zinc-700"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !webhookSecret.trim()}
            className="w-full bg-violet-600 hover:bg-violet-500 text-white h-10 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : 'Save Webhook Secret'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// FUNNEL SECTION HEADER
// ─────────────────────────────────────────────

const FunnelHeader = ({
  icon,
  title,
  funnelState,
  trackingState,
}: {
  icon: React.ReactNode;
  title: string;
  funnelState: FunnelState;
  trackingState: TrackingState;
}) => (
  <div className="flex items-center justify-between flex-wrap gap-2">
    <div className="flex items-center gap-2">
      <div className="text-zinc-500">{icon}</div>
      <span className="text-[11px] font-black uppercase tracking-widest text-white">{title}</span>
    </div>
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-zinc-600 uppercase tracking-widest">Funnel</span>
        <StatusBadge state={funnelState} />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[9px] text-zinc-600 uppercase tracking-widest">Tracking</span>
        <StatusBadge state={trackingState} />
      </div>
    </div>
  </div>
);

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
  campaign: Campaign;
  stripeConfig: StripeConfig | null;
  userId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
}) => {
  const [checkoutTypeSaving, setCheckoutTypeSaving] = useState(false);
  const [consultCheckoutTypeSaving, setConsultCheckoutTypeSaving] = useState(false);

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
    true, // purchase always relevant
    !!campaign.newsletter_url,
    !!campaign.has_sales_call,
    !!campaign.has_paid_consultation,
  ].filter(Boolean).length;

  const overallHealth: 'active' | 'partial' | 'inactive' =
    activeCount === totalRelevant ? 'active' :
    activeCount > 0 ? 'partial' : 'inactive';

  const handleCheckoutTypeChange = async (val: string) => {
    setCheckoutTypeSaving(true);
    await supabase.from('campaigns').update({ checkout_type: val }).eq('id', campaign.id);
    setCheckoutTypeSaving(false);
    onRefresh();
  };

  const handleConsultCheckoutTypeChange = async (val: string) => {
    setConsultCheckoutTypeSaving(true);
    await supabase.from('campaigns').update({ consultation_checkout_type: val }).eq('id', campaign.id);
    setConsultCheckoutTypeSaving(false);
    onRefresh();
  };

  const expectedCallValue = computeExpectedCallValue(campaign);
  const isStripeMain = campaign.checkout_type === 'stripe_direct' || (campaign.uses_stripe && !campaign.checkout_type);
  const isStripeConsult = campaign.consultation_checkout_type === 'stripe_direct' || (campaign.uses_stripe_consultation && !campaign.consultation_checkout_type);

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
                    Your tracking links work by routing visitors through V-Track before sending them to your destination. Each redirect is auto-generated per video. Configure your funnel tracking below, then{' '}
                    <Link to="/videos" className="text-red-400 hover:text-red-300 font-bold underline underline-offset-2">go to Videos</Link>{' '}
                    to attach this campaign to your content.
                  </p>
                </div>
              </div>

              {/* ── DIRECT PURCHASE FUNNEL ── */}
              <div className="space-y-4 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800">
                <FunnelHeader
                  icon={<ShoppingCart size={14} />}
                  title="Direct Purchase Funnel"
                  funnelState={funnelStates.purchase}
                  trackingState={trackingStates.purchase}
                />

                {funnelStates.purchase === 'inactive' && (
                  <div className="flex gap-3 p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
                    <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      {!campaign.landing_page_url
                        ? 'No landing page URL detected. Add one in your campaign settings to activate this funnel.'
                        : 'Funnel inactive.'}
                    </p>
                  </div>
                )}

                {funnelStates.purchase === 'partial' && (
                  <div className="flex gap-3 p-3 bg-orange-500/5 border border-orange-500/15 rounded-xl">
                    <AlertCircle size={13} className="text-orange-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Landing page detected, but no checkout URL found yet. Visitors can reach your page, but cannot complete purchases. Add a checkout URL to your campaign.
                    </p>
                  </div>
                )}

                {funnelStates.purchase === 'active' && (
                  <div className="space-y-4">
                    <CheckoutTypeSelector
                      value={campaign.checkout_type}
                      onChange={handleCheckoutTypeChange}
                      saving={checkoutTypeSaving}
                    />

                    {isStripeMain ? (
                      <StripeSetupBlock
                        userId={userId}
                        stripeConfig={stripeConfig}
                        checkoutUrl={campaign.checkout_url}
                        onSecretSaved={onRefresh}
                      />
                    ) : (
                      <PixelBlock
                        campaignId={campaign.id}
                        eventType="purchase"
                        amount={campaign.offer_price ?? null}
                        thankyouUrl={campaign.purchase_thankyou_url}
                        pendingMessage="No thank-you page URL detected yet."
                        activeInstruction={`✅ Thank-you page detected. Paste this code on ${campaign.purchase_thankyou_url} to complete purchase tracking.`}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* ── NEWSLETTER FUNNEL ── */}
              <div className="space-y-4 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800">
                <FunnelHeader
                  icon={<Newspaper size={14} />}
                  title="Newsletter Funnel"
                  funnelState={funnelStates.newsletter}
                  trackingState={trackingStates.newsletter}
                />

                {funnelStates.newsletter === 'inactive' ? (
                  <div className="flex gap-3 p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
                    <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      No newsletter signup URL detected. Add one to your campaign to activate this funnel.
                    </p>
                  </div>
                ) : (
                  <PixelBlock
                    campaignId={campaign.id}
                    eventType="newsletter"
                    amount={0}
                    thankyouUrl={campaign.newsletter_thankyou_url}
                    pendingMessage="No newsletter thank-you page URL detected yet."
                    activeInstruction={`✅ Thank-you page detected. Paste this code on your newsletter confirmation page to complete tracking.`}
                  />
                )}
              </div>

              {/* ── SALES CALL FUNNEL ── */}
              {campaign.has_sales_call && (
                <div className="space-y-4 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800">
                  <FunnelHeader
                    icon={<Phone size={14} />}
                    title="Sales Call Funnel"
                    funnelState={funnelStates.salesCall}
                    trackingState={trackingStates.salesCall}
                  />

                  {funnelStates.salesCall === 'inactive' ? (
                    <div className="flex gap-3 p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
                      <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        No sales call booking URL detected. Add one to your campaign settings.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {expectedCallValue > 0 && (
                        <div className="flex items-center gap-3 p-3 bg-zinc-800/60 rounded-xl border border-zinc-700">
                          <Star size={13} className="text-yellow-400 shrink-0" />
                          <p className="text-[11px] text-zinc-400 leading-relaxed">
                            Expected revenue per booked call: <span className="text-white font-black">${expectedCallValue}</span>
                            <span className="text-zinc-600 ml-1">(${campaign.offer_price} × {campaign.estimated_close_rate}% close rate)</span>
                          </p>
                        </div>
                      )}
                      <PixelBlock
                        campaignId={campaign.id}
                        eventType="sales_call"
                        amount={expectedCallValue || null}
                        thankyouUrl={campaign.sales_call_thankyou_url}
                        pendingMessage="No booking confirmation page URL detected yet."
                        activeInstruction="✅ Confirmation page detected. Paste this code on your booking confirmation page."
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ── PAID CONSULTATION FUNNEL ── */}
              {campaign.has_paid_consultation && (
                <div className="space-y-4 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800">
                  <FunnelHeader
                    icon={<CreditCard size={14} />}
                    title="Paid Consultation Funnel"
                    funnelState={funnelStates.consultation}
                    trackingState={trackingStates.consultation}
                  />

                  {funnelStates.consultation === 'inactive' ? (
                    <div className="flex gap-3 p-3 bg-red-500/5 border border-red-500/15 rounded-xl">
                      <XCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        No consultation booking URL detected. Add one to your campaign settings.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <CheckoutTypeSelector
                        value={campaign.consultation_checkout_type}
                        onChange={handleConsultCheckoutTypeChange}
                        saving={consultCheckoutTypeSaving}
                      />

                      {isStripeConsult ? (
                        <StripeSetupBlock
                          userId={userId}
                          stripeConfig={stripeConfig}
                          checkoutUrl={campaign.paid_consultation_checkout_url}
                          onSecretSaved={onRefresh}
                        />
                      ) : (
                        <PixelBlock
                          campaignId={campaign.id}
                          eventType="consultation"
                          amount={campaign.consultation_fee ?? null}
                          thankyouUrl={campaign.consultation_thankyou_url}
                          pendingMessage="No consultation confirmation page URL detected yet."
                          activeInstruction="✅ Confirmation page detected. Paste this code on your consultation confirmation page."
                        />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── LEAD MAGNET NOTE ── */}
              {campaign.has_lead_magnet && (
                <div className="flex items-start gap-3 p-4 bg-blue-500/5 border border-blue-500/15 rounded-xl">
                  <BookOpen size={13} className="text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1">Lead Magnet Tracking</p>
                    <p className="text-[11px] text-zinc-400 leading-relaxed">
                      Lead magnet tracking is handled <span className="text-zinc-300 font-bold">automatically</span> via your video tracking links. When a viewer clicks your lead magnet link in the video description, V-Track records the click event instantly — no pixel or thank-you page needed.
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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stripeConfig, setStripeConfig] = useState<StripeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(() => {
    return localStorage.getItem('vtrack_installation_expanded') ?? null;
  });
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    const [{ data: camps }, { data: stripeConf }] = await Promise.all([
      supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('stripe_configs')
        .select('stripe_webhook_secret')
        .eq('user_id', user.id)
        .single(),
    ]);
    setCampaigns(camps ?? []);
    setStripeConfig(stripeConf ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Return from campaign form
  useEffect(() => {
    const returnPath = localStorage.getItem('campaign_form_return');
    if (returnPath === '/installation') {
      localStorage.removeItem('campaign_form_return');
      fetchData();
    }
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

      {/* Why Stripe */}
      <WhyStripeCard userId={user!.id} />

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
                userId={user!.id}
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
