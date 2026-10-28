import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../lib/hooks';
import { motion } from 'motion/react';
import { KeyRound, Mail, User, Loader2 } from 'lucide-react';
import { Modal } from '../components/Modal';
import { createUserWorkspace } from '../lib/createUserWorkspace';
import { SUPPORT_WHATSAPP_URL } from '../lib/support';
import { THEMES } from '../lib/theme';


export default function Auth() {
  const { t } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  const showAlert = (title: string, message: string, variant: 'info' | 'danger' | 'success' = 'info') => {
    setModalConfig({ isOpen: true, title, message, variant });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;

        if (data.user) {
          // Wait for session to be active before creating workspace
          // data.user exists before the JWT is set on the client
          // data.session confirms the JWT is ready for RLS
          const session = data.session ?? (await supabase.auth.getSession()).data.session;
  
          if (session) {
            // Confirmed against createUserWorkspace.ts: it inserts into
            // profiles directly (id, email, full_name) — this is the actual
            // persistence path. The full_name passed via signUp's
            // options.data above only reaches auth.users' own metadata, not
            // profiles — kept anyway since it's harmless and Supabase uses
            // it in some auth emails, but it is NOT what makes full_name
            // show up on the Members page. This call is.
            await createUserWorkspace(data.user.id, email, fullName);
          } else {
            console.error('No session after signup — workspace not created');
          }
        }
  }
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
  className="fixed inset-0 z-50 overflow-y-auto flex flex-col items-center justify-center p-4"
  style={{ ...THEMES.find(t => t.id === 'light')!.vars, background: 'var(--color-zinc-950)' }}
>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bento-card w-full max-w-lg p-10"
      >
        <header className="text-center mb-8">
          <div className="w-12 h-12 bg-red-600 rounded-xl mx-auto mb-4 flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.3)]">
            <KeyRound className="text-[#ffffff]" size={24} />
          </div>
          <h1 className="text-4xl font-bold text-white">{isLogin ? t.auth.signin : t.auth.signup}</h1>
          <p className="text-zinc-400 text-sm uppercase font-bold tracking-[0.2em] mt-2">Revenue Intelligence</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="space-y-1">
              <label className="label-caps !text-sm !text-zinc-300">Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-[19px] text-zinc-500" size={20} />
                <input
                  required
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl py-4 pl-12 pr-4 text-base text-white focus:border-red-600 outline-none transition-all"
                  placeholder="Jane Doe"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label className="label-caps !text-sm !text-zinc-300">{t.auth.email}</label>
            <div className="relative">
              <Mail className="absolute left-4 top-[19px] text-zinc-500" size={20} />
              <input 
                required
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl py-4 pl-12 pr-4 text-base text-white focus:border-red-600 outline-none transition-all"
                placeholder="you@email.com"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="label-caps !text-sm !text-zinc-300">{t.auth.password}</label>
            <div className="relative">
              <KeyRound className="absolute left-4 top-[19px] text-zinc-500" size={20} />
              <input 
                required
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-700 rounded-xl py-4 pl-12 pr-4 text-base text-white focus:border-red-600 outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && <p className="text-red-600 text-sm font-bold">{error}</p>}

          <button 
            disabled={loading}
            type="submit" 
            className="w-full bg-white text-zinc-950 h-14 rounded-xl text-base font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : (isLogin ? t.auth.signin : t.auth.signup)}
          </button>
        </form>

        <footer className="mt-6 text-center space-y-3">
          <p className="text-sm text-zinc-400 leading-relaxed px-2">
            {t.auth.accessHint ||
              'VSTRK access is for pre-registered emails only. Sign up with the email provided to you by VSTRK.'}
          </p>
          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors"
          >
            {t.auth.contactSupport || 'No access? Contact VSTRK on WhatsApp'}
          </a>
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-colors"
          >
            {isLogin ? t.auth.noAccount : t.auth.hasAccount}
          </button>
        </footer>

      </motion.div>

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
