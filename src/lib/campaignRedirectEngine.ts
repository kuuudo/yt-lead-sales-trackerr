/**
 * campaignRedirectEngine.ts
 *
 * Single source of truth for campaign-level redirect_links rows.
 *
 * Guarantees:
 *   - One row per (campaign_id, link_type) where video_id IS NULL
 *   - Token is generated once and NEVER changes
 *   - destination_url is updated idempotently whenever the campaign URL changes
 *   - vstrk.com/{token} is permanently stable
 *
 * What this module does NOT do:
 *   - Touch video-level rows (video_id NOT NULL) — those are attribution-only
 *   - Change the schema
 *   - Emit events or touch analytics
 *   - Render anything
 */

import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type CampaignLinkType =
  | 'checkout'
  | 'consultation'
  | 'landing_page'
  | 'newsletter'
  | 'newsletter_thankyou'
  | 'purchase_thankyou'
  | 'sales_call'
  | 'sales_call_thankyou'
  | 'consultation_thankyou'
  | 'lead_magnet';

export interface SyncResult {
  /** The stable vstrk.com token. Never changes after first creation. */
  token: string;
  /** The current destination_url stored in redirect_links. */
  destinationUrl: string;
  /** True if this call created the row for the first time. */
  created: boolean;
  /** True if this call updated destination_url (token unchanged). */
  updated: boolean;
}

// ─────────────────────────────────────────────────────────────
// TOKEN GENERATION
// Internal — callers never generate tokens themselves.
// ─────────────────────────────────────────────────────────────

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const generateToken = (): string =>
  Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

// ─────────────────────────────────────────────────────────────
// CORE ENGINE
// ─────────────────────────────────────────────────────────────

/**
 * Ensures exactly one campaign-level redirect_links row exists for the given
 * (campaignId, linkType) pair, with video_id IS NULL.
 *
 * Behaviour:
 *   - Row does not exist → INSERT with new token and current destinationUrl
 *   - Row exists, URL matches → no-op, return existing token
 *   - Row exists, URL differs → UPDATE destination_url only, token unchanged
 *
 * Idempotent: safe to call on every page load or after every campaign save.
 *
 * @param campaignId      UUID of the campaign
 * @param linkType        Which link type to sync (e.g. 'checkout', 'consultation')
 * @param destinationUrl  Current URL from campaigns table (checkout_url, etc.)
 * @param organizationId  Optional — if caller already has it, skips the campaigns fetch
 * @returns SyncResult with stable token, or throws on unrecoverable error
 */
