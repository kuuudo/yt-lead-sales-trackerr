import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export const CopyButton = ({
  text,
  label = 'Copy',
}: {
  text: string;
  label?: string;
}) => {
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