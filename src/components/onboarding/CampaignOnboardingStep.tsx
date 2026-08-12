// ─────────────────────────────────────────────────────────────────────────
// components/onboarding/CampaignOnboardingStep.tsx
// ─────────────────────────────────────────────────────────────────────────
// Step 3 of the onboarding overlay (after Welcome + Video). Helps a
// non-technical user create their first real Campaign without needing to
// understand Stripe / pixels / redirect tracking up front.
//
// IMPORTANT: this is not a parallel campaign system. It writes to the exact
// same `campaigns` + `campaign_pricing_versions` tables, with the exact
// same field names, as pages/Campaigns.tsx's submitCampaign(). Anything
// created here shows up in Campaigns.tsx and is immediately usable by
// Installation.tsx — verified against both files directly, not assumed.
//
// Scope (per product brief): Campaign Onboarding only. No Stripe setup, no
// pixel installation — those stay in Installation.tsx, untouched. This step
// only has to save enough data for Installation to know which setup path
// to show next, which it already does purely from the campaign row.
// ─────────────────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useOrganization } from '../../lib/useOrganization';
import {
  PAYMENT_OPTIONS,
  CONSULTATION_PAYMENT_OPTIONS,
  SALES_CALL_DELIVERY_OPTIONS,
  CONSULTATION_DELIVERY_OPTIONS,
  getPaymentOption,
  type PaymentOptionContent,
  type DeliveryOptionContent,
} from './campaignOptionContent';

// ── Field shape — copied verbatim from pages/Campaigns.tsx's emptyForm ───
const emptyForm = {
  campaign_name: '',
  landing_page_url: '',
  newsletter_url: '',
  newsletter_thankyou_url: '',
  checkout_url: '',
  purchase_thankyou_url: '',
  offer_price: 0,
  uses_stripe: false,
  has_sales_call: false,
  sales_call_booking_url: '',
  sales_call_thankyou_url: '',
  estimated_close_rate: 0,
  has_paid_consultation: false,
  consultation_booking_url: '',
  paid_consultation_checkout_url: '',
  consultation_thankyou_url: '',
  consultation_fee: 0,
  uses_stripe_consultation: false,
  has_lead_magnet: false,
  purchase_method: 'stripe_checkout' as string,
  sales_call_delivery: 'external_platform' as string,
  average_upsell_value: 0,
  base_offer_value: 0,
  upsell_probability: 0,
  consultation_delivery: 'external_platform' as string,
  consultation_payment_method: 'stripe_checkout' as string,
};

type FormData = typeof emptyForm;
type WizardStep = 'basics' | 'purchase' | 'funnels' | 'review';

const STEP_ORDER: WizardStep[] = ['basics', 'purchase', 'funnels', 'review'];
const STEP_TITLE: Record<WizardStep, string> = {
  basics: "What are you promoting?",
  purchase: 'How do customers pay you?',
  funnels: 'Anything else that leads to a result?',
  review: "Let's create it",
};

interface CampaignOnboardingStepProps {
  /** Called after the campaign row is successfully created. */
  onComplete: (campaignId: string) => void;
}

// ── tiny shared style tokens (matches OnboardingVideo.jsx's shell) ───────
const purple = '#5b3df0';
const ink = '#15151f';
const sub = '#6b6b78';
const border = '#d9d9e3';
const panel = '#fafafa';

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

function FlowDiagram({ steps }: { steps: string[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: ink,
              background: '#fff',
              border: `1px solid ${border}`,
              borderRadius: 6,
              padding: '4px 7px',
              whiteSpace: 'nowrap',
            }}
          >
            {s}
          </span>
          {i < steps.length - 1 && <span style={{ color: '#c4c4d0', fontSize: 12 }}>→</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

function TrackingBadge({ quality }: { quality: 'Full' | 'Partial' }) {
  const isFull = quality === 'Full';
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        padding: '3px 7px',
        borderRadius: 999,
        color: isFull ? '#1a7f4b' : '#a5620a',
        background: isFull ? '#e6f7ee' : '#fdf1e2',
      }}
    >
      {isFull ? 'Full tracking' : 'Partial tracking'}
    </span>
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
        background: selected ? '#f5f2ff' : '#fff',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: ink }}>{option.label}</span>
        <TrackingBadge quality={option.tracking} />
      </div>
      <p style={{ fontSize: 12, color: sub, margin: 0, lineHeight: 1.45 }}>{option.whatTheyExperience}</p>
      <FlowDiagram steps={option.flow} />
    </button>
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
        background: selected ? '#f5f2ff' : '#fff',
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

