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

import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useOnboardingOverlay } from '../../lib/onboarding-overlay';
import WelcomeStep from './WelcomeStep';
import OnboardingVideo from './OnboardingVideo';
import CampaignOnboardingStep from './CampaignOnboardingStep';
import NewsletterOnboardingStep from './CampaignOnboarding/NewsletterOnboardingStep';
import SalesCallOnboardingStep from './CampaignOnboarding/SalesCallOnboardingStep';
import PaidConsultationOnboardingStep from './CampaignOnboarding/PaidConsultationOnboardingStep';
import CampaignOnboardingVideo from './CampaignOnboardingVideo/CampaignOnboardingVideo';
import CampaignOnboardingStripeVideo from './CampaignOnboardingVideo/CampaignOnboardingStripeVideo';
import CampaignOnboardingPixelVideo from './CampaignOnboardingVideo/CampaignOnboardingPixelVideo';
import CampaignOnboardingThankYouVideo from './CampaignOnboardingVideo/CampaignOnboardingThankYouVideo';
import PaymentMethodDiagram from './PaymentMethodDiagram';
import type { PurchaseMethod } from './campaignOptionContent';
type OnboardingStep = 'welcome' | 'video' | 'campaign' | 'hub' | 'newsletter' | 'sales_call' | 'consultation';

export default function OnboardingOverlay() {
  const { isOpen, close } = useOnboardingOverlay();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [videoScene, setVideoScene] = useState<'basics' | 'stripe' | 'pixel' | 'thankyou' | PurchaseMethod>('basics');
  const [campaignId, setCampaignId] = useState<string | null>(null);

  // Reset to the first step each time the overlay is opened fresh.
  useEffect(() => {
    if (isOpen) {
      setStep('welcome');
      setCampaignId(null);
    }
  }, [isOpen]);

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
      maxWidth: 520,
      width: 'min(520px, 94vw)',
      maxHeight: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div style={{ padding: '28px 24px 24px', fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif' }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#15151f', margin: '0 0 8px' }}>
        Your main offer is set up 🎉
      </h2>
      <p style={{ fontSize: 13, color: '#6b6b78', margin: '0 0 20px', lineHeight: 1.55 }}>
        Want to add another way customers can become leads or customers? You can do this now or later.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setStep('newsletter')}
          style={{
            textAlign: 'left',
            padding: '14px 16px',
            borderRadius: 12,
            border: '1px solid #d9d9e3',
            background: '#fff',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
            color: '#15151f',
          }}
        >
          Newsletter → Set up
        </button>
        <button
          type="button"
          onClick={() => setStep('sales_call')}
          style={{
            textAlign: 'left',
            padding: '14px 16px',
            borderRadius: 12,
            border: '1px solid #d9d9e3',
            background: '#fff',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
            color: '#15151f',
          }}
        >
          Sales Call → Set up
        </button>
        <button
          type="button"
          onClick={() => setStep('consultation')}
          style={{
            textAlign: 'left',
            padding: '14px 16px',
            borderRadius: 12,
            border: '1px solid #d9d9e3',
            background: '#fff',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
            color: '#15151f',
          }}
        >
          Paid Consultation → Set up
        </button>
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 12,
            border: '1px solid #e8e8ee',
            background: '#fafafa',
            fontSize: 13,
            color: '#6b6b78',
          }}
        >
          Lead Magnet — coming next
        </div>
      </div>

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
        onDone={() => setStep('hub')}
        onBack={() => setStep('hub')}
      />
    </div>
  </div>
)}

        </motion.div>
      )}
    </AnimatePresence>
  );
}
