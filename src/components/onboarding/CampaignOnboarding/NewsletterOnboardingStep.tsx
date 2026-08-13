// ─────────────────────────────────────────────────────────────────────────
// components/onboarding/CampaignOnboarding/NewsletterOnboardingStep.tsx
// ─────────────────────────────────────────────────────────────────────────
// Optional path: Newsletter only.
// Receives an existing campaignId and UPDATES that campaign.
// Does NOT create a new campaign.
// ─────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';

const purple = '#5b3df0';
const purpleSoft = '#f5f2ff';
const purpleBorder = '#d9d0ff';
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

interface NewsletterOnboardingStepProps {
  campaignId: string;
  initialData?: {
    newsletter_url?: string | null;
    newsletter_thankyou_url?: string | null;
  };
  onDone: () => void;
  onBack?: () => void;
}

export default function NewsletterOnboardingStep({
  campaignId,
  initialData,
  onDone,
  onBack,
}: NewsletterOnboardingStepProps) {
  const { user } = useAuth();
  const [newsletterUrl, setNewsletterUrl] = useState(initialData?.newsletter_url ?? '');
  const [thankyouUrl, setThankyouUrl] = useState(initialData?.newsletter_thankyou_url ?? '');
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
          newsletter_url: newsletterUrl.trim() || null,
          newsletter_thankyou_url: thankyouUrl.trim() || null,
        })
        .eq('id', campaignId);

      if (updateErr) throw new Error(updateErr.message);
      onDone();
    } catch (err: any) {
      setError(err.message || 'Something went wrong saving newsletter settings.');
    } finally {
      setSaving(false);
    }
  };

  const showThankYouWarning = !!newsletterUrl.trim() && !thankyouUrl.trim();

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
          Newsletter
        </h2>
        <p style={{ fontSize: 12, color: sub, margin: 0 }}>
          Optional — track when someone signs up for your list.
        </p>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px 8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
          <FoxSay size="lg">
            <p style={{ fontSize: 13.5, color: ink, margin: '0 0 8px', lineHeight: 1.55, fontWeight: 700 }}>
              Let’s set up newsletter tracking.
            </p>
            <p style={{ fontSize: 13, color: sub, margin: '0 0 8px', lineHeight: 1.62 }}>
              VSTRK needs two pages: where people sign up, and the thank-you page they land on after.
              A small pixel on the thank-you page is how we know a signup actually happened.
            </p>
            <p style={{ fontSize: 12.5, color: sub, margin: 0, lineHeight: 1.6 }}>
              Don’t have a thank-you page yet? A website builder or ChatGPT can help you make a simple
              one.{' '}
              <SupportLink>Stuck? Join our WhatsApp group and we’ll help →</SupportLink>
            </p>
          </FoxSay>

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
              <label style={labelStyle}>Signup Page URL</label>
              <input
                style={inputStyle}
                type="url"
                value={newsletterUrl}
                onChange={(e) => setNewsletterUrl(e.target.value)}
                placeholder="https://yoursite.com/subscribe"
              />
            </div>
            <div>
              <label style={labelStyle}>
                Thank You URL
                {showThankYouWarning && (
                  <span style={{ color: amber, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
                    {' '}
                    — needed for tracking
                  </span>
                )}
              </label>
              <p style={{ fontSize: 11.5, color: sub, margin: '0 0 6px', lineHeight: 1.5 }}>
                This is the page people see right after they subscribe. Without it, newsletter tracking
                won’t work reliably.
              </p>
              <input
                style={inputStyle}
                type="url"
                value={thankyouUrl}
                onChange={(e) => setThankyouUrl(e.target.value)}
                placeholder="https://yoursite.com/thanks"
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
                No Newsletter Thank You URL — pixel tracking for newsletter signups won’t work yet.
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
          {saving ? 'Saving…' : 'Save Newsletter →'}
        </button>
      </div>
    </div>
  );
}