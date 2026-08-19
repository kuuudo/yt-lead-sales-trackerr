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
import BookingMethodDiagram from './BookingMethodDiagram';
import WebsiteStructureGuide from './WebsiteStructureGuide';
import HubVideoWebsiteStructure from './PixelSetupVideo/WebsiteStructureIsImportant';
import HubVideoThankYouPixel from './PixelSetupVideo/WhyDoWeNeedThankYouPagePixel';
import HubVideoGlobalAttribution from './PixelSetupVideo/WhyDoWeNeedGlobalAttribution';
import HubVideoInstallGlobalAttribution from './PixelSetupVideo/HowtoInstallGlobalAttribution';
import HubVideoMultipleWebsites from './PixelSetupVideo/WhyGlobalAttributionOnMultipleWebsite';
import HubVideoMultipleThankYouPixels from './PixelSetupVideo/WhyThankyouPixelOnMultipleWebsite';
import { SALES_CALL_DELIVERY_OPTIONS, type PurchaseMethod, type DeliveryValue } from './campaignOptionContent';
import { supabase } from '../../lib/supabase';
import { getFunnelState, getTrackingState, type CampaignExtended, type StripeConfig } from '../installation/installationHelpers';
import { isGlobalAttributionComplete, type GlobalAttributionPath } from './InstallationOnboarding/globalAttributionCompletion';
import { isPixelSetupComplete, type PixelSetupPath } from './InstallationOnboarding/pixelSetupCompletion';
import { useEffectiveIdentity } from '../../lib/useEffectiveIdentity';

type OnboardingStep = 'welcome' | 'video' | 'campaign' | 'hub' | 'newsletter' | 'sales_call' | 'consultation' | 'lead_magnet' | 'install_global' | 'install_direct_purchase' | 'install_newsletter' | 'install_sales_call' | 'install_consultation';

type LeadMagnetRow = {
  lead_magnet_name: string;
  lead_magnet_url: string;
  lead_magnet_thankyou_url: string;
};


type HubVideoTabKey =
  | 'structure_guide'
  | 'structure_video'
  | 'thankyou_pixel'
  | 'global_attribution'
  | 'install_global_attribution'
  | 'multiple_websites'
  | 'multiple_thankyou_pixels';

const HUB_VIDEO_TABS: {
  key: HubVideoTabKey;
  label: string;
  Component: React.ComponentType<{ onSkip?: () => void; onComplete?: () => void }>;
}[] = [
  { key: 'structure_guide', label: 'Website Structure ⭐', Component: WebsiteStructureGuide },
  { key: 'structure_video', label: 'Website Structure (video)', Component: HubVideoWebsiteStructure },
  { key: 'thankyou_pixel', label: 'Thank-You Page Pixel', Component: HubVideoThankYouPixel },
  { key: 'global_attribution', label: 'Global Attribution', Component: HubVideoGlobalAttribution },
  { key: 'install_global_attribution', label: 'Install Global Attribution', Component: HubVideoInstallGlobalAttribution },
  { key: 'multiple_websites', label: 'Multiple Websites', Component: HubVideoMultipleWebsites },
  { key: 'multiple_thankyou_pixels', label: 'Multiple Thank-You Pages', Component: HubVideoMultipleThankYouPixels },
];

/* ── 中轉站 hub: shared UI pieces ─────────────────────────────── */
function HubProgressBar({
  label,
  completed,
  total,
}: {
  label: string;
  completed: number;
  total: number;
}) {
  const pct = Math.round((completed / total) * 100);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#6b6b78', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#15151f' }}>{completed} of {total}</span>
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

/* ── 中轉站 hub: two-part path row (Config node + Install node) ──── */
function PathStatusTag({ label, tone }: { label: string; tone: 'done' | 'pending' | 'muted' }) {
  const styles =
    tone === 'done'
      ? { color: '#16a34a', background: '#e6f7ee', border: '1px solid #bbf7d0' }
      : tone === 'pending'
      ? { color: '#71717a', background: '#f4f4f5', border: '1px solid #e4e4e7' }
      : { color: '#a1a1aa', background: '#fafafa', border: '1px solid #ececec' };
  return (
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
        ...styles,
      }}
    >
      {label}
    </span>
  );
}

