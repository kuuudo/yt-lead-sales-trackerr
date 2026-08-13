// ─────────────────────────────────────────────────────────────────────────
// components/onboarding/CampaignOnboarding/PaidConsultationOnboardingStep.tsx
// ─────────────────────────────────────────────────────────────────────────
// Optional path: Paid Consultation only.
// Receives an existing campaignId and UPDATES that campaign.
// Does NOT create a new campaign.
// ─────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import {
  CONSULTATION_DELIVERY_OPTIONS,
  CONSULTATION_PAYMENT_OPTIONS,
  type DeliveryOptionContent,
  type PaymentOptionContent,
  type TrackingQuality,
} from '../campaignOptionContent';

const purple = '#5b3df0';
const purpleSoft = '#f5f2ff';
const foxAccent = '#ff7a45';
const ink = '#15151f';
const sub = '#6b6b78';
const border = '#d9d9e3';
const panel = '#fafafa';
const amber = '#a5620a';
const amberSoft = '#fdf1e2';
const amberBorder = '#f0d9ae';
const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: `1px solid ${border}`,
  fontSize: 13,
  color: ink,
  background: '#fff',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.3,
  textTransform: 'uppercase',
  color: sub,
  marginBottom: 6,
  display: 'block',
};

const SUPPORT_WHATSAPP_URL =
  'https://chat.whatsapp.com/G07wVgoAyRS3Z171uRDQ1K?s=cl&p=a&mlu=4';

function SupportLink({
  children = "Stuck? Join our WhatsApp group and we'll help you get set up →",
}: {
  children?: React.ReactNode;
}) {
  return (
    <a
      href={SUPPORT_WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        alignSelf: 'flex-start',
        display: 'inline-block',
        color: purple,
        fontSize: 12,
        fontWeight: 700,
        textDecoration: 'none',
      }}
    >
      💬 {children}
    </a>
  );
}

function FoxAvatar({ size = 40 }: { size?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff',
        border: `1.5px solid ${foxAccent}`,
        fontSize: size * 0.54,
        lineHeight: 1,
      }}
    >
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        style={{ display: 'inline-block' }}
      >
        🦊
      </motion.span>
    </div>
  );
}

function FoxSay({
  children,
  size = 'md',
}: {
  children: React.ReactNode;
  size?: 'md' | 'lg';
}) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        <FoxAvatar size={size === 'lg' ? 44 : 34} />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        style={{
          background: '#fff',
          border: `1px solid ${border}`,
          borderRadius: 12,
          padding: size === 'lg' ? '12px 16px' : '9px 14px',
          boxShadow: '0 2px 10px rgba(21,21,31,0.05)',
          maxWidth: 540,
        }}
      >
        <p
          style={{
            fontFamily: mono,
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: purple,
            margin: '0 0 4px',
          }}
        >
          Vix
        </p>
        {children}
      </motion.div>
    </div>
  );
}

function TrackingBadge({ quality }: { quality: TrackingQuality }) {
  const colors =
    quality === 'Full'
      ? { color: '#1a7f4b', background: '#e6f7ee' }
      : quality === 'Partial'
      ? { color: amber, background: amberSoft }
      : { color: '#8a5407', background: '#f0e6d2' };
  const label =
    quality === 'Full' ? 'Full tracking' : quality === 'Partial' ? 'Partial tracking' : 'Limited tracking';
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        padding: '3px 7px',
        borderRadius: 999,
        ...colors,
      }}
    >
      {label}
    </span>
  );
}

function DeliveryOptionCard({
  option,
  selected,
  onSelect,
}: {
  option: DeliveryOptionContent;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        textAlign: 'left',
        padding: 12,
        borderRadius: 10,
        border: selected ? `2px solid ${purple}` : `1px solid ${border}`,
        background: selected ? purpleSoft : '#fff',
        cursor: 'pointer',
        flex: 1,
        minWidth: 200,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: ink }}>{option.label}</span>
        <TrackingBadge quality={option.tracking} />
      </div>
      <p style={{ fontSize: 11.5, color: sub, margin: '4px 0 0' }}>{option.whatTheyExperience}</p>
    </button>
  );
}