export default function CampaignOnboardingStep({ onComplete }: CampaignOnboardingStepProps) {
  const { user } = useAuth();
  const { organizationId } = useOrganization();
  const [step, setStep] = useState<WizardStep>('basics');
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [newsletterEnabled, setNewsletterEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEP_ORDER.indexOf(step);

  const update = (patch: Partial<FormData>) => setFormData((f) => ({ ...f, ...patch }));

  const canLeaveBasics = formData.campaign_name.trim().length > 0 && formData.landing_page_url.trim().length > 0;
  const canLeavePurchase = formData.checkout_url.trim().length > 0;

  const goNext = () => {
    setError(null);
    const i = STEP_ORDER.indexOf(step);
    if (step === 'basics' && !canLeaveBasics) {
      setError('Add a campaign name and your landing page URL to continue.');
      return;
    }
    if (step === 'purchase' && !canLeavePurchase) {
      setError('Add your checkout URL to continue — this is where customers actually pay.');
      return;
    }
    if (i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1]);
  };

  const goBack = () => {
    setError(null);
    const i = STEP_ORDER.indexOf(step);
    if (i > 0) setStep(STEP_ORDER[i - 1]);
  };

  // Warnings mirrored from Campaigns.tsx's getWarnings() — same conditions.
  const warnings: string[] = [];
  if (!formData.purchase_thankyou_url) warnings.push('No Purchase Thank You URL — pixel tracking for confirmed purchases won\u2019t work yet.');
  if (formData.has_sales_call && !formData.sales_call_thankyou_url) warnings.push('No Sales Call Thank You URL — sales call tracking won\u2019t work yet.');
  if (formData.has_paid_consultation && !formData.consultation_thankyou_url) warnings.push('No Consultation Thank You URL — consultation tracking won\u2019t work yet.');
  if (newsletterEnabled && !formData.newsletter_thankyou_url) warnings.push('No Newsletter Thank You URL — newsletter tracking won\u2019t work yet.');

  // ── Save: mirrors Campaigns.tsx's submitCampaign() exactly ─────────────
  const createCampaign = async () => {
    if (!user) {
      setError('You need to be signed in to create a campaign.');
      return;
    }
    if (!formData.landing_page_url.trim()) {
      setError('Campaign requires a Landing Page URL.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data, error: insertErr } = await supabase
        .from('campaigns')
        .insert([{ ...formData, user_id: user.id, organization_id: organizationId }])
        .select();
      if (insertErr) throw new Error(`${insertErr.message}${(insertErr as any).details ? ` — ${(insertErr as any).details}` : ''}`);
      if (!data || !data[0]) throw new Error('Campaign was not created — please try again.');

      const campaignId = data[0].id;
      const nowIso = new Date().toISOString();
      const { error: versionErr } = await supabase.from('campaign_pricing_versions').insert([
        {
          campaign_id: campaignId,
          version: 1,
          effective_from: nowIso,
          effective_to: null,
          offer_price: formData.offer_price ?? 0,
          consultation_fee: formData.consultation_fee ?? 0,
          estimated_close_rate: formData.estimated_close_rate ?? 0,
          base_offer_value: formData.base_offer_value ?? 0,
          upsell_probability: formData.upsell_probability ?? 0,
          average_upsell_value: formData.average_upsell_value ?? 0,
        },
      ]);
      if (versionErr) throw new Error(`Campaign created but pricing setup failed: ${versionErr.message}`);

      onComplete(campaignId);
    } catch (err: any) {
      setError(err.message || 'Something went wrong creating your campaign.');
    } finally {
      setSaving(false);
    }
  };

  const selectedPayment = getPaymentOption(formData.purchase_method);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif',
      }}
    >
      {/* Step header */}
      <div style={{ padding: '20px 24px 0' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {STEP_ORDER.map((s, i) => (
            <div
              key={s}
              style={{
                height: 4,
                flex: 1,
                borderRadius: 999,
                background: i <= stepIndex ? purple : '#e8e8ee',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 800, color: ink, margin: '0 0 4px' }}>{STEP_TITLE[step]}</h2>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px 8px' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            {step === 'basics' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 480 }}>
                <p style={{ fontSize: 13, color: sub, margin: 0 }}>
                  Let's set up your first campaign. This is whatever you're promoting — an offer, a call, a
                  newsletter — the thing you want VSTRK to track.
                </p>
                <div>
                  <label style={labelStyle}>Campaign Name</label>
                  <input
                    style={inputStyle}
                    value={formData.campaign_name}
                    onChange={(e) => update({ campaign_name: e.target.value })}
                    placeholder="High Ticket Offer V1"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Landing Page URL</label>
                  <input
                    style={inputStyle}
                    type="url"
                    value={formData.landing_page_url}
                    onChange={(e) => update({ landing_page_url: e.target.value })}
                    placeholder="https://yoursite.com"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Offer Price ($)</label>
                  <input
                    style={inputStyle}
                    type="number"
                    value={formData.offer_price}
                    onChange={(e) => update({ offer_price: parseFloat(e.target.value) || 0 })}
                    placeholder="997"
                  />
                </div>
              </div>
            )}

            {step === 'purchase' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 13, color: sub, margin: 0, maxWidth: 560 }}>
                  Pick the one that looks like your checkout. VSTRK will explain what it can track for each —
                  no jargon needed.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                  {PAYMENT_OPTIONS.map((opt) => (
                    <PaymentOptionCard
                      key={opt.value}
                      option={opt}
                      selected={formData.purchase_method === opt.value}
                      onSelect={() => update({ purchase_method: opt.value, uses_stripe: opt.value === 'stripe_checkout' })}
                    />
                  ))}
                </div>

                <div
                  style={{
                    background: panel,
                    border: `1px solid ${border}`,
                    borderRadius: 10,
                    padding: 14,
                    marginTop: 4,
                  }}
                >
                  <p style={{ fontSize: 12, color: ink, margin: '0 0 10px', lineHeight: 1.5 }}>
                    <strong>Perfect — here's what happens next.</strong> {selectedPayment.trackingNote} In
                    Installation, you'll be guided through: <strong>{selectedPayment.installationBlock}</strong>.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Checkout URL</label>
                      <input
                        style={inputStyle}
                        type="url"
                        value={formData.checkout_url}
                        onChange={(e) => update({ checkout_url: e.target.value })}
                        placeholder="https://buy.stripe.com/..."
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>
                        Purchase Thank You URL
                        {!formData.purchase_thankyou_url && <span style={{ color: '#a5620a' }}> — needed for tracking</span>}
                      </label>
                      <input
                        style={inputStyle}
                        type="url"
                        value={formData.purchase_thankyou_url}
                        onChange={(e) => update({ purchase_thankyou_url: e.target.value })}
                        placeholder="https://yoursite.com/thank-you"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 'funnels' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <p style={{ fontSize: 13, color: sub, margin: 0, maxWidth: 560 }}>
                  Optional — turn on anything else that also leads to a result you want tracked. Skip whatever
                  doesn't apply.
                </p>

                {/* Newsletter */}
                <FunnelToggleSection
                  title="Newsletter"
                  enabled={newsletterEnabled}
                  onToggle={(v) => {
                    setNewsletterEnabled(v);
                    if (!v) update({ newsletter_url: '', newsletter_thankyou_url: '' });
                  }}
                  description="Someone signs up for your list."
                >
                  <FlowDiagram steps={['Landing page', 'Email signup', 'Thank-you page']} />
                  <FieldRow>
                    <div>
                      <label style={labelStyle}>Signup Page URL</label>
                      <input style={inputStyle} type="url" value={formData.newsletter_url} onChange={(e) => update({ newsletter_url: e.target.value })} placeholder="https://yoursite.com/subscribe" />
                    </div>
                    <div>
                      <label style={labelStyle}>Thank You URL</label>
                      <input style={inputStyle} type="url" value={formData.newsletter_thankyou_url} onChange={(e) => update({ newsletter_thankyou_url: e.target.value })} placeholder="https://yoursite.com/thanks" />
                    </div>
                  </FieldRow>
                </FunnelToggleSection>

                {/* Sales call */}
                <FunnelToggleSection
                  title="Sales Call"
                  enabled={formData.has_sales_call}
                  onToggle={(v) => update({ has_sales_call: v })}
                  description="Someone books a call with you."
                >
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {SALES_CALL_DELIVERY_OPTIONS.map((opt) => (
                      <DeliveryOptionCard
                        key={opt.value}
                        option={opt}
                        selected={formData.sales_call_delivery === opt.value}
                        onSelect={() => update({ sales_call_delivery: opt.value })}
                      />
                    ))}
                  </div>
                  <FieldRow>
                    <div>
                      <label style={labelStyle}>Booking URL</label>
                      <input style={inputStyle} type="url" value={formData.sales_call_booking_url} onChange={(e) => update({ sales_call_booking_url: e.target.value })} placeholder="https://calendly.com/..." />
                    </div>
                    <div>
                      <label style={labelStyle}>Booking Success / Thank You URL</label>
                      <input style={inputStyle} type="url" value={formData.sales_call_thankyou_url} onChange={(e) => update({ sales_call_thankyou_url: e.target.value })} placeholder="https://yoursite.com/booked" />
                    </div>
                  </FieldRow>
                  <FieldRow>
                    <div>
                      <label style={labelStyle}>Estimated Close Rate (%)</label>
                      <input style={inputStyle} type="number" value={formData.estimated_close_rate} onChange={(e) => update({ estimated_close_rate: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </FieldRow>
                </FunnelToggleSection>

                {/* Paid consultation */}
                <FunnelToggleSection
                  title="Paid Consultation"
                  enabled={formData.has_paid_consultation}
                  onToggle={(v) => update({ has_paid_consultation: v })}
                  description="Someone books and pays for a consultation."
                >
                  <p style={{ fontSize: 12, fontWeight: 700, color: ink, margin: '4px 0 0' }}>Where does the consultation happen?</p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {CONSULTATION_DELIVERY_OPTIONS.map((opt) => (
                      <DeliveryOptionCard
                        key={opt.value}
                        option={opt}
                        selected={formData.consultation_delivery === opt.value}
                        onSelect={() => update({ consultation_delivery: opt.value })}
                      />
                    ))}
                  </div>
                  <FieldRow>
                    <div>
                      <label style={labelStyle}>Booking Page URL</label>
                      <input style={inputStyle} type="url" value={formData.consultation_booking_url} onChange={(e) => update({ consultation_booking_url: e.target.value })} placeholder="https://tidycal.com/..." />
                    </div>
                  </FieldRow>

                  {formData.consultation_delivery === 'own_website' && (
                    <>
                      <p style={{ fontSize: 12, fontWeight: 700, color: ink, margin: '8px 0 0' }}>How does the customer pay?</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                        {CONSULTATION_PAYMENT_OPTIONS.map((opt) => (
                          <PaymentOptionCard
                            key={opt.value}
                            option={opt}
                            selected={formData.consultation_payment_method === opt.value}
                            onSelect={() =>
                              update({
                                consultation_payment_method: opt.value,
                                uses_stripe_consultation: opt.value === 'stripe_checkout',
                              })
                            }
                          />
                        ))}
                      </div>
                      <FieldRow>
                        <div>
                          <label style={labelStyle}>Checkout / Payment URL</label>
                          <input style={inputStyle} type="url" value={formData.paid_consultation_checkout_url} onChange={(e) => update({ paid_consultation_checkout_url: e.target.value })} placeholder="https://buy.stripe.com/..." />
                        </div>
                      </FieldRow>
                    </>
                  )}

                  <FieldRow>
                    <div>
                      <label style={labelStyle}>Thank You URL</label>
                      <input style={inputStyle} type="url" value={formData.consultation_thankyou_url} onChange={(e) => update({ consultation_thankyou_url: e.target.value })} placeholder="https://yoursite.com/booked" />
                    </div>
                    <div>
                      <label style={labelStyle}>Fee ($)</label>
                      <input style={inputStyle} type="number" value={formData.consultation_fee} onChange={(e) => update({ consultation_fee: parseFloat(e.target.value) || 0 })} />
                    </div>
                  </FieldRow>
                </FunnelToggleSection>

                {/* Lead magnet */}
                <FunnelToggleSection
                  title="Lead Magnet"
                  enabled={formData.has_lead_magnet}
                  onToggle={(v) => update({ has_lead_magnet: v })}
                  description="A free resource in exchange for contact info."
                >
                  <p style={{ fontSize: 12, color: sub, margin: 0 }}>
                    You'll configure the specific magnet (file/link + thank-you page) after your campaign is
                    created.
                  </p>
                </FunnelToggleSection>
              </div>
            )}

            {step === 'review' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
                <div style={{ border: `1px solid ${border}`, borderRadius: 10, padding: 16, background: panel }}>
                  <h3 style={{ fontSize: 13, fontWeight: 800, color: ink, margin: '0 0 10px' }}>{formData.campaign_name || 'Untitled campaign'}</h3>
                  <ReviewRow label="Direct Purchase" value={selectedPayment.label} tracking={selectedPayment.tracking} />
                  {newsletterEnabled && <ReviewRow label="Newsletter" value="Enabled" tracking={formData.newsletter_thankyou_url ? 'Full' : 'Partial'} />}
                  {formData.has_sales_call && (
                    <ReviewRow
                      label="Sales Call"
                      value={SALES_CALL_DELIVERY_OPTIONS.find((o) => o.value === formData.sales_call_delivery)?.label || ''}
                      tracking={SALES_CALL_DELIVERY_OPTIONS.find((o) => o.value === formData.sales_call_delivery)?.tracking || 'Partial'}
                    />
                  )}
                  {formData.has_paid_consultation && (
                    <ReviewRow
                      label="Paid Consultation"
                      value={CONSULTATION_DELIVERY_OPTIONS.find((o) => o.value === formData.consultation_delivery)?.label || ''}
                      tracking={CONSULTATION_DELIVERY_OPTIONS.find((o) => o.value === formData.consultation_delivery)?.tracking || 'Partial'}
                    />
                  )}
                  {formData.has_lead_magnet && <ReviewRow label="Lead Magnet" value="Configure after saving" tracking="Full" />}
                </div>

                {warnings.length > 0 && (
                  <div style={{ background: '#fdf1e2', border: '1px solid #f0d9ae', borderRadius: 10, padding: 12 }}>
                    {warnings.map((w, i) => (
                      <p key={i} style={{ fontSize: 11.5, color: '#8a5407', margin: i === 0 ? 0 : '4px 0 0' }}>
                        {w}
                      </p>
                    ))}
                  </div>
                )}

                <p style={{ fontSize: 12, color: sub, margin: 0 }}>
                  After this, you'll go straight to Installation, where VSTRK walks you through exactly the
                  setup steps your choices above need.
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {error && (
          <p style={{ color: '#b3261e', fontSize: 12.5, marginTop: 14 }}>{error}</p>
        )}
      </div>

      {/* Footer nav */}
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
          onClick={goBack}
          disabled={stepIndex === 0}
          style={{
            padding: '10px 18px',
            borderRadius: 8,
            border: `1px solid ${border}`,
            background: stepIndex === 0 ? '#f3f3f7' : '#fff',
            color: stepIndex === 0 ? '#b0b0bc' : ink,
            fontSize: 13,
            fontWeight: 600,
            cursor: stepIndex === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          ← Back
        </button>

        {step !== 'review' ? (
          <button
            type="button"
            onClick={goNext}
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              background: purple,
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 6px 16px rgba(91,61,240,0.3)',
            }}
          >
            Next →
          </button>
        ) : (
          <button
            type="button"
            onClick={createCampaign}
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
            {saving ? 'Creating…' : 'Create Campaign →'}
          </button>
        )}
      </div>
    </div>
  );
}

// ── small local helpers ────────────────────────────────────────────────

function FieldRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
      {children}
    </div>
  );
}

function FunnelToggleSection({
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ border: `1px solid ${border}`, borderRadius: 10, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: ink, margin: 0 }}>{title}</p>
          <p style={{ fontSize: 11.5, color: sub, margin: '2px 0 0' }}>{description}</p>
        </div>
        <label style={{ position: 'relative', display: 'inline-block', width: 38, height: 22, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            style={{ opacity: 0, width: 0, height: 0 }}
          />
          <span
            style={{
              position: 'absolute',
              inset: 0,
              background: enabled ? purple : '#d9d9e3',
              borderRadius: 999,
              transition: 'background 0.15s',
            }}
          />
          <span
            style={{
              position: 'absolute',
              top: 3,
              left: enabled ? 19 : 3,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.15s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          />
        </label>
      </div>
      {enabled && <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>}
    </div>
  );
}

function ReviewRow({ label, value, tracking }: { label: string; value: string; tracking: 'Full' | 'Partial' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
      <span style={{ fontSize: 12, color: sub }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: ink }}>{value}</span>
        <TrackingBadge quality={tracking} />
      </div>
    </div>
  );
}
