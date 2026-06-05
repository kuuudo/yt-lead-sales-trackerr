import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../lib/hooks';
import { motion } from 'motion/react';
import { KeyRound, Mail, Loader2 } from 'lucide-react';
import { Modal } from '../components/Modal';
import { createUserWorkspace } from '../lib/createUserWorkspace';

export default function Auth() {
  const { t } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
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
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;

        if (data.user) {
          // Wait for session to be active before creating workspace
          // data.user exists before the JWT is set on the client
          // data.session confirms the JWT is ready for RLS
          const session = data.session ?? (await supabase.auth.getSession()).data.session;
  
          if (session) {
            await createUserWorkspace(data.user.id, email);
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
    <div className="flex flex-col items-center justify-center min-h-[70vh]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bento-card w-full max-w-md p-8"
      >
        <header className="text-center mb-8">
          <div className="w-12 h-12 bg-red-600 rounded-xl mx-auto mb-4 flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.3)]">
            <KeyRound className="text-white" size={24} />
          </div>
          <h1 className="text-2xl font-bold text-white">{isLogin ? t.auth.signin : t.auth.signup}</h1>
          <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-[0.2em] mt-2">Revenue Intelligence</p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="label-caps">{t.auth.email}</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 text-zinc-600" size={16} />
              <input 
                required
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-900 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:border-red-600 outline-none transition-all"
                placeholder="you@email.com"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="label-caps">{t.auth.password}</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-3.5 text-zinc-600" size={16} />
              <input 
                required
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-900 rounded-xl py-3 pl-10 pr-4 text-sm text-white focus:border-red-600 outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-[10px] font-bold uppercase">{error}</p>}

          <button 
            disabled={loading}
            type="submit" 
            className="w-full bg-white text-zinc-950 h-12 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : (isLogin ? t.auth.signin : t.auth.signup)}
          </button>
        </form>

        <footer className="mt-6 text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
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