function PaymentOptionCard({
  option,
  selected,
  onSelect,
}: {
  option: PaymentOptionContent;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        textAlign: 'left',
        padding: 14,
        borderRadius: 12,
        border: selected ? `2px solid ${purple}` : `1px solid ${border}`,
        background: selected ? purpleSoft : '#fff',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: ink }}>{option.label}</span>
        <TrackingBadge quality={option.tracking} />
      </div>
      <p style={{ fontSize: 12, color: sub, margin: 0, lineHeight: 1.45 }}>{option.whatTheyExperience}</p>
    </button>
  );
}

interface PaidConsultationOnboardingStepProps {
  campaignId: string;
  initialData?: {
    has_paid_consultation?: boolean | null;
    consultation_delivery?: string | null;
    consultation_booking_url?: string | null;
    paid_consultation_checkout_url?: string | null;
    consultation_thankyou_url?: string | null;
    consultation_fee?: number | null;
    consultation_payment_method?: string | null;
    uses_stripe_consultation?: boolean | null;
  };
  onDone: () => void;
  onBack?: () => void;
}

export default function PaidConsultationOnboardingStep({
  campaignId,
  initialData,
  onDone,
  onBack,
}: PaidConsultationOnboardingStepProps) {
  const { user } = useAuth();
  const [delivery, setDelivery] = useState(
    initialData?.consultation_delivery ?? 'external_platform'
  );
  const [paymentMethod, setPaymentMethod] = useState(
    initialData?.consultation_payment_method ?? 'stripe_checkout'
  );
  const [bookingUrl, setBookingUrl] = useState(initialData?.consultation_booking_url ?? '');
  const [checkoutUrl, setCheckoutUrl] = useState(
    initialData?.paid_consultation_checkout_url ?? ''
  );
  const [thankyouUrl, setThankyouUrl] = useState(initialData?.consultation_thankyou_url ?? '');
  const [fee, setFee] = useState(initialData?.consultation_fee ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwnWebsite = delivery === 'own_website';
  const thankyouRequired =
    isOwnWebsite && paymentMethod === 'embedded_alternative_payment';
  const showThankYouWarning = thankyouRequired && !thankyouUrl.trim();

  const save = async () => {
    if (!user) {
      setError('You need to be signed in to save.');
      return;
    }
    if (!campaignId) {
      setError('Missing campaign. Go back and create your main offer first.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { error: updateErr } = await supabase
        .from('campaigns')
        .update({
          has_paid_consultation: true,
          consultation_delivery: delivery,
          consultation_booking_url: bookingUrl.trim() || null,
          paid_consultation_checkout_url: isOwnWebsite
            ? checkoutUrl.trim() || null
            : null,
          consultation_thankyou_url: thankyouUrl.trim() || null,
          consultation_fee: fee || 0,
          consultation_payment_method: isOwnWebsite ? paymentMethod : 'stripe_checkout',
          uses_stripe_consultation:
            isOwnWebsite &&
            (paymentMethod === 'stripe_checkout' || paymentMethod === 'stripe_embedded'),
        })
        .eq('id', campaignId);

      if (updateErr) throw new Error(updateErr.message);
      onDone();
    } catch (err: any) {
      setError(err.message || 'Something went wrong saving consultation settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
      }}
    >
      <div style={{ padding: '20px 24px 0' }}>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: ink, margin: '0 0 4px' }}>
          Paid Consultation
        </h2>
        <p style={{ fontSize: 12, color: sub, margin: 0 }}>
          Optional — track when someone books and pays for a consultation.
        </p>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px 8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
          <FoxSay size="lg">
            <p style={{ fontSize: 13.5, color: ink, margin: '0 0 8px', lineHeight: 1.55, fontWeight: 700 }}>
              Let’s set up paid consultation tracking.
            </p>
            <p style={{ fontSize: 13, color: sub, margin: '0 0 8px', lineHeight: 1.62 }}>
              Choose where booking happens. If it’s on your own site, you’ll also pick how they pay.
              A thank-you page helps VSTRK confirm the conversion when payment isn’t fully automatic.
            </p>
            <p style={{ fontSize: 12.5, color: sub, margin: 0, lineHeight: 1.6 }}>
              <SupportLink>Stuck? Join our WhatsApp group and we’ll help →</SupportLink>
            </p>
          </FoxSay>

          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: ink, margin: '0 0 10px' }}>
              Where does the consultation happen?
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {CONSULTATION_DELIVERY_OPTIONS.map((opt) => (
                <DeliveryOptionCard
                  key={opt.value}
                  option={opt}
                  selected={delivery === opt.value}
                  onSelect={() => setDelivery(opt.value)}
                />
              ))}
            </div>
          </div>

          <div
            style={{
              background: panel,
              border: `1px solid ${border}`,
              borderRadius: 10,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div>
              <label style={labelStyle}>Booking Page URL</label>
              <input
                style={inputStyle}
                type="url"
                value={bookingUrl}
                onChange={(e) => setBookingUrl(e.target.value)}
                placeholder="https://tidycal.com/..."
              />
            </div>

            {isOwnWebsite && (
              <>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: ink, margin: '4px 0 10px' }}>
                    How does the customer pay?
                  </p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 10,
                    }}
                  >
                    {CONSULTATION_PAYMENT_OPTIONS.map((opt) => (
                      <PaymentOptionCard
                        key={opt.value}
                        option={opt}
                        selected={paymentMethod === opt.value}
                        onSelect={() => setPaymentMethod(opt.value)}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>
                    Checkout / Payment URL
                    <span
                      style={{
                        color: sub,
                        textTransform: 'none',
                        letterSpacing: 0,
                        fontWeight: 600,
                      }}
                    >
                      {' '}
                      (optional if payment is on the booking page)
                    </span>
                  </label>
                  <input
                    style={inputStyle}
                    type="url"
                    value={checkoutUrl}
                    onChange={(e) => setCheckoutUrl(e.target.value)}
                    placeholder="https://buy.stripe.com/..."
                  />
                </div>
              </>
            )}

            <div>
              <label style={labelStyle}>
                Thank You URL
                {showThankYouWarning && (
                  <span
                    style={{
                      color: amber,
                      textTransform: 'none',
                      letterSpacing: 0,
                      fontWeight: 600,
                    }}
                  >
                    {' '}
                    — needed for tracking
                  </span>
                )}
                {!thankyouRequired && (
                  <span
                    style={{
                      color: sub,
                      textTransform: 'none',
                      letterSpacing: 0,
                      fontWeight: 600,
                    }}
                  >
                    {' '}
                    (optional)
                  </span>
                )}
              </label>
              <p style={{ fontSize: 11.5, color: sub, margin: '0 0 6px', lineHeight: 1.5 }}>
                {thankyouRequired
                  ? 'Required for this payment method so VSTRK can confirm the consultation via pixel.'
                  : 'Add if your platform supports a success redirect — improves confirmation tracking.'}
              </p>
              <input
                style={inputStyle}
                type="url"
                value={thankyouUrl}
                onChange={(e) => setThankyouUrl(e.target.value)}
                placeholder="https://yoursite.com/booked"
              />
            </div>

            <div>
              <label style={labelStyle}>Fee ($)</label>
              <input
                style={inputStyle}
                type="number"
                value={fee}
                onChange={(e) => setFee(parseFloat(e.target.value) || 0)}
                placeholder="150"
              />
            </div>
          </div>

          {showThankYouWarning && (
            <div
              style={{
                background: amberSoft,
                border: `1px solid ${amberBorder}`,
                borderRadius: 10,
                padding: 12,
              }}
            >
              <p style={{ fontSize: 11.5, color: '#8a5407', margin: 0 }}>
                No Consultation Thank You URL — consultation tracking won’t work fully for this
                payment method yet.
              </p>
            </div>
          )}

          {error && (
            <p style={{ color: '#b3261e', fontSize: 12.5, margin: 0 }}>{error}</p>
          )}
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 24px',
          borderTop: `1px solid #e8e8ee`,
          background: panel,
        }}
      >
        <button
          type="button"
          onClick={onBack ?? onDone}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: `1px solid ${border}`,
            background: '#fff',
            color: ink,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            background: saving ? '#9c8af0' : purple,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            boxShadow: '0 6px 16px rgba(91,61,240,0.3)',
          }}
        >
          {saving ? 'Saving…' : 'Save Consultation →'}
        </button>
      </div>
    </div>
  );
}