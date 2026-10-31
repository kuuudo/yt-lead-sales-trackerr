// src/pages/onboardingFlow/PostSignupSteps.tsx
//
// The two full-screen, light-style screens of the post-signup onboarding:
//   CampaignScreen - create the first campaign (same createCampaign() as the Campaigns page)
//   FinishScreen   - shown once the first Asset is in the Library; "Finish" ends onboarding
//
// The two guided stages in between (track content, create asset) are NOT screens:
// they run as follow-along guides over the real app (see OnboardingGate).

import { useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import OnboardingShell, { FONT } from '../../components/onboardingFlow/OnboardingShell';
import { createCampaign, NEW_CAMPAIGN_DEFAULTS } from '../../lib/createCampaign';
import { useAuth } from '../../lib/auth';
import { SUPPORT_WHATSAPP_URL } from '../../lib/support';

/** Campaign, Track content, Create Asset, Finish. */
const TOTAL = 4;

const inputClass =
  'mt-2 w-full rounded-2xl border border-[#E4E0F5] bg-white px-4 py-3 text-[16px] outline-none transition placeholder:text-[#A29EB8] focus:border-[#5B3DF5] focus:ring-4 focus:ring-[#5B3DF5]/15';

function Eyebrow({ children }: { children: string }) {
  return (
    <span className="text-[11px] uppercase tracking-[0.14em] text-[#5B3DF5]" style={FONT.mono}>
      {children}
    </span>
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

function SupportLink() {
  return (
    <a
      href={SUPPORT_WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-[#5B3DF5] underline-offset-4 hover:underline"
    >
      Contact support on WhatsApp
    </a>
  );
}

/* ───────────── Stage 1 · Create the first campaign ───────────── */

export function CampaignScreen({
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

  const submit = async () => {
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
      // Stay busy on success: the gate re-reads progress and swaps this screen away,
      // so a second click can never create a duplicate campaign.
      onCreated();
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit();
  };

  return (
    <OnboardingShell
      step={1}
      totalSteps={TOTAL}
      hideLogin
      scrollKey="campaign"
      onNext={() => void submit()}
      nextLabel={busy ? 'Creating…' : 'Create campaign'}
      nextDisabled={busy}
      footerNote="Track. Attribute. Grow."
    >
      <div>
        <div className="flex items-center justify-between gap-4">
          <Eyebrow>Quick setup — Your first campaign</Eyebrow>
          <span className="text-[11px] uppercase tracking-[0.14em] text-[#6B6880]" style={FONT.mono}>
            About 1 minute
          </span>
        </div>
        <h1
          className="mt-5 text-[40px] font-extrabold leading-[1.03] tracking-[-0.035em] sm:text-[56px]"
          style={FONT.display}
        >
          You’re in. Let’s create your first campaign.
        </h1>
        <p className="mt-4 max-w-[34em] text-[17px] leading-relaxed text-[#5E5B70]">
          A campaign is what you’re promoting. Next we’ll track one piece of content and turn it into a reusable Asset.
        </p>

        <form onSubmit={onFormSubmit} className="mt-9 flex flex-col gap-5">
          <label className="block">
            <span className="text-[14px] font-medium">What are you selling?</span>
            <input
              autoFocus
              type="text"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="For example: my coaching program"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-[14px] font-medium">Website where people buy or sign up</span>
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
            <span className="text-[14px] font-medium">Approximate price of your offer</span>
            <input
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="For example: 997"
              className={inputClass}
            />
            <span className="mt-2 block text-[13px] leading-snug text-[#5E5B70]">
              A rough number is fine. You can update it anytime in your Campaign settings.
            </span>
          </label>

          {error && (
            <p role="alert" className="text-[14px] font-medium text-[#C0392B]">
              {error}
            </p>
          )}

          {/* Lets the Enter key submit; the visible button is the footer's main button. */}
          <button type="submit" tabIndex={-1} aria-hidden className="sr-only">
            Create campaign
          </button>
        </form>
      </div>
    </OnboardingShell>
  );
}

/* ───────────── Stage 4 · Finish ───────────── */

const DONE_ITEMS = ['Created your first campaign', 'Tracked your first content', 'Created your first Asset'];

export function FinishScreen({ onFinish }: { onFinish: () => Promise<void> }) {
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
    <OnboardingShell
      step={TOTAL}
      totalSteps={TOTAL}
      hideLogin
      scrollKey="finish"
      onNext={() => void finish()}
      nextLabel={busy ? 'Finishing…' : 'Finish'}
      nextDisabled={busy}
      footerNote="Track. Attribute. Grow."
    >
      <div>
        <Eyebrow>All done</Eyebrow>
        <h1
          className="mt-5 text-[40px] font-extrabold leading-[1.03] tracking-[-0.035em] sm:text-[56px]"
          style={FONT.display}
        >
          You’re all set.
        </h1>
        <p className="mt-4 max-w-[34em] text-[17px] leading-relaxed text-[#5E5B70]">
          That’s the core of VSTRK: your content, a tracking link, and the results behind it. You can revisit the
          guides any time from Get Started.
        </p>

        <ul className="mt-9 flex flex-col gap-3">
          {DONE_ITEMS.map((label) => (
            <li
              key={label}
              className="flex items-center gap-4 rounded-2xl border border-[#E4E0F5] bg-white px-5 py-4"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#F0EDFD] text-[#5B3DF5]">
                <CheckCircle2 size={20} aria-hidden />
              </span>
              <span className="text-[17px] font-semibold leading-snug">{label}</span>
            </li>
          ))}
        </ul>

        {busy && (
          <p className="mt-6 flex items-center gap-2 text-[14px] text-[#5E5B70]">
            <Loader2 size={15} className="animate-spin" aria-hidden /> Saving…
          </p>
        )}
        {failed && (
          <p role="alert" className="mt-6 text-[14px] font-medium text-[#C0392B]">
            We couldn’t save that. Please try Finish again, or <SupportLink />.
          </p>
        )}
      </div>
    </OnboardingShell>
  );
}
