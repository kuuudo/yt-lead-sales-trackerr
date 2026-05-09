import React, { useState } from 'react';
import { useLanguage } from '../lib/hooks';
import { Youtube, Copy, Check, AlertCircle, Link as LinkIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Tools() {
  const { t } = useLanguage();
  const [url, setUrl] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const extractVideoId = (input: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = input.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const handleGenerate = () => {
    const id = extractVideoId(url);
    if (id) {
      const baseUrl = window.location.origin;
      const trackedLink = `${baseUrl}/?utm_source=youtube&utm_medium=video&utm_campaign=default&utm_content=${id}`;
      setResult(trackedLink);
      setError('');
    } else {
      setError(t.tools.error);
      setResult('');
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <header className="space-y-2 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-500/10 text-red-500 mb-2">
          <Youtube size={24} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          {t.tools.title}
        </h1>
        <p className="text-zinc-500 text-sm">{t.simulator.desc}</p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-8 bento-card space-y-6">
          <div className="space-y-2">
            <p className="label-caps">Target YouTube URL</p>
            <div className="relative group">
              <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-zinc-600 group-focus-within:text-red-500 transition-colors">
                <LinkIcon size={18} />
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={t.tools.inputPlaceholder}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-14 pr-5 py-5 text-sm focus:border-red-600 outline-none transition-all placeholder:text-zinc-700 text-zinc-300 font-mono"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-[10px] font-bold uppercase tracking-wider pl-1">
                <AlertCircle size={12} />
                {error}
              </div>
            )}
          </div>

          <button
            onClick={handleGenerate}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all active:scale-[0.98] shadow-lg shadow-blue-900/10"
          >
            {t.tools.generate}
          </button>
        </div>

        <div className="md:col-span-4 bento-card flex flex-col justify-between">
          <div className="space-y-1">
            <p className="label-caps text-zinc-400">Tracking Info</p>
            <p className="text-[11px] text-zinc-500 leading-relaxed">
              Video ID will be extracted and saved as <code className="text-zinc-300">utm_content</code>.
            </p>
          </div>
          
          <div className="pt-4 border-t border-zinc-800/50 space-y-3">
             <div className="flex justify-between text-[10px] uppercase tracking-tighter">
               <span className="text-zinc-600">Source:</span>
               <span className="text-zinc-400">youtube</span>
             </div>
             <div className="flex justify-between text-[10px] uppercase tracking-tighter">
               <span className="text-zinc-600">Medium:</span>
               <span className="text-zinc-400">video</span>
             </div>
          </div>
        </div>

        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="md:col-span-12 bento-card space-y-4"
            >
              <div className="flex items-center justify-between">
                <p className="label-caps">Generated Campaign Link</p>
                {copied && (
                  <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest flex items-center gap-1">
                    <Check size={10} /> {t.tools.success}
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-5 py-4 font-mono text-[13px] break-all text-zinc-400">
                  {result}
                </div>
                <button
                  onClick={copyToClipboard}
                  className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 rounded-xl transition-all active:scale-95 flex items-center justify-center shrink-0 border border-zinc-700"
                >
                  <Copy size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
