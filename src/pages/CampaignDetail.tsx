import React from 'react';
import { BookOpen, Target, BarChart3, ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';

export default function Installation() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-12 max-w-3xl mx-auto pb-20 pt-8"
    >
      <header className="border-b border-zinc-900 pb-8">
        <h1 className="text-4xl font-black text-white italic tracking-tighter flex items-center gap-4">
          <BookOpen className="text-red-500" size={32} />
          HOW TO USE V-TRACK
        </h1>
        <p className="text-zinc-500 text-[10px] uppercase tracking-widest mt-2 font-black leading-relaxed">Your simple guide to video attribution & revenue tracking</p>
      </header>

      <div className="space-y-20">
        {/* Step 1 */}
        <section className="relative pl-12 border-l-2 border-zinc-900">
          <div className="absolute -left-[13px] top-0 w-6 h-6 rounded-full bg-zinc-950 border-2 border-red-600 flex items-center justify-center text-[10px] font-black text-white">1</div>
          <div className="space-y-4">
            <h2 className="text-xl font-black text-white uppercase tracking-tight">Step 1 — Create Your Campaign</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Go to <span className="text-white font-bold border-b border-zinc-700">Campaigns</span> in the menu and click <span className="text-red-500 font-bold">"New Campaign"</span>. Fill in your campaign details:
            </p>
            <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                'Campaign Name',
                'Offer Price',
                'Funnel URLs (Newsletter, Lead Magnet, Sales Call, Paid Consultation)',
                'Close Rate % (if you have a sales call)',
                'Consultation Fee (if you have paid consultation)'
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 text-[11px] text-zinc-400 font-bold uppercase tracking-tight bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
                  <ChevronRight size={14} className="text-red-500 shrink-0 mt-0.5" />
                  {item}
                </div>
              ))}
            </div>
            <p className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest pt-2">
              Once saved, V-Track will use these details to calculate your revenue automatically.
            </p>
          </div>
        </section>

        {/* Step 2 */}
        <section className="relative pl-12 border-l-2 border-zinc-900">
          <div className="absolute -left-[13px] top-0 w-6 h-6 rounded-full bg-zinc-950 border-2 border-red-600 flex items-center justify-center text-[10px] font-black text-white">2</div>
          <div className="space-y-4">
            <h2 className="text-xl font-black text-white uppercase tracking-tight">Step 2 — Track a Video</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Go to <span className="text-white font-bold border-b border-zinc-700">Videos</span> in the menu and click <span className="text-red-500 font-bold">"Track New Video"</span>. Fill in:
            </p>
            <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                'YouTube URL of your video',
                'Select the Campaign this video belongs to',
                'Select your Goal / Objective (Direct Sales, Newsletter Growth, Sales Call Booking, Paid Consultation, Awareness)',
                'If you have a Lead Magnet, toggle it on and select which lead magnets apply'
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3 text-[11px] text-zinc-400 font-bold uppercase tracking-tight bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/50">
                  <Target size={14} className="text-red-500 shrink-0 mt-0.5" />
                  {item}
                </div>
              ))}
            </div>
            <div className="bg-red-500/5 border border-red-500/10 rounded-2xl p-6">
              <p className="text-zinc-300 text-sm leading-relaxed">
                That's it! V-Track will generate a tracking link automatically. <span className="text-white font-black underline decoration-red-500 decoration-2 underline-offset-4">Copy it and paste it into your YouTube video description.</span>
              </p>
            </div>
          </div>
        </section>

        {/* Step 3 */}
        <section className="relative pl-12">
          <div className="absolute -left-[13px] top-0 w-6 h-6 rounded-full bg-zinc-950 border-2 border-red-600 flex items-center justify-center text-[10px] font-black text-white">3</div>
          <div className="space-y-4">
            <h2 className="text-xl font-black text-white uppercase tracking-tight">Step 3 — Monitor Performance</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Go to <span className="text-white font-bold border-b border-zinc-700">Dashboard</span> or <span className="text-white font-bold border-b border-zinc-700">Analytics</span> to see your video performance, revenue attribution, and funnel metrics.
            </p>
            <div className="pt-4">
              <div className="w-full h-32 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center relative overflow-hidden group">
                <BarChart3 size={40} className="text-zinc-800 group-hover:text-red-500/40 transition-all duration-700 group-hover:scale-125" />
                <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
}
