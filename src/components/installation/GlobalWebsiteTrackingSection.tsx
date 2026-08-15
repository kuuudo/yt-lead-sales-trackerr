import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Globe,
  Info,
  MessageSquare,
} from 'lucide-react';
import { CopyButton } from './CopyButton';

export const GLOBAL_TRACKING_SCRIPT = `<script>
(function() {
  const p = new URLSearchParams(window.location.search);

  const sid = p.get('vt_sid');
  const vid = p.get('vt_vid');
  const cid = p.get('vt_cid');
  const oid = p.get('vt_oid');
  const pid = p.get('vt_pid');
  const aid = p.get('vt_aid');
  const th  = p.get('vt_th');
  const ftRlid = p.get('vt_first_touch_redirect_link_id');
  const rlid = p.get('vt_rlid');

  if (sid) localStorage.setItem('yt_tracker_session_id', sid);
  if (vid) localStorage.setItem('yt_tracker_video_id', vid);
  if (cid) localStorage.setItem('yt_tracker_campaign_id', cid);
  if (oid) localStorage.setItem('yt_tracker_organization_id', oid);
  if (pid) localStorage.setItem('yt_tracker_promotion_id', pid);
  if (aid) localStorage.setItem('yt_tracker_asset_id', aid);
  if (th)  localStorage.setItem('yt_tracker_tracking_hostname', th);
  if (ftRlid) localStorage.setItem('yt_tracker_ft_redirect_link_id', ftRlid);
  if (rlid) localStorage.setItem('yt_tracker_redirect_link_id', rlid);

  if (sid || vid || cid || oid || pid || aid || th || ftRlid || rlid) {
    const clean = new URL(window.location.href);

    clean.searchParams.delete('vt_sid');
    clean.searchParams.delete('vt_vid');
    clean.searchParams.delete('vt_cid');
    clean.searchParams.delete('vt_oid');
    clean.searchParams.delete('vt_pid');
    clean.searchParams.delete('vt_aid');
    clean.searchParams.delete('vt_th');
    clean.searchParams.delete('vt_first_touch_redirect_link_id');
    clean.searchParams.delete('vt_rlid');

    window.history.replaceState({}, '', clean.toString());
  }
})();
<\/script>`;

const CHATGPT_HELP_PROMPT = `Help me install this tracking script into my website. Show me exactly where to place it in the <head> section. My website platform is: [INSERT PLATFORM NAME].`;

export const GlobalWebsiteTrackingSection = () => {
  const [open, setOpen] = useState(false);

  const platforms = ['Webflow', 'WordPress', 'Framer', 'Wix', 'Shopify', 'Custom HTML'];

  return (
    <div className="border border-green-500/20 rounded-xl overflow-hidden bg-green-500/3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-green-500/5 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5 flex-wrap">
          <Globe size={13} className="text-green-400 shrink-0" />
          <div>
            <span className="text-[11px] font-black uppercase tracking-widest text-green-300">
              Global Website Tracking
            </span>
            <span className="block text-[9px] font-black uppercase tracking-widest text-zinc-500 mt-0.5">
              Persistent Attribution Infrastructure
            </span>
          </div>
          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-green-500/15 border border-green-500/30 text-green-400">
            Required
          </span>
        </div>
        {open ? (
          <ChevronUp size={13} className="text-zinc-500 shrink-0" />
        ) : (
          <ChevronDown size={13} className="text-zinc-500 shrink-0" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-green-500/15 p-4 space-y-4">
              <div className="flex gap-3 p-3.5 bg-green-500/5 border border-green-500/15 rounded-xl">
                <Info size={13} className="text-green-400 shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-[11px] text-zinc-300 leading-relaxed font-bold">
                    Install this once on your website to preserve visitor attribution across
                    your funnel steps (Landing, Newsletter, Call, Consultation).
                  </p>
                  <ul className="space-y-1">
                    {[
                      'Stores visitor attribution locally in the browser across page loads',
                      'Improves embedded Calendly and TidyCal tracking accuracy',
                      'Enables cross-page attribution in multi-step funnels',
                      'Must be installed on all funnel pages to preserve attribution across steps',
                    ].map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 text-[11px] text-zinc-400 leading-relaxed"
                      >
                        <CheckCircle2 size={11} className="text-green-500 shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="label-caps text-green-400">Global Attribution Script</span>
                  <CopyButton text={GLOBAL_TRACKING_SCRIPT} label="Copy Script" />
                </div>
                <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-[11px] font-mono text-zinc-400 overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
                  {GLOBAL_TRACKING_SCRIPT}
                </pre>
              </div>

              <div className="space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                  <BookOpen size={11} /> Installation Instructions
                </p>
                <div className="space-y-2">
                  {[
                    {
                      step: '1',
                      title: 'Open your website builder or code editor',
                      desc: 'Access your website settings or source code.',
                    },
                    {
                      step: '2',
                      title: 'Paste inside the <head> section on all funnel pages',
                      desc: 'Install this script on every page where visitors can enter or move through your funnel (Landing, Newsletter, Call, Consultation). This ensures attribution is never lost between steps.',
                    },
                    {
                      step: '3',
                      title: 'Publish or save your changes',
                      desc: 'The script is now active. It runs silently on every page load.',
                    },
                  ].map((item) => (
                    <div
                      key={item.step}
                      className="flex gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-xl"
                    >
                      <span className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 text-[9px] font-black text-zinc-400 flex items-center justify-center shrink-0">
                        {item.step}
                      </span>
                      <div>
                        <p className="text-[11px] font-bold text-white">{item.title}</p>
                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
                    Works with:
                  </span>
                  {platforms.map((p) => (
                    <span
                      key={p}
                      className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400"
                    >
                      {p}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2 p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                  <MessageSquare size={11} /> Need Help Installing?
                </p>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  Copy this prompt and paste it into ChatGPT — it will walk you through the
                  exact steps for your platform.
                </p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="label-caps text-zinc-500">ChatGPT Prompt</span>
                    <CopyButton text={CHATGPT_HELP_PROMPT} label="Copy Prompt" />
                  </div>
                  <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-[11px] font-mono text-zinc-400 leading-relaxed whitespace-pre-wrap break-all">
                    {CHATGPT_HELP_PROMPT}
                  </pre>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};