function HubConfigNode({
  title,
  description,
  completed,
  locked,
  onClick,
}: {
  title: string;
  description: string;
  completed: boolean;
  locked?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: '#15151f' }}>{title}</span>
        <PathStatusTag label={completed ? '✓ Completed' : '○ Not started'} tone={completed ? 'done' : 'pending'} />
      </div>
      <p style={{ fontSize: 11.5, color: '#6b6b78', margin: 0, lineHeight: 1.5 }}>{description}</p>
      {!locked && (
        <span style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 700, color: '#5b3df0' }}>
          {completed ? 'Review →' : 'Set up →'}
        </span>
      )}
    </>
  );

  const sharedStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '12px 14px',
    borderRadius: 12,
    border: completed ? '1px solid #bbf7d0' : '1px solid #d9d9e3',
    background: completed ? '#f6fdf9' : locked ? '#fafafa' : '#fff',
    flex: '1 1 200px',
    minWidth: 180,
  };

  if (locked) {
    return <div style={{ ...sharedStyle, cursor: 'default' }}>{inner}</div>;
  }

  return (
    <button type="button" onClick={onClick} style={{ ...sharedStyle, cursor: 'pointer' }}>
      {inner}
    </button>
  );
}

function HubInstallNode({
  title,
  completed,
  configReady,
  onClick,
}: {
  title: string;
  completed: boolean;
  configReady: boolean;
  onClick?: () => void;
}) {
  const clickable = configReady;
  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: clickable ? '#15151f' : '#a1a1aa' }}>{title}</span>
        <PathStatusTag
          label={!configReady ? '○ Not available yet' : completed ? '✓ Completed' : '○ Not installed'}
          tone={!configReady ? 'muted' : completed ? 'done' : 'pending'}
        />
      </div>
      {clickable ? (
        <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, color: '#5b3df0' }}>
          {completed ? 'Review →' : 'Install →'}
        </span>
      ) : (
        <p style={{ fontSize: 11.5, color: '#a1a1aa', margin: 0, lineHeight: 1.5 }}>
          Finish the setup on the left first.
        </p>
      )}
    </>
  );

  const sharedStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '12px 14px',
    borderRadius: 12,
    border: !clickable ? '1px dashed #e4e4e7' : completed ? '1px solid #bbf7d0' : '1px solid #d9d9e3',
    background: !clickable ? '#fafafa' : completed ? '#f6fdf9' : '#fff',
    flex: '1 1 200px',
    minWidth: 180,
    opacity: clickable ? 1 : 0.75,
  };

  if (!clickable) {
    return <div style={{ ...sharedStyle, cursor: 'not-allowed' }}>{inner}</div>;
  }

  return (
    <button type="button" onClick={onClick} style={{ ...sharedStyle, cursor: 'pointer' }}>
      {inner}
    </button>
  );
}

function HubPathArrow() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#c4c4cc',
        fontSize: 16,
        padding: '0 2px',
        flex: '0 0 auto',
      }}
    >
      →
    </div>
  );
}

