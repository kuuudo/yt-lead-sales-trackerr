// ─────────────────────────────────────────────────────────────────────────
// pages/public/marketing/interviewmarketers/interviewDemoConfig.ts
// ─────────────────────────────────────────────────────────────────────────
// Constants for the public "companies hiring marketing talent" pages:
//   • landing page   vstrk.com/2x
//   • demo           vstrk.com/insights/2u
// No logic, no private data — just constants.
// ─────────────────────────────────────────────────────────────────────────

/** Exact WhatsApp URL for the final call-to-action. */
export const INTERVIEW_DEMO_WHATSAPP_URL = 'https://wa.me/886903919125';

/**
 * Founder / "use the app from a brand-new account" YouTube video.
 * Accepts a watch URL, youtu.be URL, shorts URL or embed URL.
 * Leave '' until you have the link — the tab shows a placeholder.
 */
export const FOUNDER_VIDEO_URL = '';

/** Optional overrides for the landing page. Empty = use the built-in copy. */
export interface InterviewLandingContent {
  ctaLabel: string;
}

export const INTERVIEW_LANDING_CONTENT: InterviewLandingContent = {
  ctaLabel: '',
};

// ───────────────────────── LOCKED COPY — DO NOT REWRITE ─────────────────────────
// These strings are rendered verbatim by InterviewLandingPage.tsx.

export const LOCKED_HOOK = {
  eyebrow: 'To Companies Hiring Marketing Talent',
  headline: '100 Applicants. A Changing Marketing Landscape. How Do You Know Who Can Actually Deliver?',
  paragraphs: [
    "You're facing a flood of applicants, polished résumés, and marketing degrees — but marketing keeps changing. Strategies that worked a year ago may no longer work today. AI is transforming how content gets created, platforms keep evolving, and audience behavior is constantly shifting.",
    'How can you tell who truly understands modern marketing, who can adapt, and who can turn creative ideas into real business results — before you hire them?',
    'Without a reliable way to evaluate candidates in the real world, you risk hiring someone who looks great on paper but struggles to deliver, while overlooking the talent that could make a real difference to your business.',
  ],
};

export const LOCKED_FORMULA = [
  'We help companies hiring marketing talent evaluate and compare candidates in a rapidly changing marketing landscape by giving them a real product or offer to promote and connecting their promotional activities, content performance, conversion events, and attributable revenue across nine social and content platforms — including YouTube, TikTok, Instagram, X, and LinkedIn — over time.',
  'This helps companies discover promising talent, see how candidates approach real marketing challenges, identify effective strategies, and make more informed hiring decisions based on demonstrated performance rather than résumés and interviews alone.',
];

/** Phrases highlighted inside the formula. Highlighting never alters the text. */
export const LOCKED_FORMULA_HIGHLIGHTS: string[][] = [
  ['evaluate and compare candidates', 'a real product or offer to promote', 'nine social and content platforms'],
  ['discover promising talent', 'demonstrated performance'],
];
