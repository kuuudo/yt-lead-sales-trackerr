// src/pages/onboardingFlow/PostSignupSteps.tsx
//
// The two pop-ups of the post-signup onboarding. They float over the real app
// (centered on desktop, a bottom sheet on phones) instead of taking the whole page:
//   CampaignModal - create the first campaign (same createCampaign() as the Campaigns page)
//   FinishModal   - the "first stage completed" transition, shown once the first collaboration exists;
//                   "Continue to Setup" ends onboarding and sends the user on to Get Started
//                   (deliberately no "later" option)
//
// The two guided stages in between (track content, create asset) are NOT pop-ups:
// they run as follow-along guides over the real app (see OnboardingGate).

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { FONT } from '../../components/onboardingFlow/OnboardingShell';
import { createCampaign, NEW_CAMPAIGN_DEFAULTS } from '../../lib/createCampaign';
import { useAuth } from '../../lib/auth';
import { SUPPORT_WHATSAPP_URL } from '../../lib/support';

// 16px inputs on purpose: smaller text makes iOS Safari zoom the page on focus.
const inputClass =
  'mt-1.5 w-full rounded-xl border border-[#E4E0F5] bg-white px-4 py-3 text-[16px] text-[#14121F] outline-none transition placeholder:text-[#A29EB8] focus:border-[#5B3DF5] focus:ring-4 focus:ring-[#5B3DF5]/15';

const primaryButton =
  'mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-[#5B3DF5] text-[13px] font-medium uppercase tracking-[0.14em] text-white shadow-[0_12px_28px_-10px_rgba(91,61,245,0.6)] transition hover:bg-[#4A2FE0] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#5B3DF5]/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none';

/** Same font link the pre-signup flow uses (same id, so it is only ever added once). */
function useOnboardingFonts() {
  useEffect(() => {
    if (document.getElementById('vstrk-onboarding-fonts')) return;
    const link = document.createElement('link');
    link.id = 'vstrk-onboarding-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
    document.head.appendChild(link);
  }, []);
}

/** Dimmed backdrop + card. Centered on desktop, a bottom sheet on phones. Not dismissible. */
function ModalFrame({ label, children }: { label: string; children: ReactNode }) {
  useOnboardingFonts();
  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto bg-[#14121F]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="max-h-[92dvh] w-full max-w-[460px] overflow-y-auto rounded-t-3xl bg-[#FBFAFF] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[#14121F] shadow-[0_30px_80px_-20px_rgba(20,18,31,0.55)] sm:rounded-3xl sm:p-8"
        style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: 'easeOut' }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function Heading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div>
      <span className="text-[11px] uppercase tracking-[0.14em] text-[#5B3DF5]" style={FONT.mono}>
        {eyebrow}
      </span>
      <h2 className="mt-3 text-[28px] font-extrabold leading-[1.08] tracking-[-0.03em]" style={FONT.display}>
        {title}
      </h2>
      <p className="mt-2 text-[15px] leading-snug text-[#5E5B70]">{subtitle}</p>
    </div>
  );
}

/** Adds https:// when missing. Returns null when it does not look like a website. */
function normalizeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes('.') ? withScheme : null;
  } catch {
    return null;
  }
}

/** Never sends NaN or a negative number to the database. */
function parsePrice(raw: string): number {
  const n = parseFloat(raw.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/* ───────────── Stage 1 · Create the first campaign ───────────── */

export function CampaignModal({
  organizationId,
  onCreated,
}: {
  organizationId: string | null;
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [product, setProduct] = useState('');
  const [website, setWebsite] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-focus only with a mouse: on phones it would pop the keyboard up over the sheet.
  const canAutoFocus = typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const name = product.trim();
    const url = normalizeUrl(website);
    if (!name) return setError('Please tell us what you’re selling.');
    if (!url) return setError('Please enter a valid website, like yourbrand.com.');
    if (!user || !organizationId) return setError('Your workspace is not ready yet. Please refresh the page.');

    setBusy(true);
    setError(null);
    try {
      await createCampaign({
        formData: {
          ...NEW_CAMPAIGN_DEFAULTS,
          campaign_name: name,
          landing_page_url: url,
          offer_price: parsePrice(price),
        },
        userId: user.id,
        organizationId,
      });
      // Stay busy on success: the gate re-reads progress and swaps this pop-up away,
      // so a second click can never create a duplicate campaign.
      onCreated();
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <ModalFrame label="Set up your first campaign">
      <Heading
        eyebrow="Quick setup"
        title="You’re in. Let’s set you up."
        subtitle="Start with your first campaign. It takes a minute."
      />

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <label className="block">
          <span className="text-[14px] font-medium">What are you selling?</span>
          <input
            autoFocus={canAutoFocus}
            type="text"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            placeholder="e.g. My coaching program"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-[14px] font-medium">Your website</span>
          <input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="yourbrand.com"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-[14px] font-medium">Approximate price</span>
          <input
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 997"
            className={inputClass}
          />
          <span className="mt-1.5 block text-[13px] leading-snug text-[#6B6880]">
            A rough number is fine. You can change it later.
          </span>
        </label>

        {error && (
          <p role="alert" className="text-[14px] font-medium text-[#C0392B]">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className={primaryButton} style={FONT.mono}>
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {busy ? 'Creating…' : 'Create campaign'}
        </button>
      </form>
    </ModalFrame>
  );
}

/* ───────────── Final stage · Finish ───────────── */

const DONE_ITEMS = [
  'First campaign created',
  'First content tracked',
  'First Asset created',
  'First collaboration created',
];

export function FinishModal({ onFinish }: { onFinish: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onFinish();
    } catch (err) {
      console.error('[onboarding] could not save Finish:', err);
      setFailed(true);
      setBusy(false);
    }
  };

  return (
    <ModalFrame label="First stage completed">
      <Heading
        eyebrow="First stage completed"
        title="You’ve Got the Basics."
        subtitle="You’ve learned the basics of VSTRK. Now let’s set up your tracking."
      />

      <span className="mt-6 block text-[11px] uppercase tracking-[0.14em] text-[#6B6880]" style={FONT.mono}>
        What you’ve completed
      </span>
      <ul className="mt-3 flex flex-col gap-2.5">
        {DONE_ITEMS.map((label) => (
          <li key={label} className="flex items-center gap-3 rounded-xl border border-[#E4E0F5] bg-white px-4 py-3">
            <CheckCircle2 size={18} className="shrink-0 text-[#5B3DF5]" aria-hidden />
            <span className="text-[15px] font-medium">{label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-xl border border-[#E4E0F5] bg-[#F1EEFF] px-4 py-3">
        <span className="text-[11px] uppercase tracking-[0.14em] text-[#5B3DF5]" style={FONT.mono}>
          Next: Complete Your Setup
        </span>
        <p className="mt-1.5 text-[14px] leading-snug text-[#14121F]">
          Track revenue, newsletter signups, sales calls and consultations.
        </p>
      </div>

      {failed && (
        <p role="alert" className="mt-4 text-[14px] font-medium text-[#C0392B]">
          We couldn’t save that. Please try again, or{' '}
          <a
            href={SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#5B3DF5] underline-offset-4 hover:underline"
          >
            contact support
          </a>
          .
        </p>
      )}

      <button type="button" onClick={() => void finish()} disabled={busy} className={primaryButton} style={FONT.mono}>
        {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
        {busy ? 'Opening…' : 'Continue to Setup →'}
      </button>
    </ModalFrame>
  );
}
