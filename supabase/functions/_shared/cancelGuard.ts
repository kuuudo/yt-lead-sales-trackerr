// supabase/functions/_shared/cancelGuard.ts
// Authorization for Cancel / Resume Subscription.
//
// Deliberately SEPARATE from planChangeGuard.requireEligibleOwner:
//  - does NOT require billing_settings.upgrade_enabled (a customer must always be
//    able to stop being billed, even when plan changes are switched off)
//  - accepts 'active' AND 'past_due' (an owner with a failed payment may cancel)
//  - never guesses which subscription to act on: the caller must name the exact
//    subscriptions.id, and it must belong to an organization the caller OWNS.
//    (planChangeGuard takes the first row of an unordered query, which is unsafe
//    for users who own more than one organization.)
//
// verify_jwt is false at the gateway, so authentication is done HERE.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { HttpError, type PaidSubscriptionRow } from './planChangeGuard.ts'

export const CANCELABLE_STATUSES = ['active', 'past_due']

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function requireCancelableOwner(
  req: Request,
  supabase: SupabaseClient<any, any, any>,
  subscriptionId: string
): Promise<{ userId: string; sub: PaidSubscriptionRow }> {
  // 1. Authenticate
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new HttpError(401, 'Missing auth header')

  const token = authHeader.replace('Bearer ', '')
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token)
  if (authError || !user) throw new HttpError(401, 'Unauthorized')

  // 2. The target must be named explicitly
  if (!subscriptionId || !UUID_RE.test(subscriptionId)) {
    throw new HttpError(400, 'Missing or invalid subscription_id')
  }

  // 3. Organizations this user OWNS
  const { data: memberships, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('role', 'owner')
  if (membershipError) {
    console.error('MEMBERSHIP ERROR:', membershipError)
    throw new HttpError(500, 'Could not verify organization')
  }
  const ownedOrgIds = new Set((memberships ?? []).map((m) => m.organization_id))
  if (ownedOrgIds.size === 0) {
    throw new HttpError(403, 'Only the account owner can manage the subscription')
  }

  // 4. The exact row, and it must belong to one of those organizations
  const { data: sub, error: subError } = await supabase
    .from('subscriptions')
    .select(
      'id, organization_id, status, stripe_customer_id, stripe_subscription_id, stripe_schedule_id'
    )
    .eq('id', subscriptionId)
    .maybeSingle()
  if (subError) {
    console.error('SUBSCRIPTION ERROR:', subError)
    throw new HttpError(500, 'Could not verify subscription')
  }
  if (!sub) throw new HttpError(404, 'Subscription not found')
  if (!ownedOrgIds.has(sub.organization_id)) {
    throw new HttpError(403, 'Only the account owner can manage the subscription')
  }

  // 5. It must be a real paid subscription in a cancelable state
  if (!sub.stripe_subscription_id) {
    throw new HttpError(409, 'No paid subscription found')
  }
  if (!CANCELABLE_STATUSES.includes(sub.status)) {
    throw new HttpError(409, 'This subscription is no longer active')
  }

  return { userId: user.id, sub: sub as PaidSubscriptionRow }
}