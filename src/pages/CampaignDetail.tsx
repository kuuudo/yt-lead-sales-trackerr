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
  CreditCard, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Reusable Stripe toggle component
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

// Get list of missing URLs for a campaign
const getMissingFields = (f: Partial<Campaign>): string[] => {
  const missing: string[] = [];
  if (!f.purchase_thankyou_url) missing.push('Purchase Thank You URL — needed for pixel tracking of confirmed purchases');
  if (!f.checkout_url) missing.push('Checkout URL — needed to generate your checkout tracking link');
  if (f.newsletter_url && !f.newsletter_thankyou_url) missing.push('Newsletter Thank You URL — needed to track newsletter signups');
  if (f.has_sales_call && !f.sales_call_booking_url) missing.push('Sales Call Booking URL');
  if (f.has_sales_call && !f.sales_call_thankyou_url) missing.push('Sales Call Thank You URL — needed to track booked calls');
  if (f.has_paid_consultation && !f.consultation_booking_url) missing.push('Consultation Booking URL');
  if (f.has_paid_consultation && !f.consultation_thankyou_url) missing.push('Consultation Thank You URL — needed to track confirmed consultations');
  return missing;
};

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

      // Show missing fields notice after save
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
              <p className="text-[11px] font-bold text-orange-400 uppercase tracking-widest">Campaign saved — but some URLs are missing</p>
              <p className="text-[11px] text-zinc-500">Tracking still works, but you'll get more accurate data by filling these in:</p>
              <ul className="space-y-1 mt-2">
                {missingAfterSave.map((m, i) => (
                  <li key={i} className="text-[11px] text-orange-300 flex items-start gap-2">
                    <span className="text-orange-500 mt-0.5">•</span> {m}
                  </li>
                ))}
              </ul>
              <p className="text-[10px] text-zinc-600 mt-2">The more data points you track, the better you can understand what's driving your business.</p>
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
                <div>
                  <label className="text-[9px] font-bold text-zinc-600 uppercase mb-1 block">Checkout URL</label>
                  <input type="url" value={formData.checkout_url || ''} onChange={e => setFormData({ ...formData, checkout_url: e.target.value })} className={inputClass} />
                </div>
                <StripeToggle
                  value={formData.uses_stripe ?? false}
                  onChange={v => setFormData({ ...formData, uses_stripe: v })}
                />
                <div>
                  <label className="text-[9px] font-bold text-zinc-600 uppercase mb-1 block">
                    Purchase Thank You URL
                    {!formData.purchase_thankyou_url && <span className="ml-2 text-orange-500">⚠ needed for pixel tracking</span>}
                  </label>
                  <input type="url" value={formData.purchase_thankyou_url || ''} onChange={e => setFormData({ ...formData, purchase_thankyou_url: e.target.value })} className={inputClass} />
                </div>
              </div>
            </div>
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
                  <input type="number" value={formData.estimated_close_rate} onChange={e => setFormData({ ...formData, estimated_close_rate: parseFloat(e.target.value) })} className="w-20 bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center text-xs text-white" />
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
                  <input type="number" value={formData.consultation_fee} onChange={e => setFormData({ ...formData, consultation_fee: parseFloat(e.target.value) })} className="w-20 bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-center text-xs text-white" />
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
