import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../lib/hooks';
import { supabase, Campaign } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { Plus, Globe, ChevronRight, DollarSign, Phone, Mail as MailIcon, Briefcase, Save, Loader2, Link2, Magnet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '../components/Modal';

export default function Campaigns() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'info' | 'danger' | 'success';
    onConfirm?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'info'
  });

  const showAlert = (title: string, message: string, variant: 'info' | 'danger' | 'success' = 'info', onConfirm?: () => void) => {
    setModalConfig({ isOpen: true, title, message, variant, onConfirm });
  };

  const [formData, setFormData] = useState({
    campaign_name: '',
    landing_page_url: '',
    newsletter_url: '',
    newsletter_thankyou_url: '',
    checkout_url: '',
    purchase_thankyou_url: '',
    offer_price: 0,
    has_sales_call: false,
    sales_call_booking_url: '',
    sales_call_thankyou_url: '',
    estimated_close_rate: 0,
    has_paid_consultation: false,
    consultation_booking_url: '',
    consultation_thankyou_url: '',
    consultation_fee: 0,
    has_lead_magnet: false,
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
      console.error('Error fetching campaigns:', err);
      showAlert('Fetch Error', `Failed to fetch campaigns: ${err.message || 'Unknown error'}`, 'danger');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    
    try {
      // Ensure all fields are mapped correctly for the insert
      const payload = {
        ...formData,
        user_id: user.id
      };
      
      const { data, error } = await supabase.from('campaigns').insert([payload]).select();
      if (error) {
        console.error('Supabase Campaign Insert Error Full Object:', error);
        throw new Error(`[Supabase Error] ${error.message}\nCode: ${error.code}\nDetails: ${error.details}\nHint: ${error.hint}`);
      }
      
      if (data) {
        setCampaigns([data[0], ...campaigns]);
        setShowAdd(false);
        showAlert('Campaign Created', 'Your new campaign has been successfully initialized.', 'success', () => navigate(`/campaigns/${data[0].id}`));
      }
    } catch (err: any) {
      showAlert('Campaign Error', err.message || 'An unexpected error occurred.', 'danger');
    } finally {
      setSaving(false);
    }
  };

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
          onClick={() => setShowAdd(!showAdd)} 
          className="flex items-center gap-2 bg-white hover:bg-zinc-200 text-zinc-950 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
        >
          {showAdd ? 'Close' : <><Plus size={16} /> {t.campaigns.create}</>}
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
              {/* Basic Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <h3 className="label-caps !text-white flex items-center gap-2">
                    <Globe size={14} className="text-zinc-500" /> {t.campaigns.form.basic}
                  </h3>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-500 uppercase font-bold">Campaign Name</label>
                    <input 
                      required 
                      value={formData.campaign_name} 
                      onChange={e => setFormData({ ...formData, campaign_name: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:border-red-600 outline-none transition-all" 
                      placeholder="High Ticket Offer V1" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-zinc-500 uppercase font-bold">Offer Price ($)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-3 text-zinc-600" size={16} />
                      <input 
                        required 
                        type="number"
                        value={formData.offer_price} 
                        onChange={e => setFormData({ ...formData, offer_price: parseFloat(e.target.value) })}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white outline-none" 
                        placeholder="997" 
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="label-caps !text-white flex items-center gap-2">
                    <Link2 size={14} className="text-zinc-500" /> Funnel URLs
                  </h3>
                  <div className="space-y-3">
                    <input required type="url" value={formData.landing_page_url} onChange={e => setFormData({ ...formData, landing_page_url: e.target.value })} placeholder="Landing Page URL" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-[11px] font-mono text-zinc-400 outline-none" />
                    <input required type="url" value={formData.checkout_url} onChange={e => setFormData({ ...formData, checkout_url: e.target.value })} placeholder="Checkout URL" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-[11px] font-mono text-zinc-400 outline-none" />
                    <input required type="url" value={formData.purchase_thankyou_url} onChange={e => setFormData({ ...formData, purchase_thankyou_url: e.target.value })} placeholder="Purchase Thank You URL" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-[11px] font-mono text-zinc-400 outline-none" />
                  </div>
                </div>
              </div>

              {/* Newsletter & Upsells */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-8 border-t border-zinc-800">
                {/* Newsletter */}
                <div className="space-y-4">
                  <h3 className="label-caps flex items-center gap-2">
                    <MailIcon size={14} /> Newsletter
                  </h3>
                  <div className="space-y-2">
                    <input type="url" value={formData.newsletter_url} onChange={e => setFormData({ ...formData, newsletter_url: e.target.value })} placeholder="Signup Page URL" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-[10px] font-mono" />
                    <input type="url" value={formData.newsletter_thankyou_url} onChange={e => setFormData({ ...formData, newsletter_thankyou_url: e.target.value })} placeholder="Thank You Page URL" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-[10px] font-mono" />
                  </div>
                </div>

                {/* Lead Magnet */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="label-caps flex items-center gap-2">
                      <Magnet size={14} /> Lead Magnet
                    </h3>
                    <input type="checkbox" checked={formData.has_lead_magnet} onChange={e => setFormData({ ...formData, has_lead_magnet: e.target.checked })} />
                  </div>
                  {formData.has_lead_magnet && (
                    <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg">
                      <p className="text-[9px] text-zinc-500 font-bold uppercase">Configure magnets on next page</p>
                    </div>
                  )}
                </div>

                {/* Sales Call */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="label-caps flex items-center gap-2">
                      <Phone size={14} /> Sales Call
                    </h3>
                    <input type="checkbox" checked={formData.has_sales_call} onChange={e => setFormData({ ...formData, has_sales_call: e.target.checked })} />
                  </div>
                  {formData.has_sales_call && (
                    <div className="space-y-2">
                      <input type="url" value={formData.sales_call_booking_url} onChange={e => setFormData({ ...formData, sales_call_booking_url: e.target.value })} placeholder="Booking URL" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-[10px] font-mono" />
                      <input type="url" value={formData.sales_call_thankyou_url} onChange={e => setFormData({ ...formData, sales_call_thankyou_url: e.target.value })} placeholder="Call Thank You URL" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-[10px] font-mono" />
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-zinc-500 uppercase font-bold">Close Rate</span>
                        <input type="number" value={formData.estimated_close_rate} onChange={e => setFormData({ ...formData, estimated_close_rate: parseFloat(e.target.value) })} className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 w-16 text-xs" />
                        <span className="text-zinc-600">%</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Consultation */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="label-caps flex items-center gap-2">
                      <Briefcase size={14} /> Paid Consultation
                    </h3>
                    <input type="checkbox" checked={formData.has_paid_consultation} onChange={e => setFormData({ ...formData, has_paid_consultation: e.target.checked })} />
                  </div>
                  {formData.has_paid_consultation && (
                    <div className="space-y-2">
                      <input type="url" value={formData.consultation_booking_url} onChange={e => setFormData({ ...formData, consultation_booking_url: e.target.value })} placeholder="Booking URL" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-[10px] font-mono" />
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] text-zinc-500 uppercase font-bold">Fee</span>
                        <input type="number" value={formData.consultation_fee} onChange={e => setFormData({ ...formData, consultation_fee: parseFloat(e.target.value) })} className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 w-20 text-xs" />
                        <span className="text-zinc-600">$</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-zinc-800">
                <button 
                  disabled={saving} 
                  type="submit" 
                  className="bg-red-600 text-white px-8 h-12 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 hover:bg-red-500 transition-all shadow-[0_0_20px_rgba(220,38,38,0.2)]"
                >
                  {saving ? <Loader2 className="animate-spin" size={16} /> : <><Save size={16} /> {t.campaigns.save}</>}
                </button>
              </div>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="bento-card h-40 animate-pulse bg-zinc-900/50" />)
        ) : campaigns.length === 0 ? (
          <div className="col-span-full py-20 text-center space-y-4 border-2 border-dashed border-zinc-900 rounded-3xl">
             <div className="w-16 h-16 bg-zinc-900 rounded-full mx-auto flex items-center justify-center">
               <Briefcase className="text-zinc-700" />
             </div>
             <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest">No campaigns created yet</p>
          </div>
        ) : (
          campaigns.map(c => (
            <motion.div 
              key={c.id} 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              className="bento-card group hover:border-zinc-700 transition-all p-6 cursor-pointer"
              onClick={() => navigate(`/campaigns/${c.id}`)}
            >
               <div className="flex justify-between items-start mb-4">
                 <h3 className="text-lg font-bold text-white leading-tight">{c.campaign_name}</h3>
                 <span className="text-[10px] font-mono text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded-md">ID: {c.id.slice(0, 4)}</span>
               </div>
               
               <div className="space-y-3 mb-6">
                 <div className="flex items-center gap-3 text-zinc-500 text-[10px] font-bold uppercase">
                   <DollarSign size={14} className="text-red-500" /> Offer: <span className="text-zinc-300 ml-auto">${c.offer_price}</span>
                 </div>
                 {c.has_sales_call && (
                   <div className="flex items-center gap-3 text-zinc-500 text-[10px] font-bold uppercase">
                     <Phone size={14} className="text-blue-500" /> Sales Call: <span className="text-zinc-300 ml-auto">{c.estimated_close_rate}% Close</span>
                   </div>
                 )}
                 {c.has_paid_consultation && (
                   <div className="flex items-center gap-3 text-zinc-500 text-[10px] font-bold uppercase">
                     <Briefcase size={14} className="text-purple-500" /> Consultation: <span className="text-zinc-300 ml-auto">${c.consultation_fee}</span>
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
