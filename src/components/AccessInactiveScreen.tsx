import React from 'react';
import { Lock, LogOut, MessageCircle } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { SUPPORT_WHATSAPP_URL } from '../lib/support';

export default function AccessInactiveScreen() {
  const { signOut } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh]">
      <div className="bento-card w-full max-w-md p-8 text-center">
        <div className="w-12 h-12 bg-zinc-800 rounded-xl mx-auto mb-4 flex items-center justify-center">
          <Lock className="text-zinc-400" size={24} />
        </div>
        <h1 className="text-2xl font-bold text-white">Access inactive</h1>
        <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-[0.2em] mt-2">
          VSTRK
        </p>
        <p className="text-sm text-zinc-400 leading-relaxed mt-6">
          Your VSTRK access is currently inactive. Access is granted when your email has been
          pre-registered by VSTRK. If you believe this is a mistake, contact us on WhatsApp.
        </p>
        <p className="text-[11px] text-zinc-600 leading-relaxed mt-3">
          Your tracking links and redirects continue to work.
        </p>
        <a
          href={SUPPORT_WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 w-full bg-white text-zinc-950 h-12 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center justify-center gap-2"
        >
          <MessageCircle size={14} />
          Contact VSTRK on WhatsApp
        </a>
        <button
          onClick={() => void signOut()}
          className="mt-3 w-full border border-zinc-800 bg-zinc-900/50 text-zinc-400 h-11 rounded-xl text-xs font-black uppercase tracking-widest hover:text-white hover:border-zinc-700 transition-all flex items-center justify-center gap-2"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </div>
  );
}
