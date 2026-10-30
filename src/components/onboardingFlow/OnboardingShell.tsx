import { useEffect, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, ArrowRight, Check, Info, type LucideIcon } from 'lucide-react';
import { TOTAL_STEPS } from '../../lib/onboardingFlow';

export const FONT = {
  display: { fontFamily: "'Inter Tight', 'Inter', system-ui, sans-serif" },
  mono: { fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace" },
} as const;

const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';

function useOnboardingFonts() {
  useEffect(() => {
    if (document.getElementById('vstrk-onboarding-fonts')) return;
    const link = document.createElement('link');
    link.id = 'vstrk-onboarding-fonts';
    link.rel = 'stylesheet';
    link.href = FONT_URL;
    document.head.appendChild(link);
  }, []);
}

interface ShellProps {
  step: number;
  /** 'wide' is for the two-column welcome screen. */
  width?: 'narrow' | 'wide';
  /** Change this value to scroll back to the top (pass the step id). */
  scrollKey: string;
  onBack?: () => void;
  onNext: () => void;
  nextLabel: string;
  nextDisabled?: boolean;
  /** Small line shown bottom-left on desktop when there is no Back button. */
  footerNote?: string;
  children: ReactNode;
}

export default function OnboardingShell({
  step,
  width = 'narrow',
  scrollKey,
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  footerNote,
  children,
}: ShellProps) {
  useOnboardingFonts();
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [scrollKey]);

  const max = width === 'wide' ? 'max-w-[1184px]' : 'max-w-[884px]';

  return (
    <div
      ref={scroller}
      className="fixed inset-0 z-[100] overflow-y-auto bg-[#FBFAFF] text-[#14121F] antialiased"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(70rem_42rem_at_100%_-5%,#EDE8FF,transparent_65%)]"
      />

      <header className="relative mx-auto w-full max-w-[1320px] px-5 pt-6 sm:px-12">
        <div className="flex items-center justify-between">
          <span className="text-[26px] font-extrabold tracking-[-0.04em]" style={FONT.display}>
            VSTRK
            <span className="ml-0.5 inline-block h-[7px] w-[7px] rounded-full bg-[#5B3DF5] align-top" />
          </span>
          <div className="flex items-center gap-5">
            <span className="hidden text-[11px] uppercase tracking-[0.14em] text-[#6B6880] sm:block" style={FONT.mono}>
              Your starting point
            </span>
            <a
              href="/login"
              className="text-[13px] font-medium text-[#5E5B70] underline-offset-4 transition-colors hover:text-[#14121F] hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5B3DF5]/25"
            >
              Log in
            </a>
          </div>
        </div>
        <ol aria-label={`Step ${step} of ${TOTAL_STEPS}`} className="mt-4 flex gap-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <li
              key={i}
              aria-current={i + 1 === step ? 'step' : undefined}
              className="h-[3px] flex-1 overflow-hidden rounded-full bg-[#E3DEFA]"
            >
              <motion.div
                className="h-full origin-left bg-[#5B3DF5]"
                initial={false}
                animate={{ scaleX: i < step ? 1 : 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              />
            </li>
          ))}
        </ol>
      </header>

      <main className={`relative mx-auto w-full px-5 pb-40 pt-10 sm:px-8 sm:pt-14 ${max}`}>{children}</main>

      <footer className="fixed inset-x-0 bottom-0 z-10 border-t border-[#E9E5F8] bg-white/90 backdrop-blur">
        <div
          className={`mx-auto flex items-center gap-3 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8 ${max}`}
        >
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex h-[54px] items-center gap-2 rounded-xl px-3 text-[12px] uppercase tracking-[0.14em] text-[#5E5B70] transition-colors hover:text-[#14121F] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5B3DF5]/25"
              style={FONT.mono}
            >
              <ArrowLeft size={16} aria-hidden /> Back
            </button>
          ) : footerNote ? (
            <span className="hidden text-[11px] uppercase tracking-[0.14em] text-[#6B6880] sm:block" style={FONT.mono}>
              {footerNote}
            </span>
          ) : null}

          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="ml-auto flex h-[54px] flex-1 items-center justify-between rounded-xl bg-[#5B3DF5] px-6 text-[13px] font-medium uppercase tracking-[0.14em] text-white shadow-[0_12px_28px_-10px_rgba(91,61,245,0.6)] transition hover:bg-[#4A2FE0] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5B3DF5]/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:bg-[#5B3DF5] sm:w-[260px] sm:flex-none"
            style={FONT.mono}
          >
            {nextLabel}
            <ArrowRight size={18} aria-hidden />
          </button>
        </div>
      </footer>
    </div>
  );
}

