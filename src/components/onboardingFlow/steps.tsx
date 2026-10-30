import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Clapperboard,
  FileVideo,
  GitBranch,
  Handshake,
  Layers,
  Megaphone,
  MousePointerClick,
  Store,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import {
  OTHER_OPTION,
  ROLES,
  SITUATIONS,
  type OnboardingAnswers,
  type RoleId,
} from '../../lib/onboardingFlow';
import { ChooseOne, Eyebrow, FONT, OptionCard, StepHeader } from '../../components/onboardingFlow/OnboardingShell';

/* ───────────── 01 · Welcome ───────────── */

const PATH: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: FileVideo, title: 'Content', text: 'A post, video or reusable Asset' },
  { icon: MousePointerClick, title: 'Tracking link', text: 'Someone clicks. Tracking begins.' },
  { icon: GitBranch, title: 'Lead / conversion', text: 'Follow the next meaningful action' },
  { icon: TrendingUp, title: 'Revenue', text: 'Recorded paid campaign revenue' },
];

export function WelcomeStep() {
  const reduce = useReducedMotion();
  return (
    <div className="grid items-center gap-10 lg:min-h-[calc(100vh-300px)] lg:grid-cols-[1fr_minmax(0,460px)] lg:gap-16">
      <div>
        <Eyebrow n={1} label="The starting line" />
        <h1
          className="mt-5 text-[56px] font-extrabold leading-[0.95] tracking-[-0.045em] sm:text-[84px]"
          style={FONT.display}
        >
          Welcome
          <br />
          to VSTRK.
        </h1>
        <p
          className="mt-8 max-w-[18em] text-[24px] font-medium leading-snug tracking-[-0.01em] sm:text-[28px]"
          style={FONT.display}
        >
          We’re committed to helping you track everything that happens behind your links.
        </p>
        <p className="mt-5 max-w-[32em] text-[17px] leading-relaxed text-[#5E5B70]">
          Bring your content, tracking links and campaign results into one clearer picture. Two quick questions will
          shape your starting point.
        </p>
      </div>

      <div className="rounded-[28px] border border-[#E4E0F5] bg-white p-6 shadow-[0_24px_60px_-30px_rgba(91,61,245,0.35)] sm:p-8">
        <p className="mb-6 text-[11px] uppercase tracking-[0.14em] text-[#6B6880]" style={FONT.mono}>
          The path that matters
        </p>
        <ol>
          {PATH.map((item, i) => (
            <motion.li
              key={item.title}
              className="relative flex gap-4 pb-6 last:pb-0"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.18, duration: 0.4, ease: 'easeOut' }}
            >
              {i < PATH.length - 1 && (
                <span aria-hidden className="absolute bottom-1 left-[21px] top-12 w-px bg-[#E3DEFA]" />
              )}
              <span
                className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
                  i === 0
                    ? 'bg-[#5B3DF5] text-white shadow-[0_8px_20px_-6px_rgba(91,61,245,0.6)]'
                    : 'bg-[#F0EDFD] text-[#5B3DF5]'
                }`}
              >
                <item.icon size={20} aria-hidden />
              </span>
              <div>
                <p className="text-[18px] font-semibold leading-snug">{item.title}</p>
                <p className="text-[15px] leading-snug text-[#5E5B70]">{item.text}</p>
              </div>
            </motion.li>
          ))}
        </ol>
        <p className="mt-6 border-t border-[#EDE9FA] pt-4 text-[13px] leading-snug text-[#5E5B70]">
          Tracking starts with a tracking-link click, not passive platform views.
        </p>
      </div>
    </div>
  );
}

/* ───────────── 02 · Role ───────────── */

const ROLE_ICONS: Record<RoleId, LucideIcon> = {
  business_owner: Store,
  marketer: Megaphone,
  agency: Layers,
  sponsor_brand: Handshake,
  creator: Clapperboard,
};

export function RoleStep({ value, onChange }: { value: RoleId | null; onChange: (role: RoleId) => void }) {
  return (
    <div>
      <StepHeader
        n={2}
        label="Your role"
        tag="Onboarding"
        title="What best describes you?"
        subtitle="Start with the perspective you bring to your marketing."
      />
      <ChooseOne />
      <div role="radiogroup" aria-label="Your role" className="mt-3 grid gap-3 sm:grid-cols-2">
        {ROLES.map((r, i) => (
          <OptionCard
            key={r.id}
            icon={ROLE_ICONS[r.id]}
            title={r.title}
            description={r.description}
            selected={value === r.id}
            onSelect={() => onChange(r.id)}
            className={i === ROLES.length - 1 ? 'sm:col-span-2' : ''}
          />
        ))}
      </div>
      <aside className="mt-6 rounded-2xl border border-[#E4E0F5] bg-white p-5">
        <span
          className="inline-block rounded bg-[#EEEAFF] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#5B3DF5]"
          style={FONT.mono}
        >
          Why this matters
        </span>
        <p className="mt-3 text-[17px] font-semibold">Start where you are.</p>
        <p className="mt-1 text-[14px] text-[#5E5B70]">Your role shapes the examples and wording you’ll see next.</p>
      </aside>
    </div>
  );
}

/* ───────────── 03 · Situation ───────────── */

export function SituationStep({
  role,
  situation,
  otherText,
  onSituation,
  onOtherText,
}: {
  role: RoleId;
  situation: string | null;
  otherText: string;
  onSituation: (id: string) => void;
  onOtherText: (text: string) => void;
}) {
  const config = SITUATIONS[role];
  const roleTitle = ROLES.find((r) => r.id === role)?.title;
  const options = [...config.options, OTHER_OPTION];

  return (
    <div>
      <StepHeader
        n={3}
        label="Your situation"
        tag={roleTitle}
        title={config.question}
        subtitle="Pick the closest fit. There’s no wrong answer."
      />
      <ChooseOne />
      <div role="radiogroup" aria-label="Your situation" className="mt-3 flex flex-col gap-3">
        {options.map((o) => (
          <OptionCard
            key={o.id}
            title={o.title}
            description={o.description}
            selected={situation === o.id}
            onSelect={() => onSituation(o.id)}
          />
        ))}
      </div>

      <AnimatePresence initial={false}>
        {situation === OTHER_OPTION.id && (
          <motion.div
            key="other"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <label className="block px-1 pb-1 pt-5">
              <span className="text-[14px] font-medium">In a few words, what are you hoping VSTRK will help with?</span>
              <textarea
                autoFocus
                rows={2}
                maxLength={200}
                value={otherText}
                onChange={(e) => onOtherText(e.target.value)}
                placeholder="Tell us what you’re trying to do"
                className="mt-2 w-full resize-none rounded-2xl border border-[#E4E0F5] bg-white px-4 py-3 text-[16px] outline-none transition placeholder:text-[#A29EB8] focus:border-[#5B3DF5] focus:ring-4 focus:ring-[#5B3DF5]/15"
              />
            </label>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────────── TEMP · replace with the campaign step ───────────── */

export function NextStepPlaceholder({ answers }: { answers: OnboardingAnswers }) {
  return (
    <div>
      <Eyebrow n={4} label="Campaign setup" />
      <h1 className="mt-5 text-[40px] font-extrabold leading-[1.03] tracking-[-0.035em] sm:text-[56px]" style={FONT.display}>
        Campaign setup comes next.
      </h1>
      <p className="mt-4 max-w-[34em] text-[17px] leading-relaxed text-[#5E5B70]">
        Temporary screen so the flow doesn’t dead-end. These are the answers collected so far:
      </p>
      <pre className="mt-6 overflow-x-auto rounded-2xl border border-[#E4E0F5] bg-white p-4 text-[13px]" style={FONT.mono}>
        {JSON.stringify(answers, null, 2)}
      </pre>
    </div>
  );
}
