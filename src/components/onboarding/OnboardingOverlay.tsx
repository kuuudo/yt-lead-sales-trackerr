// ─────────────────────────────────────────────────────────────────────────
// components/onboarding/OnboardingOverlay.tsx
// ─────────────────────────────────────────────────────────────────────────
// Mount this ONCE near the root of the app (see App.tsx). It renders
// nothing when closed. When open, it sits fixed above the current route —
// whatever page the user was on stays mounted underneath, dimmed and
// blurred via a semi-transparent backdrop, with WelcomeStep centered on
// top of it.
//
// Deliberately NOT reusing pages/Onboarding.tsx here: that page owns its
// own opaque full-page background, which is correct for direct /onboarding
// access but wrong for the overlay case, where the whole point is that the
// real app is still visible (dimmed) behind the Fox.
// ─────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useOnboardingOverlay } from '../../lib/onboarding-overlay';
import WelcomeStep from './WelcomeStep';
import OnboardingVideo from './OnboardingVideo';
import CampaignOnboardingStep from './CampaignOnboardingStep';
import NewsletterOnboardingStep from './CampaignOnboarding/NewsletterOnboardingStep';
import SalesCallOnboardingStep from './CampaignOnboarding/SalesCallOnboardingStep';
import PaidConsultationOnboardingStep from './CampaignOnboarding/PaidConsultationOnboardingStep';
import LeadMagnetOnboardingStep from './CampaignOnboarding/LeadMagnetOnboardingStep';
import GlobalAttributionOnboarding from './InstallationOnboarding/GlobalAttributionOnboarding';
import DirectPurchaseInstallationOnboarding from './InstallationOnboarding/DirectPurchaseInstallationOnboarding';
import NewsletterInstallationOnboarding from './InstallationOnboarding/NewsletterInstallationOnboarding';
import SalesCallInstallationOnboarding from './InstallationOnboarding/SalesCallInstallationOnboarding';
import PaidConsultationInstallationOnboarding from './InstallationOnboarding/PaidConsultationInstallationOnboarding';
import CampaignOnboardingVideo from './CampaignOnboardingVideo/CampaignOnboardingVideo';
import CampaignOnboardingStripeVideo from './CampaignOnboardingVideo/CampaignOnboardingStripeVideo';
import CampaignOnboardingPixelVideo from './CampaignOnboardingVideo/CampaignOnboardingPixelVideo';
import CampaignOnboardingThankYouVideo from './CampaignOnboardingVideo/CampaignOnboardingThankYouVideo';
import PaymentMethodDiagram from './PaymentMethodDiagram';
import type { PurchaseMethod } from './campaignOptionContent';
import { supabase } from '../../lib/supabase';
import { getFunnelState, type CampaignExtended, type StripeConfig } from '../installation/installationHelpers';
import { useEffectiveIdentity } from '../../lib/useEffectiveIdentity';

type OnboardingStep = 'welcome' | 'video' | 'campaign' | 'hub' | 'newsletter' | 'sales_call' | 'consultation' | 'lead_magnet' | 'install_global' | 'install_direct_purchase' | 'install_newsletter' | 'install_sales_call' | 'install_consultation';

type LeadMagnetRow = {
  lead_magnet_name: string;
  lead_magnet_url: string;
  lead_magnet_thankyou_url: string;
};

/* ── 中轉站 hub: shared UI pieces ─────────────────────────────── */
function HubProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = Math.round((completed / total) * 100);
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#6b6b78', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Setup progress
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#15151f' }}>{completed} of {total} completed</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: '#efeffb', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: '#5b3df0', borderRadius: 999, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}

function HubPathCard({
  title,
  description,
  completed,
  clickable,
  onClick,
}: {
  title: string;
  description: string;
  completed: boolean;
  clickable: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#15151f' }}>{title}</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 10,
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            borderRadius: 999,
            padding: '3px 8px',
            color: completed ? '#16a34a' : '#71717a',
            background: completed ? '#e6f7ee' : '#f4f4f5',
            border: completed ? '1px solid #bbf7d0' : '1px solid #e4e4e7',
          }}
        >
          {completed ? '✓ Completed' : '○ Not started'}
        </span>
      </div>
      <p style={{ fontSize: 12, color: '#6b6b78', margin: 0, lineHeight: 1.5 }}>{description}</p>
      {clickable && (
        <span style={{ display: 'inline-block', marginTop: 10, fontSize: 12, fontWeight: 700, color: '#5b3df0' }}>
          {completed ? 'Review →' : 'Set up →'}
        </span>
      )}
    </>
  );

  const sharedStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '14px 16px',
    borderRadius: 12,
    border: completed ? '1px solid #bbf7d0' : '1px solid #d9d9e3',
    background: completed ? '#f6fdf9' : clickable ? '#fff' : '#fafafa',
    width: '100%',
  };

  if (!clickable) {
    return <div style={{ ...sharedStyle, cursor: 'default' }}>{inner}</div>;
  }

  return (
    <button type="button" onClick={onClick} style={{ ...sharedStyle, cursor: 'pointer' }}>
      {inner}
    </button>
  );
}