export async function syncCampaignRedirectLink(
  campaignId: string,
  linkType: CampaignLinkType,
  destinationUrl: string,
  organizationId?: string | null
): Promise<SyncResult> {

  console.log('ENGINE CALLED:', campaignId, linkType, destinationUrl);
  if (!campaignId) throw new Error('[campaignRedirectEngine] campaignId is required');
  if (!destinationUrl) throw new Error('[campaignRedirectEngine] destinationUrl is required');
  if (!linkType) throw new Error('[campaignRedirectEngine] linkType is required');

  // ── Step 0: resolve organization_id if not supplied by caller ─────────────
  // campaigns.organization_id is the authoritative source. Fetch once here so
  // every redirect_links row is written with org attribution at creation time.
  // This is a read on a row that already exists — no extra round-trip cost
  // beyond what the caller has already paid to load the campaign.
  let resolvedOrgId = organizationId ?? null;
  if (!resolvedOrgId) {
    const { data: campaignRow } = await supabase
      .from('campaigns')
      .select('organization_id')
      .eq('id', campaignId)
      .single();
    resolvedOrgId = campaignRow?.organization_id ?? null;
    console.log('[campaignRedirectEngine] resolved organization_id:', resolvedOrgId);
  }

  // ── Step 1: look up existing campaign-level row ────────────────────────────
  // video_id IS NULL is the hard boundary between campaign-level and video-level rows.
  // We never touch rows with video_id NOT NULL — those are attribution-only.
  const { data: existing, error: selectError } = await supabase
    .from('redirect_links')
    .select('token, destination_url')
    .eq('campaign_id', campaignId)
    .eq('link_type', linkType)
    .is('video_id', null)           // campaign-level rows only
    .maybeSingle();                 // returns null (not error) when 0 rows found
                                    // unique index guarantees at most one row exists

  if (selectError) {
    throw new Error(`[campaignRedirectEngine] SELECT failed: ${selectError.message}`);
  }

  // ── Step 2: INSERT if no row exists ───────────────────────────────────────
  if (!existing) {
    const token = generateToken();

    const { error: insertError } = await supabase
      .from('redirect_links')
      .insert({
        token,
        campaign_id: campaignId,
        link_type: linkType,
        destination_url: destinationUrl,
        video_id: null,             // explicitly campaign-level
        organization_id: resolvedOrgId,
      });

    if (insertError) {
      // 23505 = unique_violation — a concurrent call created the row first.
      // Recover by fetching the winning row instead of crashing.
      if (insertError.code === '23505') {
        const { data: winner, error: retryError } = await supabase
          .from('redirect_links')
          .select('token, destination_url')
          .eq('campaign_id', campaignId)
          .eq('link_type', linkType)
          .is('video_id', null)
          .maybeSingle();
        if (retryError || !winner) {
          throw new Error(`[campaignRedirectEngine] INSERT conflict unresolvable: ${retryError?.message}`);
        }
        return { token: winner.token, destinationUrl: winner.destination_url, created: false, updated: false };
      }
      throw new Error(`[campaignRedirectEngine] INSERT failed: ${insertError.message}`);
    }

    return { token, destinationUrl, created: true, updated: false };
  }

  // ── Step 3: UPDATE destination_url if it changed (token preserved) ────────
  if (existing.destination_url !== destinationUrl) {
    const { error: updateError } = await supabase
      .from('redirect_links')
      .update({ destination_url: destinationUrl })
      .eq('campaign_id', campaignId)
      .eq('link_type', linkType)
      .is('video_id', null);        // never touch video-level rows

    if (updateError) {
      throw new Error(`[campaignRedirectEngine] UPDATE failed: ${updateError.message}`);
    }

    return { token: existing.token, destinationUrl, created: false, updated: true };
  }

  // ── Step 4: no-op — row exists and URL matches ────────────────────────────
  return {
    token: existing.token,
    destinationUrl: existing.destination_url,
    created: false,
    updated: false,
  };
}

/**
 * Convenience wrapper: syncs multiple link types for one campaign in parallel.
 * Skips any entry where destinationUrl is null, undefined, or empty string.
 *
 * Usage in CampaignDetail.tsx after handleSave:
 *
 *   await syncCampaignRedirectLinks(campaignId, [
 *     { linkType: 'checkout',      destinationUrl: formData.checkout_url },
 *     { linkType: 'consultation',  destinationUrl: formData.paid_consultation_checkout_url },
 *     { linkType: 'landing_page',  destinationUrl: formData.landing_page_url },
 *     { linkType: 'newsletter',    destinationUrl: formData.newsletter_url },
 *   ]);
 */
export async function syncCampaignRedirectLinks(
  campaignId: string,
  links: Array<{ linkType: CampaignLinkType; destinationUrl: string | null | undefined }>
): Promise<Map<CampaignLinkType, SyncResult>> {
  const results = new Map<CampaignLinkType, SyncResult>();

  await Promise.all(
    links
      .filter(({ destinationUrl }) => !!destinationUrl)
      .map(async ({ linkType, destinationUrl }) => {
        const result = await syncCampaignRedirectLink(
          campaignId,
          linkType,
          destinationUrl as string
        );
        results.set(linkType, result);
      })
  );

  return results;
}
