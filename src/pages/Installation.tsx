import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
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

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

type FunnelState = 'inactive' | 'partial' | 'active';
type TrackingState = 'inactive' | 'pending' | 'active';

interface StripeConfig {
  stripe_webhook_secret: string | null;
}

// Extend Campaign locally to include the two DB fields that may not be in the generated type
type CampaignExtended = Campaign & {
  checkout_type?: string | null;
  consultation_checkout_type?: string | null;
  // New conditional funnel configuration fields
  purchase_method?: string | null;
  sales_call_delivery?: string | null;
  average_upsell_value?: number | null;
  consultation_delivery?: string | null;
  consultation_payment_method?: string | null;
};

interface CampaignWithState extends CampaignExtended {
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

const getFunnelState = (campaign: CampaignExtended, funnelType: 'purchase' | 'newsletter' | 'salesCall' | 'consultation'): FunnelState => {
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
  campaign: CampaignExtended,
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



const computeExpectedCallValue = (campaign: CampaignExtended): number => {
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
// NEW ATTRIBUTION PIXEL GENERATOR
// Architecture: URL params → localStorage → fallback
// This is now the SINGLE SOURCE OF TRUTH for all funnel pixels.
// ─────────────────────────────────────────────

const generateAttributionPixel = (
  campaignId: string,
  eventType: string,
  amount: number | null
): string => {
  const numericAmount = amount != null && amount > 0 ? amount : 0;

  return `<!-- VS-Track Pixel: ${eventType} -->
<script>
(function () {
  const CONFIG = {
    event_type: '${eventType}',
    default_video_id: 'unknown'
  };
  const params = new URLSearchParams(window.location.search);
  const sessionId =
    params.get('vt_sid') || localStorage.getItem('yt_tracker_session_id');
  const videoId =
    params.get('vt_vid') ||
    localStorage.getItem('yt_tracker_video_id') ||
    CONFIG.default_video_id;
  const campaignId =
    params.get('vt_cid') ||
    localStorage.getItem('yt_tracker_campaign_id') ||
    null;
  if (sessionId) localStorage.setItem('yt_tracker_session_id', sessionId);
  if (videoId) localStorage.setItem('yt_tracker_video_id', videoId);
  if (campaignId) localStorage.setItem('yt_tracker_campaign_id', campaignId);
  const payload = {
    session_id: sessionId,
    video_id: videoId,
    campaign_id: campaignId,
    event_type: CONFIG.event_type,
    ...(CONFIG.event_type !== 'sales_call' && { amount: ${numericAmount} })
  };
  console.debug('[VS-Track] firing pixel:', payload);
  fetch('https://www.vstrk.com/api/pixel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
})();
<\/script>`;
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
  const snippet = generateAttributionPixel(campaignId, eventType, amount);

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
// CHECKOUT INTENT BLOCK
// Optional mid-funnel pixel. Only shown for non-Stripe funnels.
// Does NOT replace the existing confirmation pixel — sits above it.
// ─────────────────────────────────────────────

const CheckoutIntentBlock = ({
  campaignId,
  checkoutUrl,
  hasThankYouUrl,
}: {
  campaignId: string;
  checkoutUrl: string | null | undefined;
  hasThankYouUrl: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const snippet = generateAttributionPixel(campaignId, 'checkout_intent', 0);

  return (
    <div className="border border-amber-500/20 rounded-xl overflow-hidden bg-amber-500/3">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-amber-500/5 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <Zap size={13} className="text-amber-400 shrink-0" />
          <span className="text-[11px] font-black uppercase tracking-widest text-amber-300">
            Optional: Checkout Intent Pixel
          </span>
          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400">
            New
          </span>
        </div>
        {open
          ? <ChevronUp size={13} className="text-zinc-500 shrink-0" />
          : <ChevronDown size={13} className="text-zinc-500 shrink-0" />
        }
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-amber-500/15 p-4 space-y-3">
              {/* What this is */}
              <div className="flex gap-3 p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl">
                <AlertCircle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">
                    Tracks checkout intent — does not confirm payment
                  </p>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    {hasThankYouUrl
                      ? 'You already have a confirmation pixel below that tracks completed conversions. This optional pixel adds mid-funnel visibility — it records when a visitor reaches your checkout page, before payment happens. Useful for measuring drop-off between checkout visits and confirmed purchases.'
                      : "You don't have a thank-you page yet, so this pixel is your best available conversion signal right now. It records when a visitor reaches your checkout page. It does not confirm payment was completed — but it gives you something to track until a confirmation page is in place."}
                  </p>
                </div>
              </div>

              {/* Where to install */}
              {checkoutUrl ? (
                <div className="flex gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <ExternalLink size={12} className="text-zinc-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Paste this code on your checkout page:{' '}
                    <span className="text-zinc-300 font-mono text-[10px] break-all">{checkoutUrl}</span>
                  </p>
                </div>
              ) : (
                <div className="flex gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                  <AlertCircle size={12} className="text-zinc-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    No checkout URL is configured yet. Add one in your campaign settings to know where to paste this pixel.
                  </p>
                </div>
              )}

              {/* Snippet */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="label-caps text-amber-400">Checkout Intent Pixel</span>
                  <CopyButton text={snippet} />
                </div>
                <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-[11px] font-mono text-zinc-400 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
                  {snippet}
                </pre>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─────────────────────────────────────────────
// REDIRECT TRACKING BLOCK
// Used for external platform flows (external booking, alternative payment, etc.)
// Reuses the existing redirect_links architecture — only the link_type changes.
// ─────────────────────────────────────────────

const RedirectTrackingBlock = ({
  campaignId,
  destinationUrl,
  linkType,
  eventLabel,
  limitationMessage,
}: {
  campaignId: string;
  destinationUrl: string | null | undefined;
  linkType: string;
  eventLabel: string;
  limitationMessage: string;
}) => {
  const [trackedUrl, setTrackedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!destinationUrl || !campaignId) return;

    const syncLink = async () => {
      const { data: existing } = await supabase
        .from('redirect_links')
        .select('token, destination_url')
        .eq('campaign_id', campaignId)
        .eq('link_type', linkType)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!existing) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const token = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        const { error } = await supabase.from('redirect_links').insert({
          token,
          campaign_id: campaignId,
          link_type: linkType,
          destination_url: destinationUrl,
          video_id: null,
        });
        if (!error) setTrackedUrl(`${window.location.origin}/${token}`);
      } else if (existing.destination_url !== destinationUrl) {
        await supabase
          .from('redirect_links')
          .update({ destination_url: destinationUrl })
          .eq('campaign_id', campaignId)
          .eq('link_type', linkType);
        setTrackedUrl(`${window.location.origin}/${existing.token}`);
      } else {
        setTrackedUrl(`${window.location.origin}/${existing.token}`);
      }
    };

    syncLink();
  }, [campaignId, destinationUrl, linkType]);

  return (
    <div className="space-y-3 mt-4">
      {/* Tracked link */}
      <div className="space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
          <ArrowRight size={11} /> Your Tracked {eventLabel} Link
        </p>
        {!destinationUrl ? (
          <div className="flex gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
            <AlertCircle size={12} className="text-zinc-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-zinc-500">No destination URL configured yet. Add one in your campaign settings.</p>
          </div>
        ) : trackedUrl ? (
          <div className="flex gap-2">
            <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 font-mono text-[11px] text-zinc-400 break-all">{trackedUrl}</div>
            <CopyButton text={trackedUrl} />
          </div>
        ) : (
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 font-mono text-[11px] text-zinc-600 flex items-center gap-2">
            <Loader2 size={11} className="animate-spin shrink-0" /> Generating tracked link…
          </div>
        )}
      </div>

      {/* Attribution limitation notice */}
      <div className="flex gap-3 p-3.5 bg-zinc-800/40 border border-zinc-700/50 rounded-xl">
        <Info size={12} className="text-zinc-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-zinc-500 leading-relaxed">{limitationMessage}</p>
      </div>
    </div>
  );
};

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
// STRIPE SETUP BLOCK
// ─────────────────────────────────────────────

const generateToken = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

const StripeSetupBlock = ({
  userId,
  stripeConfig,
  checkoutUrl,
  campaignId,
  linkType,
  onSecretSaved,
}: {
  userId: string;
  stripeConfig: StripeConfig | null;
  checkoutUrl: string | null | undefined;
  campaignId: string;
  linkType: 'checkout' | 'consultation';
  onSecretSaved: () => void;
}) => {
  const [webhookSecret, setWebhookSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [trackedUrl, setTrackedUrl] = useState<string | null>(null);
  const webhookEndpoint = WEBHOOK_ENDPOINT;
  const isConnected = !!(stripeConfig?.stripe_webhook_secret);

  useEffect(() => {
    if (!checkoutUrl || !campaignId) return;
    const dbLinkType = linkType === 'consultation' ? 'consultation' : 'checkout';

    const syncTrackedLink = async () => {
      const { data: existing } = await supabase
        .from('redirect_links')
        .select('token, destination_url')
        .eq('campaign_id', campaignId)
        .eq('link_type', dbLinkType)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!existing) {
        const token = generateToken();
        const { error } = await supabase.from('redirect_links').insert({
          token,
          campaign_id: campaignId,
          link_type: dbLinkType,
          destination_url: checkoutUrl,
          video_id: null,
        });
        if (!error) setTrackedUrl(`${window.location.origin}/${token}`);
      } else if (existing.destination_url !== checkoutUrl) {
        await supabase
          .from('redirect_links')
          .update({ destination_url: checkoutUrl })
          .eq('campaign_id', campaignId)
          .eq('link_type', dbLinkType);
        setTrackedUrl(`${window.location.origin}/${existing.token}`);
      } else {
        setTrackedUrl(`${window.location.origin}/${existing.token}`);
      }
    };

    syncTrackedLink();
  }, [campaignId, checkoutUrl, linkType]);

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

      {/* Step 1 - Tracked Checkout URL */}
      {checkoutUrl && (
        <div className="space-y-2 pt-2 border-t border-violet-500/10">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-[9px] font-black text-zinc-400 flex items-center justify-center">1</span>
            <p className="text-[11px] font-bold text-white uppercase tracking-wide">Your Checkout URL</p>
          </div>
          <p className="text-[11px] text-zinc-500 pl-7 leading-relaxed">
            This is your tracked checkout link. Use this as your "Buy Now" button — it routes through VS-Track so purchases are attributed to the correct video.
          </p>
          <div className="flex gap-2 pl-7">
            {trackedUrl
              ? <>
                  <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 font-mono text-[11px] text-zinc-400 break-all">{trackedUrl}</div>
                  <CopyButton text={trackedUrl} />
                </>
              : <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 font-mono text-[11px] text-zinc-600 break-all flex items-center gap-2">
                  <Loader2 size={11} className="animate-spin shrink-0" /> Generating tracked link…
                </div>
            }
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
// GLOBAL WEBSITE TRACKING SECTION
// Attribution Infrastructure — install once on your website.
// Persists visitor attribution across pages, funnels, embeds,
// and booking platforms. Foundation for all funnel tracking.
// ─────────────────────────────────────────────

const GLOBAL_TRACKING_SCRIPT = `<script>
(function() {
  const p = new URLSearchParams(window.location.search);

  const sid = p.get('vt_sid');
  const vid = p.get('vt_vid');
  const cid = p.get('vt_cid');

  if (sid) localStorage.setItem('yt_tracker_session_id', sid);
  if (vid) localStorage.setItem('yt_tracker_video_id', vid);
  if (cid) localStorage.setItem('yt_tracker_campaign_id', cid);

  if (sid || vid || cid) {
    const clean = new URL(window.location.href);

    clean.searchParams.delete('vt_sid');
    clean.searchParams.delete('vt_vid');
    clean.searchParams.delete('vt_cid');

    window.history.replaceState({}, '', clean.toString());
  }
})();
<\/script>`;

const CHATGPT_HELP_PROMPT = `Help me install this tracking script into my website. Show me exactly where to place it in the <head> section. My website platform is: [INSERT PLATFORM NAME].`;

const GlobalWebsiteTrackingSection = () => {
  const [open, setOpen] = useState(false);

  const platforms = ['Webflow', 'WordPress', 'Framer', 'Wix', 'Shopify', 'Custom HTML'];

  return (
    <div className="border border-green-500/20 rounded-xl overflow-hidden bg-green-500/3">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-green-500/5 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <Globe size={13} className="text-green-400 shrink-0" />
          <div>
            <span className="text-[11px] font-black uppercase tracking-widest text-green-300">
              Global Website Tracking
            </span>
            <span className="block text-[9px] font-black uppercase tracking-widest text-zinc-500 mt-0.5">
              Persistent Attribution Infrastructure
            </span>
          </div>
          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/30 text-green-400">
            Required
          </span>
        </div>
        {open
          ? <ChevronUp size={13} className="text-zinc-500 shrink-0" />
          : <ChevronDown size={13} className="text-zinc-500 shrink-0" />
        }
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-green-500/15 p-4 space-y-4">

              {/* Description */}
              <div className="flex gap-3 p-3.5 bg-green-500/5 border border-green-500/15 rounded-xl">
                <Info size={13} className="text-green-400 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-[11px] text-zinc-300 leading-relaxed font-bold">
                    Install this once on your website to preserve visitor attribution across pages, funnels, embeds, and booking platforms.
                  </p>
                  <ul className="space-y-1">
                    {[
                      'Stores visitor attribution locally in the browser across page loads',
                      'Improves embedded Calendly and TidyCal tracking accuracy',
                      'Enables cross-page attribution in multi-step funnels',
                      'Must be installed on all funnel pages to preserve attribution across steps',
                    ].map(item => (
                      <li key={item} className="flex items-start gap-2 text-[11px] text-zinc-400 leading-relaxed">
                        <CheckCircle2 size={11} className="text-green-500 shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Script */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="label-caps text-green-400">Global Attribution Script</span>
                  <CopyButton text={GLOBAL_TRACKING_SCRIPT} label="Copy Script" />
                </div>
                <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-[11px] font-mono text-zinc-400 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
                  {GLOBAL_TRACKING_SCRIPT}
                </pre>
              </div>

              {/* Installation Instructions */}
              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                  <BookOpen size={11} /> Installation Instructions
                </p>
                <div className="space-y-2">
                  {[
                    { step: '1', title: 'Open your website builder or code editor', desc: 'Access your website settings or source code.' },
                    { step: '2', title: 'Paste inside the <head> section on all funnel pages', desc: 'Install this script on every page where visitors can enter or move through your funnel (Landing, Newsletter, Call, Consultation). This ensures attribution is never lost between steps.' },
                    { step: '3', title: 'Publish or save your changes', desc: 'The script is now active. It runs silently on every page load.' },
                  ].map(item => (
                    <div key={item.step} className="flex gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-xl">
                      <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-[9px] font-black text-zinc-400 flex items-center justify-center shrink-0">
                        {item.step}
                      </span>
                      <div>
                        <p className="text-[11px] font-bold text-white">{item.title}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Platform examples */}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Works with:</span>
                  {platforms.map(p => (
                    <span key={p} className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              {/* ChatGPT Help */}
              <div className="space-y-2 p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                  <MessageSquare size={11} /> Need Help Installing?
                </p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Copy this prompt and paste it into ChatGPT — it will walk you through the exact steps for your platform.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="label-caps text-zinc-500">ChatGPT Prompt</span>
                    <CopyButton text={CHATGPT_HELP_PROMPT} label="Copy Prompt" />
                  </div>
                  <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-[11px] font-mono text-zinc-400 leading-relaxed whitespace-pre-wrap break-all">
                    {CHATGPT_HELP_PROMPT}
                  </pre>
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

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
                      Landing page detected, but no checkout URL found yet. Add a checkout URL to your campaign.
                    </p>
                  </div>
                )}

                {funnelStates.purchase === 'active' && (
                  <div className="space-y-4">
                    {/* Method label */}
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Payment Method:</span>
                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
                        {purchaseMethod === 'stripe_checkout' ? 'Stripe Checkout' :
                         purchaseMethod === 'stripe_embedded' ? 'Stripe Embedded Checkout' :
                         purchaseMethod === 'embedded_alternative_payment' ? 'Embedded Alternative Payment' :
                         purchaseMethod === 'alternative_payment' ? 'Alternative Payment Method' :
                         purchaseMethod === 'external_platform' ? 'External Platform' :
                         'Payment Instructions Page'}
                      </span>
                    </div>

                    {/* stripe_checkout: redirect link + webhook */}
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

                    {/* stripe_embedded: webhook + optional intent pixel + confirmation pixel */}
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

                    {/* alternative_payment: redirect link + intent tracking + limitation notice */}
                    {purchaseMethod === 'alternative_payment' && (
                      <RedirectTrackingBlock
                        campaignId={campaign.id}
                        destinationUrl={campaign.checkout_url}
                        linkType="checkout"
                        eventLabel="Checkout"
                        limitationMessage="Without direct integration, we track visitor intent. For the best attribution accuracy, we recommend using your own website and embedding external tools inside your pages so VS-Track can track the full customer journey."
                      />
                    )}

                    {/* payment_instructions_page: redirect link + visitor intent only */}
                    {purchaseMethod === 'payment_instructions_page' && (
                      <RedirectTrackingBlock
                        campaignId={campaign.id}
                        destinationUrl={campaign.checkout_url}
                        linkType="checkout"
                        eventLabel="Payment Page"
                        limitationMessage="Without direct integration, we track visitor intent. For the best attribution accuracy, we recommend using your own website and embedding external tools inside your pages so VS-Track can track the full customer journey."
                      />
                    )}

                    {/* embedded_alternative_payment: confirmation pixel only.
                        Embedded delivery (PayPal embed, custom widget, etc).
                        No webhook (non-Stripe), no checkout intent pixel (embed pages not editable),
                        no redirect (embedded delivery). Uses direct purchase event type. */}
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

                    {/* external_platform: redirect tracking link + limitation notice.
                        Buyer intent only — no webhook, no confirmation tracking. */}
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
                      {/* Delivery method label */}
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Delivery:</span>
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
                          {salesCallDelivery === 'embedded_own_website' ? 'Embedded on Own Website' : 'External Platform'}
                        </span>
                      </div>

                      {expectedCallValue > 0 && (
                        <div className="flex items-center gap-3 p-3 bg-zinc-800/60 rounded-xl border border-zinc-700">
                          <Star size={13} className="text-yellow-400 shrink-0" />
                          <p className="text-[11px] text-zinc-400 leading-relaxed">
                            Expected revenue per booked call: <span className="text-white font-black">${expectedCallValue}</span>
                            <span className="text-zinc-600 ml-1">(${campaign.offer_price} × {campaign.estimated_close_rate}% close rate)</span>
                            {(campaign.average_upsell_value ?? 0) > 0 && (
                              <span className="text-zinc-500 ml-1">+ ${campaign.average_upsell_value} avg upsell</span>
                            )}
                          </p>
                        </div>
                      )}

                      {/* embedded_own_website: confirmation pixel + optional booking intent */}
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
                            amount={expectedCallValue || null}
                            thankyouUrl={campaign.sales_call_thankyou_url}
                            pendingMessage="No booking confirmation page URL detected yet."
                            activeInstruction="✅ Confirmation page detected. Paste this code on your booking confirmation page."
                          />
                        </div>
                      )}

                      {/* external_platform: redirect tracking link only */}
                      {salesCallDelivery === 'external_platform' && (
                        <RedirectTrackingBlock
                          campaignId={campaign.id}
                          destinationUrl={campaign.sales_call_booking_url}
                          linkType="booking"
                          eventLabel="Booking"
                          limitationMessage="Without direct integration, we track booking intent. Embedded widgets provide more accurate attribution. We recommend embedding booking tools on your own website whenever possible."
                        />
                      )}
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
                      {/* Delivery method label */}
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Delivery:</span>
                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
                          {consultationDelivery === 'own_website' ? 'Own Website' : 'External Platform'}
                        </span>
                      </div>

                      {/* ── Architecture C: external_platform ──────────────────────────────
                          Intent tracking via redirect. No pixel — code cannot be placed
                          on an external booking platform.
                          Redirect priority: booking URL → thankyou URL → no redirect.
                          linkType = 'external_platform_redirected' (intent only, not a conversion). */}
                      {consultationDelivery === 'external_platform' && (() => {
                        const archC = resolveConsultationArchCRedirect(campaign, consultationDelivery, consultationPaymentMethod);
                        return archC.redirectUrl ? (
                          <RedirectTrackingBlock
                            campaignId={campaign.id}
                            destinationUrl={archC.redirectUrl}
                            linkType={archC.linkType}
                            eventLabel={archC.eventLabel}
                            limitationMessage={archC.limitationMessage}
                          />
                        ) : (
                          /* No redirect possible — explain clearly rather than rendering a broken block */
                          <div className="flex gap-3 p-3.5 bg-zinc-800/40 border border-zinc-700/50 rounded-xl">
                            <Info size={12} className="text-zinc-500 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-zinc-500 leading-relaxed">{archC.limitationMessage}</p>
                          </div>
                        );
                      })()}

                      {/* own_website: branch by consultation_payment_method */}
                      {consultationDelivery === 'own_website' && (
                        <div className="space-y-3">
                          {/* Payment method label */}
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Payment Method:</span>
                            <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
                              {consultationPaymentMethod === 'stripe_checkout' ? 'Stripe Checkout Page' :
                               consultationPaymentMethod === 'stripe_embedded' ? 'Stripe Embedded Checkout' :
                               consultationPaymentMethod === 'embedded_alternative_payment' ? 'Embedded Alternative Payment' :
                               consultationPaymentMethod === 'alternative_payment' ? 'Alternative Payment Method' :
                               'Payment Instructions Page'}
                            </span>
                          </div>

                          {/* stripe_checkout: tracked redirect URL + Stripe webhook. No pixel — webhook confirms.
                              UNTOUCHED — Architecture A. */}
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

                          {/* stripe_embedded: Stripe webhook only. No redirect URL (embedded). No pixel — webhook confirms.
                              UNTOUCHED — Architecture A. */}
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

                          {/* embedded_alternative_payment: confirmation pixel only.
                              Embedded delivery (PayPal embed, Line Pay, custom widget).
                              No webhook (non-Stripe), no checkout intent pixel (embed pages not editable),
                              no redirect (embedded delivery).
                              UNTOUCHED — Architecture B. */}
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

                          {/* ── Architecture C: alternative_payment ────────────────────────────
                              Intent tracking via redirect (checkout_opened — NOT a confirmed event).
                              Redirect priority: checkout URL → thankyou URL → no redirect.
                              Optional confirmation pixel rendered below if thankyou URL exists. */}
                          {consultationPaymentMethod === 'alternative_payment' && (() => {
                            const archC = resolveConsultationArchCRedirect(campaign, consultationDelivery, consultationPaymentMethod);
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
                                    <p className="text-[11px] text-zinc-500 leading-relaxed">{archC.limitationMessage}</p>
                                  </div>
                                )}
                                {/* Optional confirmation pixel — only shown when thankyou URL exists.
                                    eventType = 'consultation_confirmed' is a confirmed event, intentionally
                                    separate from the redirect intent event above. */}
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

                          {/* ── Architecture C: payment_instructions_page ──────────────────────
                              Intent tracking via redirect (payment_instruction_viewed — NOT a confirmed event).
                              Redirect priority: checkout URL (instruction page) → thankyou URL → no redirect.
                              Optional confirmation pixel rendered below if thankyou URL exists. */}
                          {consultationPaymentMethod === 'payment_instructions_page' && (() => {
                            const archC = resolveConsultationArchCRedirect(campaign, consultationDelivery, consultationPaymentMethod);
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
                                    <p className="text-[11px] text-zinc-500 leading-relaxed">{archC.limitationMessage}</p>
                                  </div>
                                )}
                                {/* Optional confirmation pixel — only shown when thankyou URL exists. */}
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
              )}

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<CampaignExtended[]>([]);
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
    setCampaigns((camps ?? []) as CampaignExtended[]);
    setStripeConfig(stripeConf ?? null);
    setLoading(false);
  }, [user]);

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
