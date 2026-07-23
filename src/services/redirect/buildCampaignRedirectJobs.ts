/**
 * src/services/redirect/buildCampaignRedirectJobs.ts
 *
 * Single source of truth for "which redirect links does a Campaign
 * produce" — the field list is business knowledge (Landing Page,
 * Newsletter, Sales Call, Consultation, Thank-You pages), not a generic
 * utility, hence living under services/redirect rather than lib.
 *
 * Extracted unchanged from createVideo.ts's inline construction so both
 * callers (createVideo.ts for the new video's own campaign, and
 * generateAssetRedirectLinks.ts for a Video Asset's own campaign) share
 * the exact same field list and ordering. Do not duplicate this list
 * anywhere else — if a new campaign URL field needs a redirect job, add
 * it here once.
 *
 * Deliberately excludes:
 *   - checkout: owned by campaign via Installation.tsx, not generated here.
 *     Checkout attribution uses the existing tracked checkout URL system —
 *     do not change this.
 *   - thank-you links (purchase_thankyou, newsletter_thankyou,
 *     sales_call_thankyou, consultation_thankyou): these are pixel-tracked
 *     confirmation endpoints, not promotional links. A creator never
 *     shares a "thank you for subscribing" URL — do not add these back.
 *   - lead magnets: a separate, per-selected-lead-magnet job list, kept
 *     out of this function in createVideo.ts today and intentionally not
 *     folded in here — asset redirect generation does not carry lead
 *     magnet selection, so this function's scope stays campaign-URL-only
 *     for both callers.
 */

import type { Campaign } from '../../lib/supabase';
import type { RedirectLinkType } from '../../lib/redirects';

export function buildCampaignRedirectJobs(
  campaign: Campaign
): Array<[RedirectLinkType, string]> {
  const redirectJobs: Array<[RedirectLinkType, string]> = [
    ['landing_page', campaign.landing_page_url],
  ];

  if (campaign.newsletter_url) {
    redirectJobs.push(['newsletter', campaign.newsletter_url]);
  }
  if (campaign.sales_call_booking_url) {
    redirectJobs.push(['sales_call', campaign.sales_call_booking_url]);
  }
  if (campaign.consultation_booking_url) {
    redirectJobs.push(['consultation', campaign.consultation_booking_url]);
  }
  // checkout link intentionally omitted — owned by campaign via Installation.tsx
  //
  // Thank-you links (purchase_thankyou, newsletter_thankyou,
  // sales_call_thankyou, consultation_thankyou) are deliberately NOT
  // generated here. They are tracked confirmation endpoints for pixel
  // events, not promotional links a creator ever shares — pasting a
  // "newsletter-thanks" URL into a YouTube description makes no sense.
  // Do not add them back without re-opening this decision.

  return redirectJobs;
}
