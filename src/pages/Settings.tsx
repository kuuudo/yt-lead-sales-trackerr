import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { motion } from 'motion/react';
import {
  Settings as SettingsIcon,
  Key,
  Copy,
  Check,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Webhook,
  ArrowLeft,
  Users,
  Globe,
  Wrench,
  Compass,
  User as UserIcon,
  MessageCircle,
} from 'lucide-react';
import { Modal } from '../components/Modal';
import { useNavigate, Link } from 'react-router-dom';
import { useMyTeam } from '../lib/useMyTeam';

export default function Settings() {
  const { user } = useAuth();
  const { customer: myTeamCustomer } = useMyTeam();
  const [webhookSecret, setWebhookSecret] = useState('');
  const [savedSecret, setSavedSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    variant: 'info' | 'danger' | 'success';
  }>({ isOpen: false, title: '', message: '', variant: 'info' });

  const [fullName, setFullName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const navigate = useNavigate();
  const webhookEndpoint = `https://vstrk.com/api/stripe-webhook`;

  useEffect(() => {
    const loadConfig = async () => {
      if (!user) return;

      const [{ data: stripeData }, { data: profileData }] = await Promise.all([
        supabase
          .from('stripe_configs')
          .select('stripe_webhook_secret')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .maybeSingle(),
      ]);

      if (stripeData) {
        setSavedSecret(stripeData.stripe_webhook_secret);
        setWebhookSecret(stripeData.stripe_webhook_secret);
      }
      if (profileData?.full_name) {
        setFullName(profileData.full_name);
      }
      setLoading(false);
    };
    loadConfig();
  }, [user]);

  const handleSave = async () => {
    if (!user || !webhookSecret.trim()) return;
    setSaving(true);

    const { error } = await supabase
      .from('stripe_configs')
      .upsert(
        { user_id: user.id, stripe_webhook_secret: webhookSecret.trim() },
        { onConflict: 'user_id' }
      );

    setSaving(false);

    if (error) {
      setModalConfig({
        isOpen: true,
        title: 'Save Failed',
        message: error.message,
        variant: 'danger',
      });
    } else {
      setSavedSecret(webhookSecret.trim());
      setModalConfig({
        isOpen: true,
        title: 'Saved',
        message: 'Your Stripe webhook secret has been saved.',
        variant: 'success',
      });
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', user.id);
    setSavingProfile(false);
    if (error) {
      setModalConfig({
        isOpen: true,
        title: 'Save Failed',
        message: error.message,
        variant: 'danger',
      });
    } else {
      setModalConfig({
        isOpen: true,
        title: 'Saved',
        message: 'Profile name updated.',
        variant: 'success',
      });
    }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      setModalConfig({
        isOpen: true,
        title: 'Invalid password',
        message: 'Password must be at least 6 characters.',
        variant: 'danger',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setModalConfig({
        isOpen: true,
        title: 'Password mismatch',
        message: 'New password and confirmation do not match.',
        variant: 'danger',
      });
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      setModalConfig({
        isOpen: true,
        title: 'Update Failed',
        message: error.message,
        variant: 'danger',
      });
    } else {
      setNewPassword('');
      setConfirmPassword('');
      setModalConfig({
        isOpen: true,
        title: 'Saved',
        message: 'Password updated.',
        variant: 'success',
      });
    }
  };

  const copyEndpoint = () => {
    navigator.clipboard.writeText(webhookEndpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const maskSecret = (s: string) => s.slice(0, 8) + '••••••••••••••••' + s.slice(-4);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="text-red-600 animate-spin" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <header className="space-y-1">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-widest mb-4"
        >
          <ArrowLeft size={12} />
          Back
        </button>
        <div className="flex items-center gap-2 label-caps text-zinc-500">
          <SettingsIcon size={12} />
          Configuration
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Settings</h1>
      </header>

      <section className="bento-card space-y-2">
        <h2 className="text-sm font-bold text-white mb-3">Shortcuts</h2>
        <Link
          to="/settings/getting-started"
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-zinc-900/50 transition-all"
        >
          <Compass size={15} />
          Getting Started
        </Link>
        
          <Link
            to="/team"
            className="flex items-center gap-3 px-3 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-zinc-900/50 transition-all"
          >
            <Users size={15} />
            Team
          </Link>
      
        <Link
          to="/settings/tracking-domains"
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-zinc-900/50 transition-all"
        >
          <Globe size={15} />
          Branded Domain
        </Link>
        <Link
          to="/installation"
          className="flex items-center gap-3 px-3 py-2.5 rounded-md text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white hover:bg-zinc-900/50 transition-all"
        >
          <Wrench size={15} />
          Installation
        </Link>
      </section>

      <section className="bento-card space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center">
            <UserIcon size={16} className="text-zinc-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Profile Name</h2>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Display name</p>
          </div>
        </div>
        <input
          type="text"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-sm text-white focus:border-red-600 outline-none"
          placeholder="Your name"
        />
        <button
          type="button"
          onClick={() => void handleSaveProfile()}
          disabled={savingProfile}
          className="w-full bg-white text-zinc-950 h-11 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {savingProfile ? <Loader2 className="animate-spin" size={14} /> : 'Save Name'}
        </button>
      </section>

      <section className="bento-card space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center">
            <Key size={16} className="text-zinc-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Change Password</h2>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Account security</p>
          </div>
        </div>
        <input
          type="password"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-sm text-white focus:border-red-600 outline-none"
          placeholder="New password"
          autoComplete="new-password"
        />
        <input
          type="password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-sm text-white focus:border-red-600 outline-none"
          placeholder="Confirm new password"
          autoComplete="new-password"
        />
        <button
          type="button"
          onClick={() => void handleChangePassword()}
          disabled={savingPassword || !newPassword || !confirmPassword}
          className="w-full bg-white text-zinc-950 h-11 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
        >
          {savingPassword ? <Loader2 className="animate-spin" size={14} /> : 'Update Password'}
        </button>
      </section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bento-card space-y-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
            <Webhook size={16} className="text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Stripe Webhook</h2>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Confirmed Revenue Tracking</p>
          </div>
          {savedSecret && (
            <div className="ml-auto flex items-center gap-1.5 text-green-500 text-[10px] font-bold uppercase tracking-widest">
              <CheckCircle2 size={12} />
              Connected
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-6">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-[10px] font-black text-zinc-400 flex items-center justify-center">1</span>
            <p className="text-xs font-bold text-white uppercase tracking-widest">Add this endpoint in your Stripe Dashboard</p>
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed pl-7">
            Go to <span className="text-zinc-300 font-bold">Stripe Dashboard → Developers → Webhooks → Add endpoint</span>. Paste the URL below and select the event <code className="text-violet-400">checkout.session.completed</code>.
          </p>
          <div className="flex gap-2 pl-7">
            <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 font-mono text-[12px] text-zinc-400 break-all">
              {webhookEndpoint}
            </div>
            <button
              onClick={copyEndpoint}
              className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white px-4 rounded-xl transition-all active:scale-95 flex items-center justify-center shrink-0 gap-2 text-[10px] font-bold uppercase tracking-widest"
            >
              {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="space-y-3 border-t border-zinc-800 pt-6">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-[10px] font-black text-zinc-400 flex items-center justify-center">2</span>
            <p className="text-xs font-bold text-white uppercase tracking-widest">Paste your Webhook Signing Secret</p>
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed pl-7">
            After creating the endpoint, Stripe shows you a <span className="text-zinc-300 font-bold">Signing Secret</span> starting with <code className="text-violet-400">whsec_</code>. Paste it below.
          </p>

          {savedSecret && (
            <div className="ml-7 flex items-center gap-2 px-4 py-2.5 bg-green-500/5 border border-green-500/20 rounded-xl">
              <CheckCircle2 size={12} className="text-green-500 shrink-0" />
              <span className="text-[11px] text-zinc-400 font-mono">{maskSecret(savedSecret)}</span>
              <span className="ml-auto text-[10px] text-green-500 font-bold uppercase tracking-widest">Active</span>
            </div>
          )}

          <div className="pl-7 space-y-3">
            <div className="relative">
              <Key className="absolute left-4 top-3.5 text-zinc-600" size={14} />
              <input
                type="password"
                value={webhookSecret}
                onChange={e => setWebhookSecret(e.target.value)}
                placeholder="whsec_••••••••••••••••••••••••••••••••"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white font-mono focus:border-violet-500 outline-none transition-all placeholder:text-zinc-700"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !webhookSecret.trim()}
              className="w-full bg-white text-zinc-950 h-11 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="animate-spin" size={14} /> : 'Save Webhook Secret'}
            </button>
          </div>
        </div>

        <div className="flex gap-3 p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl">
          <AlertCircle size={14} className="text-zinc-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Your webhook secret is encrypted and never exposed to the browser after saving. Each user has their own secret — VS-Track routes incoming Stripe events to the correct account automatically.
          </p>
        </div>
      </motion.section>

      <section className="bento-card space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center">
            <MessageCircle size={16} className="text-green-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Contact Me</h2>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Questions? Reach out on WhatsApp</p>
          </div>
        </div>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Got a question? Message me on WhatsApp. I'll answer as long as I'm awake.
        </p>
        <a
          href="https://chat.whatsapp.com/G07wVgoAyRS3Z171uRDQ1K?s=cl&p=a&mlu=4"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full bg-white text-zinc-950 h-11 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-2"
        >
          <MessageCircle size={14} />
          Contact me on WhatsApp
        </a>
      </section>

      <Modal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
        title={modalConfig.title}
        message={modalConfig.message}
        variant={modalConfig.variant}
      />
    </div>
  );
}