function HubPathRow({
  configTitle,
  configDescription,
  configCompleted,
  configLocked,
  onConfigClick,
  installTitle,
  installCompleted,
  showInstall,
  onInstallClick,
  attributionCompleted,
  onAttributionClick,
}: {
  configTitle: string;
  configDescription: string;
  configCompleted: boolean;
  configLocked?: boolean;
  onConfigClick?: () => void;
  installTitle?: string;
  installCompleted?: boolean;
  showInstall: boolean;
  onInstallClick?: () => void;
  attributionCompleted?: boolean;
  onAttributionClick?: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
      <HubConfigNode
        title={configTitle}
        description={configDescription}
        completed={configCompleted}
        locked={configLocked}
        onClick={onConfigClick}
      />
      {showInstall && (
        <>
          <HubPathArrow />
          {/* Middle node: Global Attribution. Reuses HubInstallNode as-is —
              it's already generic (title/completed/configReady/onClick).
              Locked until this path's config step is completed; never
              hidden, even once completed (per product rule). */}
          <HubInstallNode
            title="Global Attribution"
            completed={!!attributionCompleted}
            configReady={configCompleted}
            onClick={onAttributionClick}
          />
          <HubPathArrow />
          <HubInstallNode
            title={installTitle || ''}
            completed={!!installCompleted}
            configReady={configCompleted}
            onClick={onInstallClick}
          />
        </>
      )}
    </div>
  );
}

// Discriminated union for the left-panel scene. Kept here in
// OnboardingOverlay.tsx only — CampaignOnboardingStep.tsx keeps its own
// existing flat-string onSceneChange signature untouched (see
// handleCampaignScene below), so this type never needs to reach it.
// The `kind` discriminant exists specifically because PurchaseMethod and
// DeliveryValue both contain an 'external_platform' value with different
// meanings (payment vs. booking) — a flat union would collide the two.
type VideoScene =
  | { kind: 'video'; name: 'basics' | 'stripe' | 'pixel' | 'thankyou' }
  | { kind: 'payment'; method: PurchaseMethod }
  | { kind: 'booking'; value: DeliveryValue }
  | { kind: 'idle' };

const SUPPORT_WHATSAPP_URL =
  'https://chat.whatsapp.com/G07wVgoAyRS3Z171uRDQ1K?s=cl&p=a&mlu=4';

