// ─────────────────────────────────────────────────────────────────────────
// pages/public/marketing/sponsor/sponsorDemoConfig.ts
// ─────────────────────────────────────────────────────────────────────────
// The ONLY file you need to edit to fill in the content for the public
// sponsor demo. No logic, no private data — just constants.
// ─────────────────────────────────────────────────────────────────────────

/** Exact WhatsApp URL for the final call-to-action. */
export const SPONSOR_DEMO_WHATSAPP_URL = 'https://wa.me/886903919125';

/**
 * Your founder / "use the app from a brand-new account" YouTube video.
 * Accepts a watch URL, youtu.be URL, shorts URL or embed URL.
 * Leave '' until you have the link — the tab shows a placeholder.
 */
export const FOUNDER_VIDEO_URL = '';

/**
 * Landing Page tab content. Everything is empty on purpose: nothing here
 * is a product claim until YOU write it. Empty fields render as a clearly
 * labelled placeholder, and are skipped from the live page once filled in.
 */
export interface SponsorLandingContent {
  eyebrow: string;
  headline: string;
  subheadline: string;
  /** Short benefit lines. Add as many as you like. */
  points: { title: string; body: string }[];
  ctaLabel: string;
}

export const SPONSOR_LANDING_CONTENT: SponsorLandingContent = {
  eyebrow: '',
  headline: '',
  subheadline: '',
  points: [],
  ctaLabel: '',
};
