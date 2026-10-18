// ─────────────────────────────────────────────────────────────────────────
// pages/public/marketing/agency/agencyDemoConfig.ts
// ─────────────────────────────────────────────────────────────────────────
// Constants for the public "agency and multi-client operator" pages:
//   • landing page   vstrk.com/4n
//   • demo           vstrk.com/insights/4c
// No logic, no private data — just constants.
// ─────────────────────────────────────────────────────────────────────────

/** Exact WhatsApp URL for the final call-to-action. */
export const AGENCY_DEMO_WHATSAPP_URL = 'https://wa.me/886903919125';

/**
 * Founder / "use the app from a brand-new account" YouTube video.
 * Accepts a watch URL, youtu.be URL, shorts URL or embed URL.
 * Leave '' until you have the link — the tab shows a placeholder.
 */
export const FOUNDER_VIDEO_URL = '';

/** Optional overrides for the landing page. Empty = use the built-in label. */
export interface AgencyLandingContent {
  ctaLabel: string;
}

export const AGENCY_LANDING_CONTENT: AgencyLandingContent = {
  ctaLabel: '',
};
