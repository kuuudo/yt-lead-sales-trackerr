// ─────────────────────────────────────────────────────────────────────────
// pages/public/marketing/businessHireAgency/businessHireAgencyDemoConfig.ts
// ─────────────────────────────────────────────────────────────────────────
// Constants for the public "business hire agency" pages:
//   • landing page   vstrk.com/5q
//   • demo           vstrk.com/insights/5x
// No logic, no private data — just constants.
// ─────────────────────────────────────────────────────────────────────────

/** Exact WhatsApp URL for the final call-to-action. */
export const BUSINESS_HIRE_AGENCY_DEMO_WHATSAPP_URL = 'https://wa.me/886903919125';

/**
 * Founder / "use the app from a brand-new account" YouTube video.
 * Accepts a watch URL, youtu.be URL, shorts URL or embed URL.
 * Leave '' until you have the link — the tab shows a placeholder.
 */
export const FOUNDER_VIDEO_URL = '';

/** Optional overrides for the landing page. Empty = use the built-in label. */
export interface BusinessHireAgencyLandingContent {
  ctaLabel: string;
}

export const BUSINESS_HIRE_AGENCY_LANDING_CONTENT: BusinessHireAgencyLandingContent = {
  ctaLabel: '',
};
