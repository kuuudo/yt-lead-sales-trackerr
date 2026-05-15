import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useLanguage } from '../lib/hooks';
import { supabase, Campaign, LeadMagnet } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { 
  ArrowLeft, Save, Trash2, Plus, 
  Loader2, AlertCircle, 
  CheckCircle2, Globe, Magnet, 
  Phone, DollarSign, MousePointer2,
  CreditCard, AlertTriangle, ShoppingCart, Receipt, ChevronDown, ChevronUp, Copy, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ---------------------------------------------------------------------------
// Tracking level helpers
// ---------------------------------------------------------------------------

type TrackingLevel = 'click' | 'intent' | 'purchase' | 'full';

function getTrackingLevel(f: Partial<Campaign>): TrackingLevel {
  const hasCheckout = !!f.checkout_url;
  const hasPurchase = !!f.purchase_thankyou_url || !!f.uses_stripe;
  if (hasCheckout && hasPurchase) return 'full';
  if (hasPurchase) return 'purchase';
  if (hasCheckout) return 'intent';
  return 'click';
}

const TRACKING_META: Record<TrackingLevel, { label: string; color: string; bg: string; border: string; icon: string; description: string }> = {
  click: {
    label: 'Click Tracking Only',
    color: 'text-zinc-400',
    bg: 'bg-zinc-800/60',
    border: 'border-zinc-700',
    icon: '🖱️',
    description: 'Sessions and clicks are tracked. Add a Checkout URL or Thank You URL to unlock deeper funnel visibility.',
  },
  intent: {
    label: 'Intent Tracking',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: '🟡',
    description: 'Checkout visits are tracked. Install the checkout pixel to capture intent. Add a Thank You URL or Stripe to track confirmed purchases.',
  },
  purchase: {
    label: 'Purchase Tracking',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    icon: '🟢',
    description: 'Confirmed purchases are tracked. Optionally add a Checkout URL to also capture mid-funnel intent.',
  },
  full: {
    label: 'Full Funnel Visibility',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    icon: '🔵',
    description: 'Click → Intent → Purchase — all three funnel stages are tracked.',
  },
};

// ---------------------------------------------------------------------------
// Pixel snippet generators
// ---------------------------------------------------------------------------

function getCheckoutPixelSnippet(campaignId: string | undefined, videoId?: string): string {
  const idParam = videoId ? `video_id: '${videoId}'` : `campaign_id: '${campaignId ?? 'YOUR_CAMPAIGN_ID'}'`;
  return `<!-- Checkout Intent Pixel — paste on your CHECKOUT page -->
<!-- Tracks that a visitor reached checkout. Does NOT confirm payment. -->
<script>
  fetch('https://your-app.vercel.app/api/pixel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ${idParam},
      event_type: 'checkout_intent',
      amount: 0
    })
  });
</script>`;
}

function getPurchasePixelSnippet(campaignId: string | undefined, offerPrice: number | undefined, videoId?: string): string {
  const idParam = videoId ? `video_id: '${videoId}'` : `campaign_id: '${campaignId ?? 'YOUR_CAMPAIGN_ID'}'`;
  const amt = offerPrice ?? 0;
  return `<!-- Purchase Pixel — paste on your THANK YOU page -->
<!-- Tracks confirmed completed purchases and revenue. -->
<script>
  fetch('https://your-app.vercel.app/api/pixel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ${idParam},
      event_type: 'purchase',
      amount: ${amt}
    })
  });
</script>`;
}

// ---------------------------------------------------------------------------
// Reusable components
// ---------------------------------------------------------------------------

const StripeToggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
  <div className="space-y-2">
    <div className="flex items-center justify-between p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl">
      <div className="flex items-center gap-2">
        <CreditCard size={12} className={value ? 'text-violet-400' : 'text-zinc-600'} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Using Stripe for this checkout?</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`w-10 h-5 rounded-full transition-all relative ${value ? 'bg-violet-600' : 'bg-zinc-700'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
    <p className="text-[10px] text-zinc-600 leading-relaxed px-1">
      {value
        ? '✅ Stripe enabled — confirmed revenue will be tracked via webhook.'
        : 'No Stripe? No problem. Tracking still works via pixel. Stripe just adds confirmed revenue data on top.'}
    </p>
  </div>
);

// Copy-to-clipboard code block
const CodeSnippet = ({ code, label, sublabel, accent }: { code: string; label: string; sublabel: string; accent: 'amber' | 'green' }) => {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const accentClasses = accent === 'amber'
    ? { badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30', btn: 'bg-amber-600 hover:bg-amber-700', border: 'border-amber-500/20' }
    : { badge: 'bg-green-500/15 text-green-400 border-green-500/30', btn: 'bg-green-700 hover:bg-green-800', border: 'border-green-500/20' };

  return (
    <div className={`rounded-xl border ${accentClasses.border} bg-zinc-950 overflow-hidden`}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${accentClasses.badge}`}>{label}</span>
          <span className="text-[10px] text-zinc-500">{sublabel}</span>
        </div>
        <button
          type="button"
          onClick={copy}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-[10px] font-bold transition-all ${accentClasses.btn}`}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-[10px] font-mono text-zinc-400 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
        {code}
      </pre>
    </div>
  );
};

// Collapsible pixel panel
const PixelPanel = ({
  title,
  icon: Icon,
  iconColor,
  defaultOpen,
  children,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-zinc-800 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-zinc-900/60 hover:bg-zinc-900 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Icon size={14} className={iconColor} />
          <span className="text-[11px] font-bold text-zinc-300">{title}</span>
        </div>
        {open ? <ChevronUp size={14} className="text-zinc-500" /> : <ChevronDown size={14} className="text-zinc-500" />}
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
            <div className="p-4 space-y-3 border-t border-zinc-800/60">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------------------------------------------------------------------------
// getMissingFields — purchase URL now only advisory, not a blocker
// ---------------------------------------------------------------------------

const getMissingFields = (f: Partial<Campaign>): string[] => {
  const missing: string[] = [];
  if (!f.checkout_url) missing.push('Checkout URL — needed to generate your checkout tracking link');
  if (f.newsletter_url && !f.newsletter_thankyou_url) missing.push('Newsletter Thank You URL — needed to track newsletter signups');
  if (f.has_sales_call && !f.sales_call_booking_url) missing.push('Sales Call Booking URL');
  if (f.has_sales_call && !f.sales_call_thankyou_url) missing.push('Sales Call Thank You URL — needed to track booked calls');
  if (f.has_paid_consultation && !f.consultation_booking_url) missing.push('Consultation Booking URL');
  if (f.has_paid_consultation && !f.consultation_thankyou_url) missing.push('Consultation Thank You URL — needed to track confirmed consultations');
  // Advisory — not a hard blocker
  if (!f.purchase_thankyou_url && !f.uses_stripe) {
    missing.push('Purchase Thank You URL (or Stripe webhook) — recommended for confirmed purchase tracking');
  }
  return missing;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [missingAfterSave, setMissingAfterSave] = useState<string[]>([]);

  const [formData, setFormData] = useState<Partial<Campaign>>({
    campaign_name: '',
    landing_page_url: '',
    newsletter_url: '',
    newsletter_thankyou_url: '',
    checkout_url: '',
    purchase_thankyou_url: '',
    offer_price: 0,
    uses_stripe: false,
    has_sales_call: false,
    sales_call_booking_url: '',
    sales_call_thankyou_url: '',
    estimated_close_rate: 0,
    has_paid_consultation: false,
    consultation_booking_url: '',
    paid_consultation_checkout_url: '',
    consultation_thankyou_url: '',
    consultation_fee: 0,
    uses_stripe_consultation: false,
    has_lead_magnet: false,
  });

  const [leadMagnets, setLeadMagnets] = useState<Partial<LeadMagnet>[]>([]);

  useEffect(() => {
    if (user && id) fetchCampaignData();
  }, [user, id]);

  const fetchCampaignData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: campaign, error: cErr } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', id)
        .single();

      if (cErr) throw cErr;
      if (campaign) setFormData(campaign);

      const { data: magnets, error: mErr } = await supabase
        .from('lead_magnets')
        .select('*')
        .eq('campaign_id', id);

      if (mErr) throw mErr;
      setLeadMagnets(magnets || []);

    } catch (err: any) {
      setError(err.message || 'Failed to load campaign data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !id) return;

    setSaving(true);
    setError(null);
    setSuccess(false);
    setMissingAfterSave([]);

    try {
      const { error: updateErr } = await supabase
        .from('campaigns')
        .update({
          campaign_name: formData.campaign_name,
          landing_page_url: formData.landing_page_url,
          newsletter_url: formData.newsletter_url,
          newsletter_thankyou_url: formData.newsletter_thankyou_url,
          checkout_url: formData.checkout_url,
          purchase_thankyou_url: formData.purchase_thankyou_url,
          offer_price: formData.offer_price,
          uses_stripe: formData.uses_stripe ?? false,
          has_sales_call: formData.has_sales_call,
          sales_call_booking_url: formData.sales_call_booking_url,
          sales_call_thankyou_url: formData.sales_call_thankyou_url,
          estimated_close_rate: formData.estimated_close_rate,
          has_paid_consultation: formData.has_paid_consultation,
          consultation_booking_url: formData.consultation_booking_url,
          paid_consultation_checkout_url: formData.paid_consultation_checkout_url,
          consultation_thankyou_url: formData.consultation_thankyou_url,
          consultation_fee: formData.consultation_fee,
          uses_stripe_consultation: formData.uses_stripe_consultation ?? false,
          has_lead_magnet: formData.has_lead_magnet,
        })
        .eq('id', id);

      if (updateErr) throw updateErr;

      // Handle lead magnets
      try {
        await supabase.from('lead_magnets').delete().eq('campaign_id', id);
        if (formData.has_lead_magnet && leadMagnets.length > 0) {
          const magnetsToSave = leadMagnets.map(m => ({
            campaign_id: id,
            lead_magnet_name: m.lead_magnet_name,
            lead_magnet_url: m.lead_magnet_url,
            lead_magnet_thankyou_url: m.lead_magnet_thankyou_url,
          }));
          const { error: insertErr } = await supabase.from('lead_magnets').insert(magnetsToSave);
          if (insertErr) throw insertErr;
        }
      } catch (err) {
        console.error('Lead Magnet Sync Error:', err);
      }

      const missing = getMissingFields(formData);
      setMissingAfterSave(missing);
      setSuccess(true);
      setTimeout(() => setSuccess(false), missing.length > 0 ? 10000 : 3000);
      await fetchCampaignData();

    } catch (err: any) {
      setError(err.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const addLeadMagnet = () => {
    setLeadMagnets([...leadMagnets, { lead_magnet_name: '', lead_magnet_url: '', lead_magnet_thankyou_url: '' }]);
  };

  const removeLeadMagnet = (index: number) => {
    const newList = [...leadMagnets];
    newList.splice(index, 1);
    setLeadMagnets(newList);
  };

  const updateLeadMagnet = (index: number, field: keyof LeadMagnet, value: string) => {
    const newList = [...leadMagnets];
    newList[index] = { ...newList[index], [field]: value };
    setLeadMagnets(newList);
  };

  const inputClass = "w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-[11px] font-mono text-zinc-400 outline-none focus:border-red-600 transition-all";

  // Derived tracking state
  const trackingLevel = getTrackingLevel(formData);
  const trackingMeta = TRACKING_META[trackingLevel];

  // Pixel snippets
  const checkoutSnippet = getCheckoutPixelSnippet(id);
  const purchaseSnippet = getPurchasePixelSnippet(id, formData.offer_price);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-red-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto pb-20">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/campaigns" className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 hover:text-white transition-all">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-white">{formData.campaign_name || 'Campaign Detail'}</h1>
            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest mt-1">Configure your conversion funnel intelligence</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <AnimatePresence>
            {success && (
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-2 text-green-500 text-[10px] font-black uppercase"
              >
                <CheckCircle2 size={14} /> Saved
              </motion.div>
            )}
          </AnimatePresence>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white text-[11px] font-black uppercase rounded-xl hover:bg-red-700 transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="bg-red-600/10 border border-red-600/20 rounded-2xl p-4 flex items-center gap-3 text-red-500 text-xs font-bold">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {/* Tracking Status Banner */}
      <div className={`flex items-start gap-4 p-5 rounded-2xl border ${trackingMeta.bg} ${trackingMeta.border}`}>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-base leading-none">{trackingMeta.icon}</span>
            <span className={`text-[11px] font-black uppercase tracking-widest ${trackingMeta.color}`}>{trackingMeta.label}</span>
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed">{trackingMeta.description}</p>

          {/* Funnel stage pills */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {[
              { key: 'click', label: 'Click Tracking', always: true },
              { key: 'intent', label: 'Intent Tracking', always: false },
              { key: 'purchase', label: 'Purchase Tracking', always: false },
            ].map(stage => {
              const levels: TrackingLevel[] = ['click', 'intent', 'purchase', 'full'];
              const stageIndex = stage.key === 'click' ? 0 : stage.key === 'intent' ? 1 : 2;
              const currentIndex = levels.indexOf(trackingLevel);
              // click = always active; intent = active if level is intent or full; purchase = active if level is purchase or full
              const active = stage.key === 'click'
                ? true
                : stage.key === 'intent'
                  ? trackingLevel === 'intent' || trackingLevel === 'full'
                  : trackingLevel === 'purchase' || trackingLevel === 'full';
              return (
                <span
                  key={stage.key}
                  className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border transition-all ${
                    active
                      ? 'bg-zinc-700 border-zinc-600 text-zinc-200'
                      : 'bg-transparent border-zinc-800 text-zinc-600'
                  }`}
                >
                  {active ? '✓' : '○'} {stage.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Post-save missing fields notice */}
      <AnimatePresence>
        {success && missingAfterSave.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex gap-3 p-5 bg-orange-500/5 border border-orange-500/20 rounded-2xl"
          >
            <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-[11px] font-bold text-orange-400 uppercase tracking-widest">Campaign saved — a few things worth adding</p>
              <p className="text-[11px] text-zinc-500">Your current tracking level is <span className={`font-bold ${trackingMeta.color}`}>{trackingMeta.label}</span>. Fill these in to unlock deeper visibility:</p>
              <ul className="space-y-1 mt-2">
                {missingAfterSave.map((m, i) => (
                  <li key={i} className="text-[11px] text-orange-300 flex items-start gap-2">
                    <span className="text-orange-500 mt-0.5">•</span> {m}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-zinc-600 mt-2">The more funnel stages you track, the better you understand what's driving revenue.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSave} className="space-y-8">

        {/* Main Campaign & Funnel */}
        <section className="bento-card p-8">
          <div className="flex items-center gap-4 mb-8">
            <Globe className="text-red-600" size={24} />
            <h2 className="text-lg font-black text-white uppercase tracking-tight">Main Campaign & Funnel</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <label className="label-caps mb-2 block">Campaign Name</label>
                <input 
                  required 
                  value={formData.campaign_name} 
                  onChange={e => setFormData({ ...formData, campaign_name: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-white focus:border-red-600 outline-none" 
                />
              </div>
              <div>
                <label className="label-caps mb-2 block">Offer Price ($)</label>
                <input 
                  required 
                  type="number" 
                  value={formData.offer_price} 
                  onChange={e => setFormData({ ...formData, offer_price: parseFloat(e.target.value) })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-white focus:border-red-600 outline-none" 
                />
              </div>
            </div>

            <div className="space-y-4 bg-zinc-950/50 p-6 rounded-2xl border border-zinc-900">
              <h3 className="text-[10px] font-black uppercase text-zinc-500 tracking-widest mb-4">Direct Purchase Path</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] font-bold text-zinc-600 uppercase mb-1 block">Landing Page URL</label>
                  <input type="url" value={formData.landing_page_url || ''} onChange={e => setFormData({ ...formData, landing_page_url: e.target.value })} className={inputClass} />
                </div>

                {/* Checkout URL + optional intent pixel */}
                <div>
                  <label className="text-[9px] font-bold text-zinc-600 uppercase mb-1 block">Checkout URL</label>
                  <input
                    type="url"
                    value={formData.checkout_url || ''}
                    onChange={e => setFormData({ ...formData, checkout_url: e.target.value })}
                    className={inputClass}
                  />
                </div>

                <StripeToggle
                  value={formData.uses_stripe ?? false}
                  onChange={v => setFormData({ ...formData, uses_stripe: v })}
                />

                {/* Purchase Thank You URL */}
                <div>
                  <label className="text-[9px] font-bold text-zinc-600 uppercase mb-1 flex items-center gap-2">
                    <span>Purchase Thank You URL</span>
                    {!formData.purchase_thankyou_url && !formData.uses_stripe && (
                      <span className="text-amber-500 normal-case font-normal">⚠ recommended for purchase tracking</span>
                    )}
                    {(formData.purchase_thankyou_url || formData.uses_stripe) && (
                      <span className="text-green-500 normal-case font-normal">✓ purchase tracking active</span>
                    )}
                  </label>
                  <input type="url" value={formData.purchase_thankyou_url || ''} onChange={e => setFormData({ ...formData, purchase_thankyou_url: e.target.value })} className={inputClass} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pixel Installation */}
        <section className="bento-card p-8">
          <div className="flex items-center gap-4 mb-2">
            <Receipt className="text-violet-400" size={24} />
            <h2 className="text-lg font-black text-white uppercase tracking-tight">Pixel Installation</h2>
          </div>
          <p className="text-[11px] text-zinc-500 mb-6 leading-relaxed">
            Install these snippets on your funnel pages to unlock deeper tracking. Each pixel fires a single background request — no page-load impact.
          </p>

          <div className="space-y-3">
            {/* Checkout Intent Pixel */}
            <PixelPanel
              title="Checkout Pixel"
              icon={ShoppingCart}
              iconColor="text-amber-400"
              defaultOpen={!formData.purchase_thankyou_url && !formData.uses_stripe}
            >
              <div className="flex items-start gap-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg mb-3">
                <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-300/80 leading-relaxed">
                  <span className="font-bold">Intent tracking only.</span> This pixel records that a visitor reached your checkout page. It does <span className="font-bold">not</span> confirm that payment was completed.
                </p>
              </div>
              {formData.checkout_url ? (
                <CodeSnippet
                  code={checkoutSnippet}
                  label="Optional"
                  sublabel="Paste on your checkout page"
                  accent="amber"
                />
              ) : (
                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg text-[10px] text-zinc-500">
                  Add a Checkout URL above to generate this snippet.
                </div>
              )}
            </PixelPanel>

            {/* Purchase / Thank-you Pixel */}
            <PixelPanel
              title="Thank You Page Pixel"
              icon={CheckCircle2}
              iconColor="text-green-400"
              defaultOpen={!formData.purchase_thankyou_url && !formData.uses_stripe}
            >
              <div className="flex items-start gap-2 p-3 bg-green-500/5 border border-green-500/20 rounded-lg mb-3">
                <CheckCircle2 size={12} className="text-green-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-green-300/80 leading-relaxed">
                  <span className="font-bold">Confirms completed purchases.</span> Install this pixel on the page shown only after a successful payment. This is what drives revenue figures in your dashboard.
                </p>
              </div>

              {formData.uses_stripe ? (
                <div className="p-3 bg-violet-500/10 border border-violet-500/20 rounded-lg text-[10px] text-violet-300">
                  ✅ <span className="font-bold">Stripe webhook active</span> — confirmed purchases are tracked automatically. You don't need this pixel unless you want redundant tracking.
                </div>
              ) : null}

              <CodeSnippet
                code={purchaseSnippet}
                label="Recommended"
                sublabel="Tracks confirmed completed purchases"
                accent="green"
              />

              {!formData.purchase_thankyou_url && !formData.uses_stripe && (
                <p className="text-[10px] text-zinc-600 leading-relaxed pt-1">
                  💡 No thank you page? You can still install the <span className="text-amber-400 font-bold">Checkout Pixel</span> above for intent tracking, and upgrade to purchase tracking later when you add a thank you page or connect Stripe.
                </p>
              )}
            </PixelPanel>
          </div>
        </section>

        {/* Lead Magnets & Newsletter */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="bento-card p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <Magnet className="text-blue-500" size={24} />
                <h2 className="text-lg font-black text-white uppercase tracking-tight">Lead Magnets</h2>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={formData.has_lead_magnet} onChange={e => setFormData({ ...formData, has_lead_magnet: e.target.checked })} />
                <div className="w-11 h-6 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <AnimatePresence>
              {formData.has_lead_magnet && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-6 overflow-hidden">
                  <div className="space-y-6">
                    {leadMagnets.map((lm, idx) => (
                      <div key={idx} className="p-4 bg-zinc-950 border border-zinc-900 rounded-2xl relative group">
                        <button type="button" onClick={() => removeLeadMagnet(idx)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                          <Trash2 size={12} />
                        </button>
                        <div className="space-y-3">
                          <input placeholder="Lead Magnet Name" value={lm.lead_magnet_name} onChange={e => updateLeadMagnet(idx, 'lead_magnet_name', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-white" />
                          <input placeholder="Landing Page URL" value={lm.lead_magnet_url} onChange={e => updateLeadMagnet(idx, 'lead_magnet_url', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-[10px] font-mono" />
                          <input placeholder="Thank You Page URL" value={lm.lead_magnet_thankyou_url} onChange={e => updateLeadMagnet(idx, 'lead_magnet_thankyou_url', e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-[10px] font-mono" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addLeadMagnet} className="w-full py-3 border border-dashed border-zinc-800 rounded-xl text-[10px] font-black uppercase text-zinc-500 hover:text-white transition-all flex items-center justify-center gap-2">
                    <Plus size={14} /> Add Another Lead Magnet
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
            
            {!formData.has_lead_magnet && (
              <div className="py-12 text-center">
                <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Lead magnet system disabled</p>
              </div>
            )}
          </section>

          <section className="bento-card p-8">
            <div className="flex items-center gap-4 mb-8">
              <MousePointer2 className="text-orange-500" size={24} />
              <h2 className="text-lg font-black text-white uppercase tracking-tight">Main Newsletter</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-bold text-zinc-600 uppercase mb-1 block">Newsletter Signup URL</label>
                <input type="url" value={formData.newsletter_url || ''} onChange={e => setFormData({ ...formData, newsletter_url: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="text-[9px] font-bold text-zinc-600 uppercase mb-1 block">
                  Newsletter Thank You URL
                  {formData.newsletter_url && !formData.newsletter_thankyou_url && <span className="ml-2 text-orange-500">⚠</span>}
                </label>
                <input type="url" value={formData.newsletter_thankyou_url || ''} onChange={e => setFormData({ ...formData, newsletter_thankyou_url: e.target.value })} className={inputClass} />
              </div>
            </div>
          </section>
        </div>

        {/* Sales Call & Consultation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <section className="bento-card p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <Phone className="text-purple-500" size={24} />
                <h2 className="text-lg font-black text-white uppercase tracking-tight">Sales Call Funnel</h2>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={formData.has_sales_call} onChange={e => setFormData({ ...formData, has_sales_call: e.target.checked })} />
                <div className="w-11 h-6 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
              </label>
            </div>

            {formData.has_sales_call && (
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-bold text-zinc-600 uppercase mb-1 block">Booking Page URL</label>
                  <input type="url" value={formData.sales_call_booking_url || ''} onChange={e => setFormData({ ...formData, sales_call_booking_url: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-zinc-600 uppercase mb-1 block">
                    Call Success / Thank You URL
                    {formData.has_sales_call && !formData.sales_call_thankyou_url && <span className="ml-2 text-orange-500">⚠</span>}
                  </label>
                  <input type="url" value={formData.sales_call_thankyou_url || ''} onChange={e => setFormData({ ...formData, sales_call_thankyou_url: e.target.value })} className={inputClass} />
                </div>
                <div className="flex items-center justify-between p-4 bg-zinc-950 rounded-xl border border-zinc-900">
                  <span className="text-[10px] font-black uppercase text-zinc-500">Estimated Close Rate (%)</span>
                  <input type="number" value={formData.estimated_close_rate ?? ""} onChange={e => setFormData({ ...formData, estimated_close_rate: parseFloat(e.target.value) })} className="w-20 bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center text-xs text-white" />
                </div>
              </div>
            )}
          </section>

          <section className="bento-card p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <DollarSign className="text-green-500" size={24} />
                <h2 className="text-lg font-black text-white uppercase tracking-tight">Paid Consultation</h2>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={formData.has_paid_consultation} onChange={e => setFormData({ ...formData, has_paid_consultation: e.target.checked })} />
                <div className="w-11 h-6 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"></div>
              </label>
            </div>

            {formData.has_paid_consultation && (
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-bold text-zinc-600 uppercase mb-1 block">Booking Page URL (TidyCal, Calendly...)</label>
                  <input type="url" value={formData.consultation_booking_url || ''} onChange={e => setFormData({ ...formData, consultation_booking_url: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-zinc-600 uppercase mb-1 block">
                    Checkout / Payment URL
                    <span className="ml-2 text-zinc-600 normal-case font-normal">(skip if payment is on booking page)</span>
                  </label>
                  <input type="url" value={formData.paid_consultation_checkout_url || ''} onChange={e => setFormData({ ...formData, paid_consultation_checkout_url: e.target.value })} placeholder="Optional — leave blank if embedded" className={inputClass} />
                </div>
                <StripeToggle
                  value={formData.uses_stripe_consultation ?? false}
                  onChange={v => setFormData({ ...formData, uses_stripe_consultation: v })}
                />
                <div>
                  <label className="text-[9px] font-bold text-zinc-600 uppercase mb-1 block">
                    Consultation Thank You URL
                    {formData.has_paid_consultation && !formData.consultation_thankyou_url && <span className="ml-2 text-orange-500">⚠</span>}
                  </label>
                  <input type="url" value={formData.consultation_thankyou_url || ''} onChange={e => setFormData({ ...formData, consultation_thankyou_url: e.target.value })} className={inputClass} />
                </div>
                <div className="flex items-center justify-between p-4 bg-zinc-950 rounded-xl border border-zinc-900">
                  <span className="text-[10px] font-black uppercase text-zinc-500">Consultation Fee ($)</span>
                  <input type="number" value={formData.consultation_fee ?? ""} onChange={e => setFormData({ ...formData, consultation_fee: parseFloat(e.target.value) })} className="w-20 bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center text-xs text-white" />
                </div>
                <div className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl">
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    💡 If payment is embedded in your booking page (e.g. Payhip, TidyCal), skip the Checkout URL. Revenue tracking via the Thank You page pixel still works — you'll just have one less funnel step to analyze.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>

      </form>
    </div>
  );
}
