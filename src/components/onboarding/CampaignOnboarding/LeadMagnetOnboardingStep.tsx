// ─────────────────────────────────────────────────────────────────────────
// components/onboarding/CampaignOnboarding/LeadMagnetOnboardingStep.tsx
// ─────────────────────────────────────────────────────────────────────────
// Optional path: Lead Magnet only.
// Receives an existing campaignId and UPDATES that campaign + lead_magnets rows.
// Does NOT create a new campaign.
// ─────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/auth';

const purple = '#5b3df0';
const foxAccent = '#ff7a45';
const ink = '#15151f';
const sub = '#6b6b78';
const border = '#d9d9e3';
const panel = '#fafafa';
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

type MagnetRow = {
  lead_magnet_name: string;
  lead_magnet_url: string;
  lead_magnet_thankyou_url: string;
};

interface LeadMagnetOnboardingStepProps {
  campaignId: string;
  initialMagnets?: MagnetRow[];
  onDone: () => void;
  onBack?: () => void;
}

export default function LeadMagnetOnboardingStep({
  campaignId,
  initialMagnets,
  onDone,
  onBack,
}: LeadMagnetOnboardingStepProps) {
  const { user } = useAuth();
  const [magnets, setMagnets] = useState<MagnetRow[]>(
    initialMagnets && initialMagnets.length > 0
      ? initialMagnets
      : [{ lead_magnet_name: '', lead_magnet_url: '', lead_magnet_thankyou_url: '' }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateMagnet = (index: number, field: keyof MagnetRow, value: string) => {
    setMagnets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addMagnet = () => {
    setMagnets((prev) => [
      ...prev,
      { lead_magnet_name: '', lead_magnet_url: '', lead_magnet_thankyou_url: '' },
    ]);
  };

  const removeMagnet = (index: number) => {
    setMagnets((prev) => {
      if (prev.length <= 1) {
        return [{ lead_magnet_name: '', lead_magnet_url: '', lead_magnet_thankyou_url: '' }];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const save = async () => {
    if (!user) {
      setError('You need to be signed in to save.');
      return;
    }
    if (!campaignId) {
      setError('Missing campaign. Go back and create your main offer first.');
      return;
    }

    const cleaned = magnets
      .map((m) => ({
        lead_magnet_name: m.lead_magnet_name.trim(),
        lead_magnet_url: m.lead_magnet_url.trim(),
        lead_magnet_thankyou_url: m.lead_magnet_thankyou_url.trim(),
      }))
      .filter((m) => m.lead_magnet_name || m.lead_magnet_url || m.lead_magnet_thankyou_url);

    setSaving(true);
    setError(null);
    try {
      const { error: campaignErr } = await supabase
        .from('campaigns')
        .update({ has_lead_magnet: cleaned.length > 0 })
        .eq('id', campaignId);
      if (campaignErr) throw new Error(campaignErr.message);

      // Match saveCampaign: replace lead_magnets rows for this campaign
      const { error: deleteErr } = await supabase
        .from('lead_magnets')
        .delete()
        .eq('campaign_id', campaignId);
      if (deleteErr) throw new Error(deleteErr.message);

      if (cleaned.length > 0) {
        const rows = cleaned.map((m) => ({
          campaign_id: campaignId,
          lead_magnet_name: m.lead_magnet_name || null,
          lead_magnet_url: m.lead_magnet_url || null,
          lead_magnet_thankyou_url: m.lead_magnet_thankyou_url || null,
        }));
        const { error: insertErr } = await supabase.from('lead_magnets').insert(rows);
        if (insertErr) throw new Error(insertErr.message);
      }

      onDone();
    } catch (err: any) {
      setError(err.message || 'Something went wrong saving lead magnet settings.');
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
          Lead Magnet
        </h2>
        <p style={{ fontSize: 12, color: sub, margin: 0 }}>
          Optional — a free resource in exchange for contact info.
        </p>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px 8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
          <FoxSay size="lg">
            <p style={{ fontSize: 13.5, color: ink, margin: '0 0 8px', lineHeight: 1.55, fontWeight: 700 }}>
              Let’s set up your lead magnet.
            </p>
            <p style={{ fontSize: 13, color: sub, margin: '0 0 8px', lineHeight: 1.62 }}>
              Add the page where people get the free resource, and the thank-you page they land on
              after. You can add more than one magnet if you have several offers.
            </p>
            <p style={{ fontSize: 12.5, color: sub, margin: 0, lineHeight: 1.6 }}>
              <SupportLink>Stuck? Join our WhatsApp group and we’ll help →</SupportLink>
            </p>
          </FoxSay>

          {magnets.map((m, index) => (
            <div
              key={index}
              style={{
                background: panel,
                border: `1px solid ${border}`,
                borderRadius: 10,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                position: 'relative',
              }}
            >
              {magnets.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeMagnet(index)}
                  style={{
                    alignSelf: 'flex-end',
                    background: 'none',
                    border: 'none',
                    color: sub,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Remove
                </button>
              )}
              <div>
                <label style={labelStyle}>Lead Magnet Name</label>
                <input
                  style={inputStyle}
                  value={m.lead_magnet_name}
                  onChange={(e) => updateMagnet(index, 'lead_magnet_name', e.target.value)}
                  placeholder="Free checklist PDF"
                />
              </div>
              <div>
                <label style={labelStyle}>Landing / Download Page URL</label>
                <input
                  style={inputStyle}
                  type="url"
                  value={m.lead_magnet_url}
                  onChange={(e) => updateMagnet(index, 'lead_magnet_url', e.target.value)}
                  placeholder="https://yoursite.com/free-guide"
                />
              </div>
              <div>
                <label style={labelStyle}>Thank You URL</label>
                <input
                  style={inputStyle}
                  type="url"
                  value={m.lead_magnet_thankyou_url}
                  onChange={(e) => updateMagnet(index, 'lead_magnet_thankyou_url', e.target.value)}
                  placeholder="https://yoursite.com/thanks"
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addMagnet}
            style={{
              alignSelf: 'flex-start',
              padding: '10px 14px',
              borderRadius: 8,
              border: `1px dashed ${border}`,
              background: '#fff',
              color: purple,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            + Add another lead magnet
          </button>

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
          {saving ? 'Saving…' : 'Save Lead Magnet →'}
        </button>
      </div>
    </div>
  );
}