export default function OnboardingOverlay() {
  const { isOpen, close } = useOnboardingOverlay();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [videoScene, setVideoScene] = useState<'basics' | 'stripe' | 'pixel' | 'thankyou' | PurchaseMethod>('basics');
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<CampaignExtended | null>(null);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnetRow[]>([]);
  const [stripeConfig, setStripeConfig] = useState<StripeConfig | null>(null);
  const { userId } = useEffectiveIdentity();

  // Reset to the first step each time the overlay is opened fresh.
  useEffect(() => {
    if (isOpen) {
      setStep('welcome');
      setCampaignId(null);
      setCampaign(null);
      setLeadMagnets([]);
      setStripeConfig(null);
    }
  }, [isOpen]);

  // 中轉站 hub: (re)fetch the current campaign's row every time we land on
  // 'hub', so completion status always reflects THIS campaign, freshly —
  // including right after a path's config step just wrote to it.
  const loadHubCampaign = useCallback(async () => {
    if (!campaignId) return;

    const { data: campaignRow } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single();
    if (campaignRow) setCampaign(campaignRow as CampaignExtended);

    const { data: magnetRows } = await supabase
      .from('lead_magnets')
      .select('lead_magnet_name, lead_magnet_url, lead_magnet_thankyou_url')
      .eq('campaign_id', campaignId);
    if (magnetRows) setLeadMagnets(magnetRows as LeadMagnetRow[]);

    if (userId) {
      const { data: stripeRow } = await supabase
        .from('stripe_configs')
        .select('stripe_webhook_secret')
        .eq('user_id', userId)
        .maybeSingle();
      setStripeConfig((stripeRow as StripeConfig) ?? null);
    }
  }, [campaignId, userId]);

  useEffect(() => {
    if (step === 'hub' && campaignId) {
      loadHubCampaign();
    }
  }, [step, campaignId, loadHubCampaign]);

  // Escape closes it — a modal with no dismiss path is a trap. Remove this
  // if you'd rather onboarding only be dismissible by finishing it.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  // 中轉站 hub: completion is always derived from THIS campaign's row —
  // never from any other campaign the user might have. Direct Purchase is
  // shown as completed outright per product decision (Option A) — no
  // dynamic check, no click target, no edit mode yet.
  const leadMagnetCompleted = !!campaign?.has_lead_magnet;
  const newsletterCompleted = campaign ? getFunnelState(campaign, 'newsletter') === 'active' : false;
  const salesCallCompleted = campaign ? getFunnelState(campaign, 'salesCall') === 'active' : false;
  const consultationCompleted = campaign ? getFunnelState(campaign, 'consultation') === 'active' : false;
  const completedCount =
    1 /* Direct Purchase, always */ +
    [leadMagnetCompleted, newsletterCompleted, salesCallCompleted, consultationCompleted].filter(Boolean).length;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Onboarding"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            // Click on the scrim (not the frame itself) closes it.
            if (e.target === e.currentTarget) close();
          }}
        >
          {step === 'welcome' && (
            <WelcomeStep
              maxWidth={720}
              onContinue={() => setStep('video')}
            />
          )}

          {step === 'video' && (
            <div
              className="relative w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
              style={{ maxWidth: 820, width: 'min(820px, 94vw)' }}
              // Video frame handles its own clicks (skip / next step); stop
              // clicks inside it from bubbling up to the scrim's close handler.
              onClick={(e) => e.stopPropagation()}
            >
              <OnboardingVideo
                onClose={close}
                onFinish={() => setStep('campaign')}
              />
            </div>
          )}
                   {step === 'campaign' && (
  <div
    className="w-full flex flex-col lg:flex-row gap-4 lg:gap-6 items-stretch justify-center"
    style={{
      maxWidth: 1200,
      width: 'min(1200px, 94vw)',
      height: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    {/* LEFT: video — swaps based on what the user picks on the right */}
    <div className="hidden lg:flex lg:w-[380px] lg:flex-shrink-0 bg-white rounded-2xl overflow-hidden shadow-2xl items-center justify-center p-6">
            {videoScene === 'basics' && <CampaignOnboardingVideo />}
      {videoScene === 'stripe' && <CampaignOnboardingStripeVideo />}
      {videoScene === 'pixel' && <CampaignOnboardingPixelVideo />}
      {videoScene === 'thankyou' && <CampaignOnboardingThankYouVideo />}
      {(videoScene === 'stripe_checkout' ||
        videoScene === 'stripe_embedded' ||
        videoScene === 'embedded_alternative_payment' ||
        videoScene === 'alternative_payment' ||
        videoScene === 'payment_instructions_page' ||
        videoScene === 'external_platform') && (
        <PaymentMethodDiagram method={videoScene} />
      )}
    </div>

    {/* RIGHT: Direct Purchase form */}
    <div className="relative w-full flex-1 min-w-0 bg-white rounded-2xl overflow-hidden shadow-2xl">
      <CampaignOnboardingStep
        onComplete={(id) => {
          setCampaignId(id);
          setStep('hub');
        }}
        onSceneChange={setVideoScene}
      />
    </div>
  </div>
)}

          {step === 'hub' && campaignId && (
  <div
    className="w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
    style={{
      maxWidth: 860,
      width: 'min(860px, 94vw)',
      maxHeight: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div
      style={{
        maxHeight: '90vh',
        overflow: 'auto',
        padding: '28px 24px 24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
      }}
    >
      <div className="flex flex-col lg:flex-row gap-8">
        {/* LEFT: fox guide + progress */}
        <div className="lg:w-[240px] lg:flex-shrink-0">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
            <div
              aria-hidden="true"
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fff',
                border: '1.5px solid #ff7a45',
                fontSize: 22,
              }}
            >
              🦊
            </div>
            <div
              style={{
                background: '#fafafa',
                border: '1px solid #d9d9e3',
                borderRadius: 12,
                padding: '9px 12px',
              }}
            >
              <p style={{ fontSize: 12.5, color: '#15151f', margin: 0, lineHeight: 1.5 }}>
                Let's finish setting up your tracking paths.
              </p>
            </div>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#15151f', margin: '0 0 8px' }}>
            Your main offer is set up 🎉
          </h2>
          <p style={{ fontSize: 13, color: '#6b6b78', margin: '0 0 18px', lineHeight: 1.55 }}>
            Want to add another way customers can become leads or customers? You can do this now or later.
          </p>

          <HubProgressBar completed={completedCount} total={5} />
        </div>

        {/* RIGHT: the five paths */}
        <div className="flex-1 min-w-0">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <HubPathCard
              title="Direct Purchase"
              description="Your main paid conversion path."
              completed={true}
              clickable={false}
            />
            <HubPathCard
              title="Lead Magnet"
              description="A free resource in exchange for contact info."
              completed={leadMagnetCompleted}
              clickable
              onClick={() => setStep('lead_magnet')}
            />
            <HubPathCard
              title="Newsletter"
              description="Track when someone signs up for your list."
              completed={newsletterCompleted}
              clickable
              onClick={() => setStep('newsletter')}
            />
            <HubPathCard
              title="Sales Call"
              description="Let customers book a call with you."
              completed={salesCallCompleted}
              clickable
              onClick={() => setStep('sales_call')}
            />
            <HubPathCard
              title="Paid Consultation"
              description="A paid 1:1 consultation booking path."
              completed={consultationCompleted}
              clickable
              onClick={() => setStep('consultation')}
            />
          </div>

          <button
            type="button"
            onClick={() => setStep('install_global')}
            style={{
              width: '100%',
              padding: '12px 20px',
              borderRadius: 8,
              border: '1px solid #5b3df0',
              background: '#fff',
              color: '#5b3df0',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: 10,
            }}
          >
            Continue to Installation →
          </button>

          <button
            type="button"
            onClick={() => close()}
            style={{
              width: '100%',
              padding: '12px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#5b3df0',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 6px 16px rgba(91,61,240,0.3)',
            }}
          >
            Continue to app →
          </button>
        </div>
      </div>
    </div>
  </div>
)}

          {step === 'newsletter' && campaignId && (
  <div
    className="w-full flex flex-col lg:flex-row gap-4 lg:gap-6 items-stretch justify-center"
    style={{
      maxWidth: 900,
      width: 'min(900px, 94vw)',
      height: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div className="relative w-full flex-1 min-w-0 bg-white rounded-2xl overflow-hidden shadow-2xl">
      <NewsletterOnboardingStep
        campaignId={campaignId}
        initialData={campaign ?? undefined}
        onDone={() => setStep('hub')}
        onBack={() => setStep('hub')}
      />
    </div>
  </div>
)}

          {step === 'sales_call' && campaignId && (
  <div
    className="w-full flex flex-col lg:flex-row gap-4 lg:gap-6 items-stretch justify-center"
    style={{
      maxWidth: 900,
      width: 'min(900px, 94vw)',
      height: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div className="relative w-full flex-1 min-w-0 bg-white rounded-2xl overflow-hidden shadow-2xl">
      <SalesCallOnboardingStep
        campaignId={campaignId}
        initialData={campaign ?? undefined}
        onDone={() => setStep('hub')}
        onBack={() => setStep('hub')}
      />
    </div>
  </div>
)}

          {step === 'consultation' && campaignId && (
  <div
    className="w-full flex flex-col lg:flex-row gap-4 lg:gap-6 items-stretch justify-center"
    style={{
      maxWidth: 900,
      width: 'min(900px, 94vw)',
      height: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div className="relative w-full flex-1 min-w-0 bg-white rounded-2xl overflow-hidden shadow-2xl">
      <PaidConsultationOnboardingStep
        campaignId={campaignId}
        initialData={campaign ?? undefined}
        onDone={() => setStep('hub')}
        onBack={() => setStep('hub')}
      />
    </div>
  </div>
)}

          {step === 'lead_magnet' && campaignId && (
  <div
    className="w-full flex flex-col lg:flex-row gap-4 lg:gap-6 items-stretch justify-center"
    style={{
      maxWidth: 900,
      width: 'min(900px, 94vw)',
      height: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div className="relative w-full flex-1 min-w-0 bg-white rounded-2xl overflow-hidden shadow-2xl">
      <LeadMagnetOnboardingStep
        campaignId={campaignId}
        initialMagnets={leadMagnets}
        onDone={() => setStep('hub')}
        onBack={() => setStep('hub')}
      />
    </div>
  </div>
)}

          {step === 'install_global' && campaignId && (
  <div
    className="w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
    style={{
      maxWidth: 640,
      width: 'min(640px, 94vw)',
      maxHeight: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div style={{ maxHeight: '90vh', overflow: 'auto' }}>
      <GlobalAttributionOnboarding
        onBack={() => setStep('hub')}
        onDone={() => setStep('install_direct_purchase')}
      />
    </div>
  </div>
)}

          {step === 'install_direct_purchase' && campaignId && (
  <div
    className="w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
    style={{
      maxWidth: 720,
      width: 'min(720px, 94vw)',
      maxHeight: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div style={{ maxHeight: '90vh', overflow: 'auto' }}>
      <DirectPurchaseInstallationOnboarding
        campaignId={campaignId}
        onBack={() => setStep('install_global')}
        onDone={() => setStep('install_newsletter')}
      />
    </div>
  </div>
)}

          {step === 'install_newsletter' && campaignId && (
  <div
    className="w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
    style={{
      maxWidth: 720,
      width: 'min(720px, 94vw)',
      maxHeight: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div style={{ maxHeight: '90vh', overflow: 'auto' }}>
      <NewsletterInstallationOnboarding
        campaignId={campaignId}
        onBack={() => setStep('install_direct_purchase')}
        onDone={() => setStep('install_sales_call')}
      />
    </div>
  </div>
)}

          {step === 'install_sales_call' && campaignId && (
  <div
    className="w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
    style={{
      maxWidth: 720,
      width: 'min(720px, 94vw)',
      maxHeight: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div style={{ maxHeight: '90vh', overflow: 'auto' }}>
      <SalesCallInstallationOnboarding
        campaignId={campaignId}
        onBack={() => setStep('install_newsletter')}
        onDone={() => setStep('install_consultation')}
      />
    </div>
  </div>
)}

          {step === 'install_consultation' && campaignId && (
  <div
    className="w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
    style={{
      maxWidth: 720,
      width: 'min(720px, 94vw)',
      maxHeight: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div style={{ maxHeight: '90vh', overflow: 'auto' }}>
      <PaidConsultationInstallationOnboarding
        campaignId={campaignId}
        onBack={() => setStep('install_sales_call')}
        onDone={() => close()}
      />
    </div>
  </div>
)}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
