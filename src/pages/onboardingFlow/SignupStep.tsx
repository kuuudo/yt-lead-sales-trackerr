import { useEffect, useState, type FormEvent } from 'react';
import { MailCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { createUserWorkspace } from '../../lib/createUserWorkspace';
import { FONT } from '../../components/onboardingFlow/OnboardingShell';

/** The footer's main button clicks this hidden submit button, so the whole page behaves like one form. */
export const SIGNUP_SUBMIT_ID = 'onboarding-signup-submit';

const inputClass =
  'mt-2 w-full rounded-2xl border border-[#E4E0F5] bg-white px-4 py-3 text-[16px] outline-none transition placeholder:text-[#A29EB8] focus:border-[#5B3DF5] focus:ring-4 focus:ring-[#5B3DF5]/15';

/**
 * Step 7 · Create account. Same email + password sign-up as pages/Auth.tsx (supabase.auth.signUp, then
 * createUserWorkspace), just in the onboarding look. Nothing here changes how authentication works.
 *
 * When sign-up returns a session, App swaps to the logged-in routes by itself (/start → /tree) and the
 * onboarding answers are linked to the new account by useLinkOnboardingOnSignIn.
 * When your Supabase project requires email confirmation there is no session yet, so we show a
 * "check your email" panel instead.
 */
export default function SignupStep({ onLockedChange }: { onLockedChange: (locked: boolean) => void }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  // The footer button is disabled while signing up, and after the confirmation email was sent.
  useEffect(() => {
    onLockedChange(busy || sentTo !== null);
  }, [busy, sentTo, onLockedChange]);
  useEffect(() => () => onLockedChange(false), [onLockedChange]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const cleanEmail = email.trim();
    const cleanName = fullName.trim();
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { data: { full_name: cleanName } },
      });
      if (signUpError) throw signUpError;

      // With email confirmation on, Supabase answers an already-registered email with no error and no identities.
      if (data.user && data.user.identities?.length === 0) {
        throw new Error('An account with this email already exists. Please log in instead.');
      }

      if (data.user) {
        // Same order as pages/Auth.tsx: the workspace needs an active session.
        const session = data.session ?? (await supabase.auth.getSession()).data.session;
        if (session) {
          await createUserWorkspace(data.user.id, cleanEmail, cleanName);
        } else {
          setSentTo(cleanEmail);
        }
      }
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-[11px] uppercase tracking-[0.14em] text-[#5B3DF5]" style={FONT.mono}>
          Last step — Your account
        </span>
        <span className="text-[11px] uppercase tracking-[0.14em] text-[#6B6880]" style={FONT.mono}>
          Onboarding
        </span>
      </div>
      <h1
        className="mt-5 text-[40px] font-extrabold leading-[1.03] tracking-[-0.035em] sm:text-[56px]"
        style={FONT.display}
      >
        Now let’s create your account.
      </h1>
      <p className="mt-4 max-w-[34em] text-[17px] leading-relaxed text-[#5E5B70]">
        So we can quickly help you start tracking your links.
      </p>

      {sentTo ? (
        <div role="status" className="mt-9 flex gap-4 rounded-2xl border border-[#E4E0F5] bg-white p-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#F0EDFD] text-[#5B3DF5]">
            <MailCheck size={20} aria-hidden />
          </span>
          <div>
            <p className="text-[17px] font-semibold">Check your email</p>
            <p className="mt-1 text-[14px] leading-snug text-[#5E5B70]">
              We sent a confirmation link to <strong>{sentTo}</strong>. Open it to finish creating your account.
            </p>
          </div>
        </div>
      ) : (
        <form id="onboarding-signup-form" onSubmit={onSubmit} className="mt-9 flex flex-col gap-5">
          <label className="block">
            <span className="text-[14px] font-medium">Full name</span>
            <input
              required
              type="text"
              name="name"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-[14px] font-medium">Email address</span>
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-[14px] font-medium">Password</span>
            <input
              required
              type="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={inputClass}
            />
          </label>

          {error && (
            <p role="alert" className="text-[14px] font-medium text-[#C0392B]">
              {error}
            </p>
          )}

          {/* Lets the Enter key submit; the visible button is the footer's main button. */}
          <button id={SIGNUP_SUBMIT_ID} type="submit" tabIndex={-1} aria-hidden className="sr-only">
            Create my account
          </button>

          <p className="text-[13px] leading-snug text-[#5E5B70]">
            Your answers so far will be saved to your new account.{' '}
            <a href="/login" className="font-medium text-[#5B3DF5] underline-offset-4 hover:underline">
              Already have an account? Log in
            </a>
          </p>
        </form>
      )}
    </div>
  );
}