export default function OnboardingOverlay() {
  const { isOpen, close } = useOnboardingOverlay();
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [videoScene, setVideoScene] = useState<VideoScene>({ kind: 'video', name: 'basics' });

  // Adapter ONLY for CampaignOnboardingStep.tsx's existing onSceneChange
  // prop, whose signature is (scene: 'basics'|'stripe'|'pixel'|'thankyou'|PurchaseMethod) => void
  // and must not change. Wraps whatever it sends into the VideoScene shape
  // above without CampaignOnboardingStep.tsx knowing this layer exists.
  const handleCampaignScene = useCallback(
    (scene: 'basics' | 'stripe' | 'pixel' | 'thankyou' | PurchaseMethod) => {
      if (scene === 'basics' || scene === 'stripe' || scene === 'pixel' || scene === 'thankyou') {
        setVideoScene({ kind: 'video', name: scene });
      } else {
        setVideoScene({ kind: 'payment', method: scene });
      }
    },
    []
  );
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<CampaignExtended | null>(null);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnetRow[]>([]);
  const [stripeConfig, setStripeConfig] = useState<StripeConfig | null>(null);
  const [hubVideoTab, setHubVideoTab] = useState<HubVideoTabKey>('structure_guide');
  const [globalAttributionPath, setGlobalAttributionPath] = useState<GlobalAttributionPath | null>(null);
  const { userId } = useEffectiveIdentity();

  const goToNextHubVideoTab = useCallback(() => {
    setHubVideoTab((current) => {
      const index = HUB_VIDEO_TABS.findIndex((t) => t.key === current);
      const next = HUB_VIDEO_TABS[index + 1];
      return next ? next.key : current;
    });
  }, []);

  // Reset to the first step each time the overlay is opened fresh.
  useEffect(() => {
    if (isOpen) {
      setStep('welcome');
      setCampaignId(null);
      setCampaign(null);
      setLeadMagnets([]);
      setStripeConfig(null);
      setHubVideoTab('structure_guide');
      setGlobalAttributionPath(null);
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

  // Install-side status — separate from the config-side booleans above.
  // "completed" here means getTrackingState returned 'active'. If it
  // returned 'pending' (e.g. thank-you URL missing, or Stripe not
  // connected), we still show it as "not installed" for now — Step 2
  // is only adding the two-state visual (done vs. not done), not a
  // three-state one.
  const directPurchaseInstallCompleted =
    (campaign ? getTrackingState(campaign, 'purchase', stripeConfig) === 'active' : false) ||
    isPixelSetupComplete(campaignId, 'purchase');
  const newsletterInstallCompleted =
    (campaign ? getTrackingState(campaign, 'newsletter', stripeConfig) === 'active' : false) ||
    isPixelSetupComplete(campaignId, 'newsletter');
  const salesCallInstallCompleted =
    (campaign ? getTrackingState(campaign, 'salesCall', stripeConfig) === 'active' : false) ||
    isPixelSetupComplete(campaignId, 'salesCall');
  const consultationInstallCompleted =
    (campaign ? getTrackingState(campaign, 'consultation', stripeConfig) === 'active' : false) ||
    isPixelSetupComplete(campaignId, 'consultation');

  const installedCount = [
    directPurchaseInstallCompleted,
    newsletterInstallCompleted,
    salesCallInstallCompleted,
    consultationInstallCompleted,
  ].filter(Boolean).length;

  // Global Attribution completion — read fresh on every render straight
  // from localStorage (via globalAttributionCompletion.ts), scoped to
  // THIS campaignId + path. No extra state needed: whenever the user
  // returns from the 'install_global' screen, the hub re-renders and
  // these are recalculated automatically.
  const directPurchaseAttributionCompleted = isGlobalAttributionComplete(campaignId, 'purchase');
  const newsletterAttributionCompleted = isGlobalAttributionComplete(campaignId, 'newsletter');
  const salesCallAttributionCompleted = isGlobalAttributionComplete(campaignId, 'salesCall');
  const consultationAttributionCompleted = isGlobalAttributionComplete(campaignId, 'consultation');

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
            {videoScene.kind === 'video' && videoScene.name === 'basics' && <CampaignOnboardingVideo />}
      {videoScene.kind === 'video' && videoScene.name === 'stripe' && <CampaignOnboardingStripeVideo />}
      {videoScene.kind === 'video' && videoScene.name === 'pixel' && <CampaignOnboardingPixelVideo />}
      {videoScene.kind === 'video' && videoScene.name === 'thankyou' && <CampaignOnboardingThankYouVideo />}
      {videoScene.kind === 'payment' && <PaymentMethodDiagram method={videoScene.method} />}
    </div>

    {/* RIGHT: Direct Purchase form */}
    <div className="relative w-full flex-1 min-w-0 bg-white rounded-2xl overflow-hidden shadow-2xl">
      <CampaignOnboardingStep
        onComplete={(id) => {
          setCampaignId(id);
          setStep('hub');
        }}
        onSceneChange={handleCampaignScene}
      />
    </div>
  </div>
)}

          {step === 'hub' && campaignId && (
  <div
    className="w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
    style={{
      maxWidth: 1180,
      width: 'min(1180px, 96vw)',
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
      <div className="flex flex-col lg:flex-row gap-6">
        {/* LEFT: learn — compact video selector + video, always TWO columns total with the setup panel on the right, never a third */}
        <div className="lg:w-[360px] lg:flex-shrink-0 flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {HUB_VIDEO_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setHubVideoTab(tab.key)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  border: hubVideoTab === tab.key ? '1.5px solid #5b3df0' : '1px solid #d9d9e3',
                  background: hubVideoTab === tab.key ? '#5b3df0' : '#fff',
                  color: hubVideoTab === tab.key ? '#fff' : '#6b6b78',
                  fontSize: 10.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div
            className="bg-white border rounded-2xl overflow-hidden"
            style={{ borderColor: '#e8e8ee', minHeight: 320 }}
          >
            {HUB_VIDEO_TABS.map((tab) => {
              if (tab.key !== hubVideoTab) return null;
              const HubVideo = tab.Component;
              return (
                <HubVideo key={tab.key} onSkip={goToNextHubVideoTab} onComplete={goToNextHubVideoTab} />
              );
            })}
          </div>
        </div>

        {/* RIGHT: the existing 中轉站 setup — everything below is unchanged content, just now living inside this right-hand panel instead of being the whole modal */}
        <div className="flex-1 min-w-0">
        <div className="flex flex-col gap-8">
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

          <HubProgressBar label="Configuration" completed={completedCount} total={5} />
          <HubProgressBar label="Installation" completed={installedCount} total={4} />
        </div>

        {/* RIGHT: the five paths */}
        <div className="flex-1 min-w-0">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <HubPathRow
              configTitle="Direct Purchase"
              configDescription="Your main paid conversion path."
              configCompleted={true}
              configLocked
              installTitle="Direct Purchase Pixel Setup"
              installCompleted={directPurchaseInstallCompleted}
              showInstall
              onInstallClick={() => setStep('install_direct_purchase')}
              attributionCompleted={directPurchaseAttributionCompleted}
              onAttributionClick={() => {
                setGlobalAttributionPath('purchase');
                setStep('install_global');
              }}
            />
            <HubPathRow
              configTitle="Lead Magnet"
              configDescription="A free resource in exchange for contact info."
              configCompleted={leadMagnetCompleted}
              onConfigClick={() => setStep('lead_magnet')}
              showInstall={false}
            />
            <HubPathRow
              configTitle="Newsletter"
              configDescription="Track when someone signs up for your list."
              configCompleted={newsletterCompleted}
              onConfigClick={() => setStep('newsletter')}
              installTitle="Newsletter Pixel Setup"
              installCompleted={newsletterInstallCompleted}
              showInstall
              onInstallClick={() => setStep('install_newsletter')}
              attributionCompleted={newsletterAttributionCompleted}
              onAttributionClick={() => {
                setGlobalAttributionPath('newsletter');
                setStep('install_global');
              }}
            />
            <HubPathRow
              configTitle="Sales Call"
              configDescription="Let customers book a call with you."
              configCompleted={salesCallCompleted}
              onConfigClick={() => {
                setVideoScene({ kind: 'idle' });
                setStep('sales_call');
              }}
              installTitle="Sales Call Pixel Setup"
              installCompleted={salesCallInstallCompleted}
              showInstall
              onInstallClick={() => setStep('install_sales_call')}
              attributionCompleted={salesCallAttributionCompleted}
              onAttributionClick={() => {
                setGlobalAttributionPath('salesCall');
                setStep('install_global');
              }}
            />
            <HubPathRow
              configTitle="Paid Consultation"
              configDescription="A paid 1:1 consultation booking path."
              configCompleted={consultationCompleted}
              onConfigClick={() => {
                setVideoScene({ kind: 'idle' });
                setStep('consultation');
              }}
              installTitle="Consultation Pixel Setup"
              installCompleted={consultationInstallCompleted}
              showInstall
              onInstallClick={() => setStep('install_consultation')}
              attributionCompleted={consultationAttributionCompleted}
              onAttributionClick={() => {
                setGlobalAttributionPath('consultation');
                setStep('install_global');
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 12,
              border: '1px solid #d9d9e3',
              background: '#fafafa',
              marginBottom: 10,
            }}
          >
            <span style={{ fontSize: 12.5, color: '#6b6b78' }}>Need help?</span>
            <a
              href={SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12.5,
                fontWeight: 700,
                color: '#5b3df0',
                textDecoration: 'none',
              }}
            >
              Join our WhatsApp group →
            </a>
          </div>

          <button
            type="button"
            onClick={() => setStep('campaign')}
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
            ← Back to Campaign Setup
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
      maxWidth: 1200,
      width: 'min(1200px, 94vw)',
      height: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    {/* LEFT: booking diagram — idle until a delivery option is picked on the right */}
    <div className="hidden lg:flex lg:w-[380px] lg:flex-shrink-0 bg-white rounded-2xl overflow-hidden shadow-2xl items-center justify-center p-6">
      {videoScene.kind === 'booking' && (
        <BookingMethodDiagram
          option={
            SALES_CALL_DELIVERY_OPTIONS.find((o) => o.value === videoScene.value) ??
            SALES_CALL_DELIVERY_OPTIONS[0]
          }
        />
      )}
    </div>

    <div className="relative w-full flex-1 min-w-0 bg-white rounded-2xl overflow-hidden shadow-2xl">
      <SalesCallOnboardingStep
        campaignId={campaignId}
        initialData={campaign ?? undefined}
        onDone={() => setStep('hub')}
        onBack={() => setStep('hub')}
        onSceneChange={setVideoScene}
      />
    </div>
  </div>
)}

          {step === 'consultation' && campaignId && (
  <div
    className="w-full flex flex-col lg:flex-row gap-4 lg:gap-6 items-stretch justify-center"
    style={{
      maxWidth: 1200,
      width: 'min(1200px, 94vw)',
      height: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    {/* LEFT: payment diagram — idle until a payment method is picked on the right */}
    <div className="hidden lg:flex lg:w-[380px] lg:flex-shrink-0 bg-white rounded-2xl overflow-hidden shadow-2xl items-center justify-center p-6">
      {videoScene.kind === 'payment' && <PaymentMethodDiagram method={videoScene.method} />}
    </div>

    <div className="relative w-full flex-1 min-w-0 bg-white rounded-2xl overflow-hidden shadow-2xl">
      <PaidConsultationOnboardingStep
        campaignId={campaignId}
        initialData={campaign ?? undefined}
        onDone={() => setStep('hub')}
        onBack={() => setStep('hub')}
        onSceneChange={setVideoScene}
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

          {step === 'install_global' && campaignId && globalAttributionPath && (
  <div
    className="w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
    style={{
      maxWidth: 1080,
      width: 'min(1080px, 94vw)',
      height: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <GlobalAttributionOnboarding
      campaignId={campaignId}
      path={globalAttributionPath}
      onBack={() => setStep('hub')}
      onDone={() => setStep('hub')}
    />
  </div>
)}

          {step === 'install_direct_purchase' && campaignId && (
  <div
    className="w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
    style={{
      maxWidth: 1080,
      width: 'min(1080px, 94vw)',
      maxHeight: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div style={{ maxHeight: '90vh', overflow: 'auto' }}>
      <DirectPurchaseInstallationOnboarding
        campaignId={campaignId}
        onBack={() => setStep('hub')}
        onDone={() => setStep('hub')}
      />
    </div>
  </div>
)}

          {step === 'install_newsletter' && campaignId && (
  <div
    className="w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
    style={{
      maxWidth: 1080,
      width: 'min(1080px, 94vw)',
      maxHeight: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div style={{ maxHeight: '90vh', overflow: 'auto' }}>
      <NewsletterInstallationOnboarding
        campaignId={campaignId}
        onBack={() => setStep('hub')}
        onDone={() => setStep('hub')}
      />
    </div>
  </div>
)}

          {step === 'install_sales_call' && campaignId && (
  <div
    className="w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
    style={{
      maxWidth: 1080,
      width: 'min(1080px, 94vw)',
      maxHeight: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div style={{ maxHeight: '90vh', overflow: 'auto' }}>
      <SalesCallInstallationOnboarding
        campaignId={campaignId}
        onBack={() => setStep('hub')}
        onDone={() => setStep('hub')}
      />
    </div>
  </div>
)}

          {step === 'install_consultation' && campaignId && (
  <div
    className="w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
    style={{
      maxWidth: 1080,
      width: 'min(1080px, 94vw)',
      maxHeight: '90vh',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div style={{ maxHeight: '90vh', overflow: 'auto' }}>
      <PaidConsultationInstallationOnboarding
        campaignId={campaignId}
        onBack={() => setStep('hub')}
        onDone={() => setStep('hub')}
      />
    </div>
  </div>
)}
        </motion.div>
      )}
    </AnimatePresence>
  );
}