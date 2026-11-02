// supabase/functions/schedule-plan-change/index.ts
//
// Schedules (or replaces) a plan change on the customer's EXISTING Stripe
// Subscription using a Subscription Schedule:
//
//   phase 1: current price, unchanged, until the current period end
//   phase 2: new price, starting exactly at that moment (billing cycle anchor
//            = phase start, so the new interval begins at the switch)
//
// Nothing is charged when this runs: no Checkout Session, no
// subscriptions.update, proration_behavior 'none'. The first charge at the new
// price is the normal renewal invoice at the phase boundary.
//
// The browser sends ONLY { plan_id }. The Price ID is resolved here from
// pricing_plans, and only if available_in_upgrade = true.

import {
  corsHeaders,
  createClients,
  errorResponse,
  HttpError,
  json,
  requireEligibleOwner,
} from '../_shared/planChangeGuard.ts'

function priceIdOf(p: unknown): string | null {
  if (typeof p === 'string') return p
  if (p && typeof p === 'object' && 'id' in p) return String((p as { id: string }).id)
  return null
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
    const { sub } = await requireEligibleOwner(req, supabase)

    const body = await req.json().catch(() => ({}))
    const planId = typeof body.plan_id === 'string' ? body.plan_id.trim() : ''
    if (!planId) throw new HttpError(400, 'Missing plan_id')

    // Server-side plan validation. A plan that is not available_in_upgrade is
    // rejected here even if the client sends its id directly.
    const { data: plan, error: planError } = await supabase
      .from('pricing_plans')
      .select('id, code, name, interval, stripe_price_id, available_in_upgrade')
      .eq('id', planId)
      .eq('available_in_upgrade', true)
      .maybeSingle()

    if (planError) {
      console.error('PLAN LOOKUP ERROR:', planError)
      throw new HttpError(500, 'Plan lookup failed')
    }
    if (!plan || !plan.stripe_price_id || plan.stripe_price_id.startsWith('REPLACE_ME_')) {
      throw new HttpError(400, 'Invalid or unavailable plan')
    }

    // Stripe is the authority on what the customer is on right now.
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)

    if (stripeSub.status !== 'active') {
      throw new HttpError(409, 'Your subscription must be active to change plans')
    }
    if (stripeSub.cancel_at_period_end) {
      throw new HttpError(409, 'Your subscription is set to cancel. Resume it before changing plans')
    }
    if (stripeSub.items.data.length !== 1) {
      throw new HttpError(409, 'This subscription cannot be changed automatically')
    }

    const currentPriceId = stripeSub.items.data[0].price.id
    if (currentPriceId === plan.stripe_price_id) {
      throw new HttpError(400, 'You are already on this plan')
    }

    // Sanity-check the target Price in Stripe (catches a wrong ID pasted in Admin).
    const targetPrice = await stripe.prices.retrieve(plan.stripe_price_id)
    if (!targetPrice.active || !targetPrice.recurring) {
      throw new HttpError(400, 'This plan is not currently available')
    }
    if (targetPrice.recurring.interval !== plan.interval) {
      console.error('PRICE/INTERVAL MISMATCH', plan.code, targetPrice.recurring.interval, plan.interval)
      throw new HttpError(400, 'This plan is misconfigured. Please contact support')
    }
    if (targetPrice.currency !== stripeSub.currency) {
      throw new HttpError(400, 'This plan uses a different currency and cannot be scheduled')
    }

    // One schedule per subscription: reuse ours (or one Stripe already has
    // attached) if it is still live, otherwise create it from the subscription.
    const attachedId =
      sub.stripe_schedule_id ??
      (typeof stripeSub.schedule === 'string' ? stripeSub.schedule : stripeSub.schedule?.id) ??
      null

    let schedule = null
    if (attachedId) {
      const existing = await stripe.subscriptionSchedules.retrieve(attachedId)
      if (existing.status === 'active' || existing.status === 'not_started') {
        schedule = existing
      }
    }
    if (!schedule) {
      schedule = await stripe.subscriptionSchedules.create({
        from_subscription: stripeSub.id,
      })
    }

    // Current phase = the one the subscription is in right now. Its start/end
    // are passed back unchanged so the paid period is preserved exactly.
    const cur = schedule.current_phase
    const currentPhase =
      schedule.phases.find((p) => cur && p.start_date === cur.start_date) ?? schedule.phases[0]
    if (!currentPhase) throw new HttpError(502, 'Could not read the current billing phase')

    const currentPhaseEnd = currentPhase.end_date ?? stripeSub.current_period_end
    const quantity = currentPhase.items[0]?.quantity ?? 1
    const currentPhasePrice = priceIdOf(currentPhase.items[0]?.price) ?? currentPriceId

    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: 'release',
      proration_behavior: 'none',
      phases: [
        {
          items: [{ price: currentPhasePrice, quantity }],
          start_date: currentPhase.start_date,
          end_date: currentPhaseEnd,
          proration_behavior: 'none',
        },
        {
          items: [{ price: plan.stripe_price_id, quantity: 1 }],
          iterations: 1,
          billing_cycle_anchor: 'phase_start',
          proration_behavior: 'none',
        },
      ],
    })

    const effectiveAt = new Date(currentPhaseEnd * 1000).toISOString()

    // Mirror in Supabase. If this write fails the webhook (subscription_schedule.updated)
    // re-derives the same state from Stripe, so Stripe remains the authority.
    const { error: writeError } = await supabase
      .from('subscriptions')
      .update({
        stripe_schedule_id: schedule.id,
        pending_plan_code: plan.code,
        pending_plan_name: plan.name,
        pending_billing_interval: plan.interval,
        pending_effective_at: effectiveAt,
        pending_stripe_price_id: plan.stripe_price_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sub.id)

    if (writeError) {
      console.error('PENDING WRITE ERROR (Stripe schedule exists):', writeError)
      throw new HttpError(500, 'Plan change scheduled, but saving it failed. Please refresh in a minute')
    }

    return json({
      success: true,
      schedule_id: schedule.id,
      pending: {
        plan_code: plan.code,
        plan_name: plan.name,
        billing_interval: plan.interval,
        effective_at: effectiveAt,
      },
    })
  } catch (err) {
    return errorResponse(err)
  }
})
