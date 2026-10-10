// src/pages/GettingStarted.tsx — /settings/getting-started
//
// A normal page (not a modal/overlay) that lists the existing guides in one
// place. Each task launches its guide through the existing useTutorial()
// start(guide) mechanism; nothing here is rebuilt or modified. The page never
// opens by itself — users reach it from the "Get Started" nav entry (and, in
// a later step, Settings).
//
// Hub state (the nav dot) is separate from guide progress: visiting this
// page clears the dot only; it does not start, complete, or reset any guide.

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Compass, Rocket, Library, Video, Users, Globe, type LucideIcon } from 'lucide-react';
import { useTutorial } from '../lib/tutorial-overlay';
import { useViewing } from '../lib/ViewingContext';
import { useOnboardingHubIndicator } from '../lib/onboardingHubIndicator';
import type { Tutorial } from '../lib/tutorialTypes';
import { createFirstAssetGuide } from '../lib/tutorials/createFirstAssetGuide';
import { trackFirstContentGuide } from '../lib/tutorials/trackFirstContentGuide';
import { startFirstCollabGuide } from '../lib/tutorials/startFirstCollabGuide';

type HubTask = {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  // Exactly one of these per task.
  guide?: Tutorial;
  to?: string;
};

const TASKS: HubTask[] = [
  {
    id: 'setup-tracking-domain',
    icon: Globe,
    title: 'Set Up Your Tracking Domain',
    description: 'Connect your own domain so your tracking links use your brand.',
    actionLabel: 'Set Up',
    to: '/settings/tracking-domains',
  },
  {
    id: 'create-first-asset',
    icon: Library,
    title: 'Create Your First Asset',
    description: 'Turn a link, a tracked video, or a campaign URL into a reusable Asset.',
    actionLabel: 'Start Guide',
    guide: createFirstAssetGuide,
  },
  {
    id: 'track-first-content',
    icon: Video,
    title: 'Track Your First Content',
    description: 'Paste a content URL, pick a Campaign, and generate your first real tracking link.',
    actionLabel: 'Start Guide',
    guide: trackFirstContentGuide,
  },
  {
    id: 'start-first-collab',
    icon: Users,
    title: 'Start Your First Collab',
    description: 'Walk through the full collaborator workflow by inviting yourself and promoting an Asset.',
    actionLabel: 'Start Guide',
    guide: startFirstCollabGuide,
  },

];

export default function GettingStarted() {
  const { start } = useTutorial();
  const navigate = useNavigate();
  const { isReadOnly, viewingMemberName } = useViewing();
  const { markSeen } = useOnboardingHubIndicator();

  // Visiting the page clears the nav indicator. Guide progress is untouched.
  useEffect(() => {
    markSeen();
  }, [markSeen]);

  const handleTask = (task: HubTask) => {
    if (task.guide) {
      start(task.guide);
      return;
    }
    if (task.to) navigate(task.to);
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <header className="space-y-1">
        <div className="flex items-center gap-2 label-caps text-zinc-500">
          <Compass size={12} />
          Getting Started
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Getting Started &amp; Guides</h1>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Pick a task below. Guides walk you through the real pages, and you can come back to this page any time.
        </p>
      </header>

      {isReadOnly && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-300 leading-relaxed">
          You&apos;re viewing {viewingMemberName ?? 'a member'}&apos;s account in read-only mode. Guides that
          create or change data won&apos;t work here — exit viewing mode first to follow them.
        </div>
      )}

      <section className="space-y-3">
        {TASKS.map((task, i) => {
          const Icon = task.icon;
          return (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.05 }}
              className="bento-card flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                <Icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold text-white">{task.title}</h2>
                <p className="text-xs text-zinc-500 leading-relaxed mt-0.5">{task.description}</p>
              </div>
              <button
                type="button"
                onClick={() => handleTask(task)}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 h-9 rounded-lg bg-white text-zinc-950 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-all"
              >
                <Rocket size={12} />
                {task.actionLabel}
              </button>
            </motion.div>
          );
        })}
      </section>
    </div>
  );
}
