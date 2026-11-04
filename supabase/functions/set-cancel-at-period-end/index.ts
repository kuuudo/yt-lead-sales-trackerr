// supabase/functions/set-cancel-at-period-end/index.ts
//
// Cancel Subscription (cancel_at_period_end = true) and Resume (= false).
//
// Cancel NEVER ends the subscription immediately: the customer keeps access and the
// current paid period; Stripe simply stops renewing it. This is NOT
// cancel-pending-plan-change (which only releases a schedule and keeps billing).
//
// Browser sends { subscription_id, cancel_at_period_end }. Nothing else is trusted.
//
// Cancel sequence:
//   1. Release a live Subscription Schedule (a scheduled switch to a pricier plan must
//      not fire at the period boundary). release() leaves the subscription running.
//   2. subscriptions.update({ cancel_at_period_end: true })
//   3. Mirror the result into Supabase.
// If step 2 fails after step 1, the customer stays on the SAME plan (no switch), still
// billed as normal until they retry; the error message says so. Every step is idempotent.
//
// Resume only flips the flag back. The released schedule is NOT recreated: the customer
// can schedule a new plan change afterwards.

import {
  CLEARED_PENDING,
  corsHeaders,
  createClients,
  errorResponse,
  HttpError,
  json,
} from '../_shared/planChangeGuard.ts'
import { requireCancelableOwner, CANCELABLE_STATUSES } from '../_shared/cancelGuard.ts'

function idOf(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && 'id' in v) return String((v as { id: string }).id)
  return null
}

function unixToIso(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const d = new Date(value * 1000)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// Top-level (older API versions) or item-level (basil+); earliest item end wins.
function periodEndIso(sub: unknown): string | null {
  const s = sub as
    | { current_period_end?: unknown; items?: { data?: Array<{ current_period_end?: unknown } | null> } }
    | null
    | undefined
  const top = unixToIso(s?.current_period_end)
  if (top) return top
  const ends = (s?.items?.data ?? [])
    .map((i) => i?.current_period_end)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  return ends.length ? unixToIso(Math.min(...ends)) : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const { stripe, supabase } = createClients()

    const body = await req.json().catch(() => ({}))
    const subscriptionId =
      typeof body.subscription_id === 'string' ? body.subscription_id.trim() : ''
    if (typeof body.cancel_at_period_end !== 'boolean') {
      throw new HttpError(400, 'cancel_at_period_end must be true or false')
    }
    const desired: boolean = body.cancel_at_period_end

    const { sub } = await requireCancelableOwner(req, supabase, subscriptionId)

    // Stripe is the authority on the current state.
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)

    // The Stripe subscription must belong to the customer we have on record.
    const stripeCustomerId = idOf(stripeSub.customer)
    if (sub.stripe_customer_id && stripeCustomerId && sub.stripe_customer_id !== stripeCustomerId) {
      console.error('CUSTOMER MISMATCH', sub.id, sub.stripe_customer_id, stripeCustomerId)
      throw new HttpError(409, 'This subscription cannot be changed automatically. Please contact support')
    }
    if (!CANCELABLE_STATUSES.includes(stripeSub.status)) {
      throw new HttpError(409, 'This subscription is no longer active')
    }

    let releasedSchedule = false

    // Step 1 (cancel only): remove a live schedule so a pending plan change cannot fire.
    if (desired) {
      const attachedId = sub.stripe_schedule_id ?? idOf(stripeSub.schedule)
      if (attachedId) {
        let live = false
        try {
          const schedule = await stripe.subscriptionSchedules.retrieve(attachedId)
          live = schedule.status === 'active' || schedule.status === 'not_started'
        } catch (err) {
          if ((err as { code?: string })?.code !== 'resource_missing') {
            console.error('SCHEDULE READ ERROR:', err)
            throw new HttpError(502, 'Could not read your scheduled plan change. Nothing was cancelled. Please try again')
          }
        }
        if (live) {
          try {
            await stripe.subscriptionSchedules.release(attachedId)
            releasedSchedule = true
          } catch (err) {
            // A concurrent request (or Stripe) may have released it just now: re-check first.
            let stillLive = true
            try {
              const again = await stripe.subscriptionSchedules.retrieve(attachedId)
              stillLive = again.status === 'active' || again.status === 'not_started'
            } catch (_) {
              // could not re-check: treat as still live
            }
            if (stillLive) {
              console.error('SCHEDULE RELEASE ERROR:', err)
              throw new HttpError(502, 'Could not remove your scheduled plan change. Nothing was cancelled. Please try again')
            }
          }
        }
      }
    }

    // Step 2: flip the flag (skipped if Stripe already has the requested value).
    let current = stripeSub
    if (stripeSub.cancel_at_period_end !== desired) {
      try {
        current = await stripe.subscriptions.update(sub.stripe_subscription_id, {
          cancel_at_period_end: desired,
        })
      } catch (err) {
        console.error('SUBSCRIPTION UPDATE ERROR:', err)
        if (releasedSchedule) {
          // Best effort: reflect the released schedule in Supabase (the webhook also does).
          await supabase
            .from('subscriptions')
            .update({ ...CLEARED_PENDING, updated_at: new Date().toISOString() })
            .eq('id', sub.id)
          throw new HttpError(
            502,
            'Your scheduled plan change was removed, but the cancellation could not be completed. Your subscription continues on its current plan. Please try again'
          )
        }
        throw new HttpError(502, 'Could not update your subscription. Please try again')
      }
    }

    // Step 3: mirror into Supabase.
    const endsAt = periodEndIso(current)
    const mirror: Record<string, unknown> = {
      cancel_at_period_end: current.cancel_at_period_end === true,
      updated_at: new Date().toISOString(),
    }
    if (endsAt) mirror.current_period_end = endsAt
    if (desired) Object.assign(mirror, CLEARED_PENDING)

    const { error: writeError } = await supabase.from('subscriptions').update(mirror).eq('id', sub.id)
    if (writeError) {
      console.error('MIRROR WRITE ERROR (Stripe already updated):', writeError)
      throw new HttpError(500, 'Your change was saved with Stripe but could not be shown yet. Please refresh in a minute')
    }

    return json({
      success: true,
      cancel_at_period_end: current.cancel_at_period_end === true,
      ends_at: endsAt,
    })
  } catch (err) {
    return errorResponse(err)
  }
})