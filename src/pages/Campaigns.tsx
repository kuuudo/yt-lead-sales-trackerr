import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguage } from '../lib/hooks';
import { supabase, Campaign } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Plus, Globe, ChevronRight, DollarSign, Phone, Mail as MailIcon, Briefcase, Save, Loader2, Link2, Magnet, Trash2, AlertTriangle, CreditCard, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '../components/Modal';

export default function Campaigns() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'info' | 'danger' | 'success';
    onConfirm?: () => void;
  }>({ isOpen: false, title: '', message: '', variant: 'info' });

  const showAlert = (title: string, message: string, variant: 'info' | 'danger' | 'success' = 'info', onConfirm?: () => void) => {
    setModalConfig({ isOpen: true, title, message, variant, onConfirm });
  };

  const emptyForm = {
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
    // Conditional funnel configuration — determines tracking method per funnel
    purchase_method: 'stripe_checkout' as string,
    sales_call_delivery: 'external_platform' as string,
    average_upsell_value: 0,
    consultation_delivery: 'external_platform' as string,
    consultation_payment_method: 'stripe_checkout' as string,
  };

  const [formData, setFormData] = useState(emptyForm);

  // Track where the user came from so we can go back after save
  const [returnPath] = useState<string>(() => {
    return localStorage.getItem('campaign_form_return') || '/campaigns';
  });

  useEffect(() => {
    if (user) fetchCampaigns();
  }, [user]);

  const fetchCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) setCampaigns(data);
    } catch (err: any) {
      showAlert('Fetch Error', `Failed to fetch campaigns: ${err.message}`, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Warnings: collect incomplete fields before save
  const getWarnings = () => {
    const warnings: string[] = [];
    if (!formData.purchase_thankyou_url) warnings.push('Purchase Thank You URL is empty — pixel tracking for confirmed purchases will not work.');
    if (formData.has_sales_call && !formData.sales_call_thankyou_url) warnings.push('Sales Call Thank You URL is empty — sales call tracking will not work.');
    if (formData.has_paid_consultation && !formData.consultation_thankyou_url) warnings.push('Consultation Thank You URL is empty — consultation tracking will not work.');
    if (formData.has_paid_consultation && !formData.paid_consultation_checkout_url) warnings.push('Consultation Checkout URL is empty.');
    if (formData.newsletter_url && !formData.newsletter_thankyou_url) warnings.push('Newsletter Thank You URL is empty — newsletter tracking will not work.');
    return warnings;
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!user) return;
  await submitCampaign();
};

  const submitCampaign = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .insert([{ ...formData, user_id: user.id }])
        .select();
      if (error) throw new Error(`${error.message} — ${error.details}`);
      if (data) {
        setCampaigns([data[0], ...campaigns]);
        setShowAdd(false);
        setFormData(emptyForm);
        // Go back to where they came from
        const ret = localStorage.getItem('campaign_form_return');
        localStorage.removeItem('campaign_form_return');
        showAlert(
          'Campaign Created',
          'Your campaign has been created successfully.',
          'success',
          () => navigate(ret || `/campaigns/${data[0].id}`)
        );
      }
    } catch (err: any) {
      showAlert('Error', err.message, 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (campaign: Campaign) => {
    showAlert(
      'Delete Campaign',
      `Are you sure you want to delete "${campaign.campaign_name}"? This cannot be undone.`,
      'danger',
      async () => {
        setDeletingId(campaign.id);
        const { error } = await supabase.from('campaigns').delete().eq('id', campaign.id);
        setDeletingId(null);
        if (error) {
          showAlert('Delete Failed', error.message, 'danger');
        } else {
          setCampaigns(campaigns.filter(c => c.id !== campaign.id));
        }
      }
    );
  };

  const inputClass = "w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-[11px] font-mono text-zinc-400 outline-none focus:border-red-600 transition-all placeholder:text-zinc-700";
  const labelClass = "text-[10px] text-zinc-500 uppercase font-bold tracking-widest";

  const StripeToggle = ({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) => (
    <div className="flex items-center justify-between p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl">
      <div className="flex items-center gap-2">
        <CreditCard size={12} className={value ? 'text-violet-400' : 'text-zinc-600'} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{label}</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`w-10 h-5 rounded-full transition-all relative ${value ? 'bg-violet-600' : 'bg-zinc-700'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${value ? 'left-5' : 'left-0.5'}`} />
      </button>
    </div>
  );

  const warnings = getWarnings();

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Briefcase className="text-red-600" size={28} /> {t.campaigns.title}
          </h1>
          <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-1">Configure your revenue engine</p>
        </div>
        <button
          onClick={() => {
            localStorage.setItem('campaign_form_return', location.pathname);
            setShowAdd(!showAdd);
          }}
          className="flex items-center gap-2 bg-white hover:bg-zinc-200 text-zinc-950 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
        >
          {showAdd ? <><X size={14} /> Close</> : <><Plus size={16} /> {t.campaigns.create}</>}
        </button>
      </header>

      <AnimatePresence>
        {showAdd && (
          <motion.section
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bento-card border-zinc-800 bg-zinc-900/20"
          >
            <form onSubmit={handleSubmit} className="space-y-8">

              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="label-caps !text-white flex items-center gap-2">
                    <Globe size={14} className="text-zinc-500" /> Basic Info
                  </h3>
                  <div className="space-y-1">
                    <label className={labelClass}>Campaign Name</label>
                    <input
                      required
                      value={formData.campaign_name}
                      onChange={e => setFormData({ ...formData, campaign_name: e.target.value })}
                      className={inputClass}
                      placeholder="High Ticket Offer V1"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={labelClass}>Offer Price ($)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-3 text-zinc-600" size={16} />
                      <input
                        required
                        type="number"
                        value={formData.offer_price}
                        onChange={e => setFormData({ ...formData, offer_price: parseFloat(e.target.value) })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white outline-none focus:border-red-600 transition-all"
                        placeholder="997"
                      />
                    </div>
                  </div>
                </div>

                {/* Direct Purchase */}
                <div className="space-y-4">
                  <h3 className="label-caps !text-white flex items-center gap-2">
                    <Link2 size={14} className="text-zinc-500" /> Direct Purchase Path
                  </h3>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className={labelClass}>Payment Method</label>
                      <select value={formData.purchase_method} onChange={e => setFormData({ ...formData, purchase_method: e.target.value })} className={inputClass}>
                        <option value="stripe_checkout">Stripe Checkout</option>
                        <option value="stripe_embedded">Stripe Embedded Checkout</option>
                        <option value="embedded_alternative_payment">Embedded Alternative Payment</option>
                        <option value="alternative_payment">Alternative Payment Method</option>
                        <option value="payment_instructions_page">Payment Instructions Page</option>
                        <option value="external_platform">External Platform</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>Landing Page URL</label>
                      <input type="url" value={formData.landing_page_url} onChange={e => setFormData({ ...formData, landing_page_url: e.target.value })} placeholder="https://yoursite.com" className={inputClass} />
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>Checkout URL</label>
                      <input required type="url" value={formData.checkout_url} onChange={e => setFormData({ ...formData, checkout_url: e.target.value })} placeholder="https://buy.stripe.com/..." className={inputClass} />
                    </div>
                    <div className="space-y-1">
                      <label className={labelClass}>
                        Purchase Thank You URL
                        {!formData.purchase_thankyou_url && (
                          <span className="ml-2 text-orange-500">⚠ needed for pixel tracking</span>
                        )}
                      </label>
                      <input type="url" value={formData.purchase_thankyou_url} onChange={e => setFormData({ ...formData, purchase_thankyou_url: e.target.value })} placeholder="https://yoursite.com/thank-you" className={inputClass} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Newsletter, Lead Magnet, Sales Call, Consultation */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-8 border-t border-zinc-800">

                {/* Newsletter */}
                <div className="space-y-3">
                  <h3 className="label-caps flex items-center gap-2"><MailIcon size={14} /> Newsletter</h3>
                  <div className="space-y-2">
                    <input type="url" value={formData.newsletter_url} onChange={e => setFormData({ ...formData, newsletter_url: e.target.value })} placeholder="Signup Page URL" className={inputClass} />
                    <div className="space-y-1">
                      <label className={labelClass}>
                        Thank You URL
                        {formData.newsletter_url && !formData.newsletter_thankyou_url && (
                          <span className="ml-1 text-orange-500">⚠</span>
                        )}
                      </label>
                      <input type="url" value={formData.newsletter_thankyou_url} onChange={e => setFormData({ ...formData, newsletter_thankyou_url: e.target.value })} placeholder="Thank You Page URL" className={inputClass} />
                    </div>
                  </div>
                </div>

                {/* Lead Magnet */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="label-caps flex items-center gap-2"><Magnet size={14} /> Lead Magnet</h3>
                    <input type="checkbox" checked={formData.has_lead_magnet} onChange={e => setFormData({ ...formData, has_lead_magnet: e.target.checked })} className="accent-red-600" />
                  </div>
                  {formData.has_lead_magnet && (
                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                      <p className="text-[9px] text-zinc-500 font-bold uppercase">Configure magnets after saving</p>
                    </div>
                  )}
                </div>

                {/* Sales Call */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="label-caps flex items-center gap-2"><Phone size={14} /> Sales Call</h3>
                    <input type="checkbox" checked={formData.has_sales_call} onChange={e => setFormData({ ...formData, has_sales_call: e.target.checked })} className="accent-red-600" />
                  </div>
                  {formData.has_sales_call && (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className={labelClass}>Booking Delivery</label>
                        <select value={formData.sales_call_delivery} onChange={e => setFormData({ ...formData, sales_call_delivery: e.target.value })} className={inputClass}>
                          <option value="embedded_own_website">Embedded on Own Website</option>
                          <option value="external_platform">External Platform</option>
                        </select>
                      </div>
                      <input type="url" value={formData.sales_call_booking_url} onChange={e => setFormData({ ...formData, sales_call_booking_url: e.target.value })} placeholder="Booking URL" className={inputClass} />
                      <div className="space-y-1">
                        <label className={labelClass}>
                          Thank You URL
                          {!formData.sales_call_thankyou_url && <span className="ml-1 text-orange-500">⚠</span>}
                        </label>
                        <input type="url" value={formData.sales_call_thankyou_url} onChange={e => setFormData({ ...formData, sales_call_thankyou_url: e.target.value })} placeholder="Booking Success URL" className={inputClass} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={labelClass}>Close Rate</span>
                        <input type="number" value={formData.estimated_close_rate} onChange={e => setFormData({ ...formData, estimated_close_rate: parseFloat(e.target.value) })} className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 w-16 text-xs text-white outline-none" />
                        <span className="text-zinc-600 text-xs">%</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={labelClass}>Avg Upsell Value</span>
                        <input type="number" value={formData.average_upsell_value} onChange={e => setFormData({ ...formData, average_upsell_value: parseFloat(e.target.value) })} className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 w-20 text-xs text-white outline-none" />
                        <span className="text-zinc-600 text-xs">$</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Paid Consultation */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <h3 className="label-caps flex items-center gap-2"><Briefcase size={14} /> Paid Consultation</h3>
                    <input type="checkbox" checked={formData.has_paid_consultation} onChange={e => setFormData({ ...formData, has_paid_consultation: e.target.checked })} className="accent-red-600" />
                  </div>
                  {formData.has_paid_consultation && (
                    <div className="space-y-2">
                      <div className="space-y-1">
                        <label className={labelClass}>Delivery Method</label>
                        <select value={formData.consultation_delivery} onChange={e => setFormData({ ...formData, consultation_delivery: e.target.value })} className={inputClass}>
                          <option value="own_website">Own Website</option>
                          <option value="external_platform">External Platform</option>
                        </select>
                      </div>
                      <input type="url" value={formData.consultation_booking_url} onChange={e => setFormData({ ...formData, consultation_booking_url: e.target.value })} placeholder="Booking Page URL (TidyCal, Calendly...)" className={inputClass} />
                      {formData.consultation_delivery === 'own_website' && (
                        <>
                          <div className="space-y-1">
                            <label className={labelClass}>Payment Method</label>
                            <select value={formData.consultation_payment_method} onChange={e => setFormData({ ...formData, consultation_payment_method: e.target.value })} className={inputClass}>
                              <option value="stripe_checkout">Stripe Checkout Page</option>
                              <option value="stripe_embedded">Stripe Embedded Checkout</option>
                              <option value="embedded_alternative_payment">Embedded Alternative Payment</option>
                              <option value="alternative_payment">Alternative Payment Method</option>
                              <option value="payment_instructions_page">Payment Instructions Page</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className={labelClass}>Checkout / Payment URL</label>
                            <input type="url" value={formData.paid_consultation_checkout_url} onChange={e => setFormData({ ...formData, paid_consultation_checkout_url: e.target.value })} placeholder="Payment link URL" className={inputClass} />
                          </div>
                        </>
                      )}
                      <div className="space-y-1">
                        <label className={labelClass}>
                          Thank You URL
                          {!formData.consultation_thankyou_url && <span className="ml-1 text-orange-500">⚠</span>}
                        </label>
                        <input type="url" value={formData.consultation_thankyou_url} onChange={e => setFormData({ ...formData, consultation_thankyou_url: e.target.value })} placeholder="Booking Success / Thank You URL" className={inputClass} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={labelClass}>Fee</span>
                        <input type="number" value={formData.consultation_fee} onChange={e => setFormData({ ...formData, consultation_fee: parseFloat(e.target.value) })} className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 w-20 text-xs text-white outline-none" />
                        <span className="text-zinc-600 text-xs">$</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Warnings */}
              {warnings.length > 0 && (
                <div className="flex gap-3 p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                  <AlertTriangle size={14} className="text-orange-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    {warnings.map((w, i) => (
                      <p key={i} className="text-[11px] text-orange-400">{w}</p>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-6 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setFormData(emptyForm); }}
                  className="px-6 h-12 rounded-xl text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  disabled={saving}
                  type="submit"
                  className="bg-red-600 text-white px-8 h-12 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-red-500 transition-all shadow-[0_0_20px_rgba(220,38,38,0.2)]"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> Save Campaign</>}
                </button>
              </div>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Campaign Cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bento-card h-40 animate-pulse bg-zinc-900/50" />
          ))
        ) : campaigns.length === 0 ? (
          <div className="col-span-full py-20 text-center space-y-4 border-2 border-dashed border-zinc-900 rounded-3xl">
            <div className="w-16 h-16 bg-zinc-900 rounded-full mx-auto flex items-center justify-center">
              <Briefcase className="text-zinc-700" />
            </div>
            <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest">No campaigns yet</p>
          </div>
        ) : (
          campaigns.map(c => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bento-card group hover:border-zinc-700 transition-all p-6 cursor-pointer relative"
              onClick={() => navigate(`/campaigns/${c.id}`)}
            >
              {/* Delete button */}
              <button
                onClick={e => { e.stopPropagation(); handleDelete(c); }}
                className="absolute top-4 right-4 w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-600 hover:text-red-500 hover:border-red-500/30 transition-all opacity-0 group-hover:opacity-100"
              >
                {deletingId === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              </button>

              <div className="flex justify-between items-start mb-4 pr-8">
                <h3 className="text-lg font-bold text-white leading-tight">{c.campaign_name}</h3>
                <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded-md shrink-0">
                  {c.id.slice(0, 4)}
                </span>
              </div>

              <div className="space-y-2 mb-6">
                <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-bold uppercase">
                  <DollarSign size={12} className="text-red-500" />
                  Offer: <span className="text-zinc-300 ml-auto">${c.offer_price}</span>
                </div>
                {(c as any).uses_stripe && (
                  <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-bold uppercase">
                    <CreditCard size={12} className="text-violet-400" />
                    <span className="text-violet-400">Stripe Connected</span>
                  </div>
                )}
                {c.has_sales_call && (
                  <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-bold uppercase">
                    <Phone size={12} className="text-blue-500" />
                    Sales Call: <span className="text-zinc-300 ml-auto">{c.estimated_close_rate}% Close</span>
                  </div>
                )}
                {c.has_paid_consultation && (
                  <div className="flex items-center gap-2 text-zinc-500 text-[10px] font-bold uppercase">
                    <Briefcase size={12} className="text-purple-500" />
                    Consultation: <span className="text-zinc-300 ml-auto">${c.consultation_fee}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-zinc-900 flex justify-between items-center">
                <div className="flex gap-1.5">
                  {c.newsletter_url && <MailIcon size={12} className="text-zinc-600" />}
                  {c.has_sales_call && <Phone size={12} className="text-zinc-600" />}
                  {c.has_paid_consultation && <Briefcase size={12} className="text-zinc-600" />}
                </div>
                <button className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white flex items-center gap-1 group/btn">
                  View Funnel <ChevronRight size={12} className="group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </section>

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
        title={modalConfig.title}
        message={modalConfig.message}
        variant={modalConfig.variant}
        onConfirm={modalConfig.onConfirm}
      />
    </div>
  );
}