/** "02 / 06 — Your role" */
export function Eyebrow({ n, label }: { n: number; label: string }) {
  return (
    <span className="text-[11px] uppercase tracking-[0.14em] text-[#5B3DF5]" style={FONT.mono}>
      {String(n).padStart(2, '0')} / {String(TOTAL_STEPS).padStart(2, '0')} — {label}
    </span>
  );
}

export function StepHeader({
  n,
  label,
  tag,
  title,
  subtitle,
}: {
  n: number;
  label: string;
  tag?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <Eyebrow n={n} label={label} />
        {tag && (
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#6B6880]" style={FONT.mono}>
            {tag}
          </span>
        )}
      </div>
      <h1
        className="mt-5 text-[40px] font-extrabold leading-[1.03] tracking-[-0.035em] sm:text-[56px]"
        style={FONT.display}
      >
        {title}
      </h1>
      {subtitle && <p className="mt-4 max-w-[34em] text-[17px] leading-relaxed text-[#5E5B70]">{subtitle}</p>}
    </div>
  );
}

export function ChooseOne({ label = 'Choose one' }: { label?: string }) {
  return (
    <p className="mt-9 flex items-center gap-2 text-[14px] text-[#6B6880]">
      <Info size={15} aria-hidden /> {label}
    </p>
  );
}

export function OptionCard({
  icon: Icon,
  title,
  description,
  selected,
  onSelect,
  className = '',
  multi = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
  className?: string;
  /** Checkbox style, for "select all that apply" questions. */
  multi?: boolean;
}) {
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-4 rounded-2xl border px-5 py-4 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5B3DF5]/25 ${
        selected
          ? 'border-[#5B3DF5] bg-gradient-to-br from-[#F2EFFF] to-white ring-4 ring-[#5B3DF5]/10'
          : 'border-[#E4E0F5] bg-white hover:border-[#C7BEF5]'
      } ${className}`}
    >
      {Icon && (
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[#5B3DF5] ${
            selected ? 'bg-[#E4DEFF]' : 'bg-[#F3F1FC]'
          }`}
        >
          <Icon size={20} aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-semibold leading-snug">{title}</span>
        {description && <span className="mt-0.5 block text-[14px] leading-snug text-[#5E5B70]">{description}</span>}
      </span>
      {multi ? (
        <span
          aria-hidden
          className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md border-2 transition-colors ${
            selected ? 'border-[#5B3DF5] bg-[#5B3DF5]' : 'border-[#CFCAE6]'
          }`}
        >
          <motion.span
            initial={false}
            animate={{ scale: selected ? 1 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          >
            <Check size={14} strokeWidth={3} className="text-white" aria-hidden />
          </motion.span>
        </span>
      ) : (
        <span
          aria-hidden
          className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 transition-colors ${
            selected ? 'border-[#5B3DF5]' : 'border-[#CFCAE6]'
          }`}
        >
          <motion.span
            className="h-[10px] w-[10px] rounded-full bg-[#5B3DF5]"
            initial={false}
            animate={{ scale: selected ? 1 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        </span>
      )}
    </button>
  );
}
