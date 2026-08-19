// ─────────────────────────────────────────────────────────────────────────
// components/onboarding/CampaignOnboarding/SalesCallOnboardingStep.tsx
// ─────────────────────────────────────────────────────────────────────────
// Optional path: Sales Call only.
// Receives an existing campaignId and UPDATES that campaign.
// Does NOT create a new campaign.
// ─────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';
import {
  SALES_CALL_DELIVERY_OPTIONS,
  type DeliveryOptionContent,
  type DeliveryValue,
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

interface SalesCallOnboardingStepProps {
  campaignId: string;
  initialData?: {
    has_sales_call?: boolean | null;
    sales_call_delivery?: string | null;
    sales_call_booking_url?: string | null;
    sales_call_thankyou_url?: string | null;
    estimated_close_rate?: number | null;
  };
  onDone: () => void;
  onBack?: () => void;
  onSceneChange?: (scene: { kind: 'booking'; value: DeliveryValue }) => void;
}

export default function SalesCallOnboardingStep({
  campaignId,
  initialData,
  onDone,
  onBack,
  onSceneChange,
}: SalesCallOnboardingStepProps) {
  const { user } = useAuth();
  const [delivery, setDelivery] = useState(
    initialData?.sales_call_delivery ?? 'external_platform'
  );
  const [bookingUrl, setBookingUrl] = useState(initialData?.sales_call_booking_url ?? '');
  const [thankyouUrl, setThankyouUrl] = useState(initialData?.sales_call_thankyou_url ?? '');
  const [closeRate, setCloseRate] = useState(initialData?.estimated_close_rate ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          has_sales_call: true,
          sales_call_delivery: delivery,
          sales_call_booking_url: bookingUrl.trim() || null,
          sales_call_thankyou_url: thankyouUrl.trim() || null,
          estimated_close_rate: closeRate || 0,
        })
        .eq('id', campaignId);

      if (updateErr) throw new Error(updateErr.message);
      onDone();
    } catch (err: any) {
      setError(err.message || 'Something went wrong saving sales call settings.');
    } finally {
      setSaving(false);
    }
  };

  const showThankYouWarning = !thankyouUrl.trim();

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
          Sales Call
        </h2>
        <p style={{ fontSize: 12, color: sub, margin: 0 }}>
          Optional — track when someone books a call with you.
        </p>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px 8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
          <FoxSay size="lg">
            <p style={{ fontSize: 13.5, color: ink, margin: '0 0 8px', lineHeight: 1.55, fontWeight: 700 }}>
              Let’s set up sales call tracking.
            </p>
            <p style={{ fontSize: 13, color: sub, margin: '0 0 8px', lineHeight: 1.62 }}>
              VSTRK needs a clear confirmation step to know a booking actually happened. A separate
              thank-you / success page is the most reliable way.
            </p>
            <p style={{ fontSize: 12.5, color: sub, margin: 0, lineHeight: 1.6 }}>
              Don’t have a success page yet? A website builder or ChatGPT can help.{' '}
              <SupportLink>Stuck? Join our WhatsApp group and we’ll help →</SupportLink>
            </p>
          </FoxSay>

          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: ink, margin: '0 0 10px' }}>
              Where does booking happen?
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {SALES_CALL_DELIVERY_OPTIONS.map((opt) => (
                <DeliveryOptionCard
                  key={opt.value}
                  option={opt}
                  selected={delivery === opt.value}
                  onSelect={() => {
                    setDelivery(opt.value);
                    onSceneChange?.({ kind: 'booking', value: opt.value });
                  }}
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
              <label style={labelStyle}>Booking URL</label>
              <input
                style={inputStyle}
                type="url"
                value={bookingUrl}
                onChange={(e) => setBookingUrl(e.target.value)}
                placeholder="https://calendly.com/..."
              />
            </div>
            <div>
              <label style={labelStyle}>
                Booking Success / Thank You URL
                {showThankYouWarning && (
                  <span style={{ color: amber, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
                    {' '}
                    — needed for tracking
                  </span>
                )}
              </label>
              <p style={{ fontSize: 11.5, color: sub, margin: '0 0 6px', lineHeight: 1.5 }}>
                Page people land on right after they book. Without it, call tracking is weaker.
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
              <label style={labelStyle}>Estimated Close Rate (%)</label>
              <input
                style={inputStyle}
                type="number"
                value={closeRate}
                onChange={(e) => setCloseRate(parseFloat(e.target.value) || 0)}
                placeholder="20"
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
                No Sales Call Thank You URL — sales call tracking won’t work fully yet.
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
          {saving ? 'Saving…' : 'Save Sales Call →'}
        </button>
      </div>
    </div>
  );
}