// supabase/functions/stripe-webhook/index.ts
// Phase C: on checkout.session.completed, copy plan_name + billing_interval from
// pricing_plans. The ACTUAL purchased Stripe Price ID is the source of truth;
// session.metadata.plan_code is only a fallback.
//
// Scheduled plan changes (Upgrade): the subscription_schedule.* events and the
// customer.subscription.updated/deleted handlers keep the pending_* columns and
// the current plan_name/billing_interval in sync with Stripe. Stripe is the
// authority: schedule events are never trusted from their payload, the latest
// schedule is re-fetched from Stripe so out-of-order delivery cannot corrupt state.
//
// Sync fix (Nov 2026):
//  - Stripe API 2025-03-31.basil and later no longer put current_period_end on the
//    Subscription; it lives on subscription items. Reading the old field produced
//    `RangeError: Invalid time value` -> HTTP 400. Period end is now read from either
//    place and never converted unless it is a valid timestamp.
//  - checkout.session.completed retrieves the Subscription itself, so it does not
//    depend on the order in which Stripe delivers events.
//  - Critical database writes are checked. On failure the function returns 500 so
//    Stripe retries, instead of answering 200 with nothing saved.

import Stripe from 'https://esm.sh/stripe@14.21.0'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
})

const CLEARED_PENDING = {
  pending_plan_code: null,
  pending_plan_name: null,
  pending_billing_interval: null,
  pending_effective_at: null,
  pending_stripe_price_id: null,
}

// --- helpers:start

// Unix seconds -> ISO string, or null if the value is missing or not a valid date.
function unixToIso(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const d = new Date(value * 1000)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// Current period end of a Subscription, tolerant of both API shapes:
//  - pre-basil: top-level `current_period_end`
//  - basil+   : `items.data[*].current_period_end`
// With several items the EARLIEST end is used (the next renewal that will occur).
function subscriptionPeriodEndIso(sub: unknown): string | null {
  const s = sub as
    | {
        current_period_end?: unknown
        items?: { data?: Array<{ current_period_end?: unknown } | null> }
      }
    | null
    | undefined

  const top = unixToIso(s?.current_period_end)
  if (top) return top

  const ends = (s?.items?.data ?? [])
    .map((item) => item?.current_period_end)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (ends.length === 0) return null

  return unixToIso(Math.min(...ends))
}

// Stripe expandable field -> id (string or expanded object).
function idOf(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && 'id' in v) return String((v as { id: string }).id)
  return null
}

// --- helpers:end

// Thrown when a required write/lookup did not succeed. The handler answers 500 so
// Stripe retries the event later (every write below is idempotent).
class WebhookRetryError extends Error {}

// Map a Stripe Price ID back to our plan catalog (pricing_plans is the source of truth).
async function planByPriceId(
  supabase: SupabaseClient<any, any, any>,
  priceId: string | null | undefined
) {
  if (!priceId) return null
  const { data, error } = await supabase
    .from('pricing_plans')
    .select('code, name, interval, stripe_price_id')
    .eq('stripe_price_id', priceId)
    .limit(1)
  if (error) {
    console.error('Plan lookup by price failed:', error)
    return null
  }
  return data?.[0] ?? null
}

function priceIdOf(p: unknown): string | null {
  if (typeof p === 'string') return p
  if (p && typeof p === 'object' && 'id' in p) return String((p as { id: string }).id)
  return null
}

// Re-derive pending state for a schedule from Stripe itself.
async function syncPendingFromSchedule(
  supabase: SupabaseClient<any, any, any>,
  scheduleId: string
) {
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId)
  const subId =
    typeof schedule.subscription === 'string'
      ? schedule.subscription
      : schedule.subscription?.id ?? null

  // Finished / released / canceled: nothing is pending any more. Only clear the
  // row if it still points at THIS schedule, so a late event for an old schedule
  // can never wipe a newer one.
  if (schedule.status !== 'active' && schedule.status !== 'not_started') {
    await supabase
      .from('subscriptions')
      .update({
        stripe_schedule_id: null,
        ...CLEARED_PENDING,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_schedule_id', schedule.id)
    return
  }

  if (!subId) return

const refTime = schedule.current_phase?.start_date ?? Math.floor(Date.now() / 1000)

const next = [...schedule.phases]
  .sort((a, b) => a.start_date - b.start_date)
  .find((p) => p.start_date > refTime)

  if (!next) {
    // Schedule is live but has no future phase (e.g. right after a transition).
    await supabase
      .from('subscriptions')
      .update({
        stripe_schedule_id: schedule.id,
        ...CLEARED_PENDING,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', subId)
    return
  }

  const nextPriceId = priceIdOf(next.items[0]?.price)
  const plan = await planByPriceId(supabase, nextPriceId)
  if (!plan) {
    console.error('Pending phase price not found in pricing_plans:', nextPriceId)
  }

  await supabase
    .from('subscriptions')
    .update({
      stripe_schedule_id: schedule.id,
      pending_plan_code: plan?.code ?? null,
      pending_plan_name: plan?.name ?? null,
      pending_billing_interval: plan?.interval ?? null,
      pending_effective_at: new Date(next.start_date * 1000).toISOString(),
      pending_stripe_price_id: nextPriceId,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subId)
}

Deno.serve(async (req) => {
  try {
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      return new Response('Missing signature', { status: 400 })
    }

    const body = await req.text()

    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    )

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const organization_id = session.metadata?.organization_id

        if (!organization_id) {
          console.warn('checkout.session.completed without organization_id metadata, ignored:', session.id)
          break
        }

        const updatePayload: Record<string, unknown> = {
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          status: 'active',
          updated_at: new Date().toISOString(),
        }

        // 1) Ask Stripe what was actually bought. Doing this here (instead of relying
        //    on customer.subscription.updated) makes this handler self-sufficient, so
        //    event delivery order cannot leave plan / period end empty.
        const subscriptionId = idOf(session.subscription)
        let stripeSub: Stripe.Subscription | null = null
        let retrieveFailed = false

        if (subscriptionId) {
          try {
            stripeSub = await stripe.subscriptions.retrieve(subscriptionId)
          } catch (retrieveErr) {
            retrieveFailed = true
            console.error('Stripe subscription retrieve failed:', subscriptionId, retrieveErr)
          }
        }
// A fresh purchase starts un-cancelled (clears any stale flag from an earlier subscription).
updatePayload.cancel_at_period_end = stripeSub?.cancel_at_period_end === true
        const periodEndIso = subscriptionPeriodEndIso(stripeSub)
        if (periodEndIso) {
          updatePayload.current_period_end = periodEndIso
        } else if (stripeSub) {
          console.warn('No valid period end on retrieved subscription:', subscriptionId)
        }

        // 2) Plan: the real Price ID wins; metadata.plan_code is only a fallback.
        let plan: { code?: string | null; name?: string | null; interval?: string | null } | null =
          await planByPriceId(supabase, idOf(stripeSub?.items?.data?.[0]?.price))

        const planCode =
          typeof session.metadata?.plan_code === 'string'
            ? session.metadata.plan_code.trim()
            : ''

        if (plan && planCode && plan.code && plan.code !== planCode) {
          console.warn(
            'plan_code metadata disagrees with the purchased Price ID; using the Price ID:',
            planCode,
            plan.code
          )
        }

        if (!plan && planCode) {
          const { data: metaPlan, error: metaPlanError } = await supabase
            .from('pricing_plans')
            .select('code, name, interval')
            .eq('code', planCode)
            .maybeSingle()
          if (metaPlanError) {
            console.error('Plan lookup by plan_code failed:', planCode, metaPlanError)
          } else {
            plan = metaPlan
          }
        }

        if (plan?.name) {
          updatePayload.plan_name = plan.name
        }
        if (plan?.interval) {
          updatePayload.billing_interval = plan.interval
        }

        // 3) Write. Payment fields are saved first so the customer has access
        //    immediately, even if something below asks Stripe to retry.
        const { data: written, error: writeError } = await supabase
          .from('subscriptions')
          .update(updatePayload)
          .eq('organization_id', organization_id)
          .select('id')

        if (writeError) {
          console.error('Subscription update failed (checkout.session.completed):', organization_id, writeError)
          throw new WebhookRetryError('Subscription update failed')
        }
        if (!written || written.length === 0) {
          console.error('No subscription row for organization (payment NOT recorded):', organization_id, session.id)
          throw new WebhookRetryError('No subscription row for organization')
        }

        // 4) Payment is recorded. If the plan or period could not be determined, ask
        //    Stripe to retry (all writes are idempotent) and make the failure visible.
        if (retrieveFailed) {
          throw new WebhookRetryError('Stripe subscription retrieve failed; plan and period end pending retry')
        }
        if (!plan?.name) {
          console.error('Purchased plan could not be resolved:', {
            session: session.id,
            subscription: subscriptionId,
            plan_code: planCode,
          })
          throw new WebhookRetryError('Purchased plan could not be resolved')
        }

        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription

       const updatePayload: Record<string, unknown> = {
  status: sub.status,
  // Mirrors Stripe so the UI can show "cancels on <date>" and offer Resume.
  // Requires the cancel_at_period_end column (run the migration first).
  cancel_at_period_end: sub.cancel_at_period_end === true,
  updated_at: new Date().toISOString(),
}
        // Period end: top-level (old API versions) or items (basil+). Never convert
        // a missing/invalid value, and never overwrite the stored one with nothing.
        const periodEndIso = subscriptionPeriodEndIso(sub)
        if (periodEndIso) {
          updatePayload.current_period_end = periodEndIso
        } else {
          console.warn('No valid current_period_end on subscription event:', sub.id)
        }

        // Keep the CURRENT plan label in step with the price Stripe is actually
        // billing (covers the scheduled transition). Best effort: an unknown
        // price never blocks the status/period update above.
        const currentPriceId = sub.items?.data?.[0]?.price?.id
        const currentPlan = await planByPriceId(supabase, currentPriceId)
        if (currentPlan) {
          updatePayload.plan_name = currentPlan.name
          updatePayload.billing_interval = currentPlan.interval
        }

        const { data: row, error: rowError } = await supabase
          .from('subscriptions')
          .select('stripe_schedule_id, pending_stripe_price_id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle()

        if (rowError) {
          console.error('Subscription lookup failed (customer.subscription.updated):', sub.id, rowError)
          throw new WebhookRetryError('Subscription lookup failed')
        }

        // No row carries this subscription id yet: this event overtook
        // checkout.session.completed, which saves the id and now also fills in
        // status, plan and period end from Stripe by itself. Nothing to update.
        if (!row) {
          console.warn(
            'No subscriptions row for',
            sub.id,
            '- event arrived before checkout.session.completed; that handler populates the row'
          )
          break
        }

        // Transition applied: Stripe is now billing the pending price -> nothing pending.
        if (
          row.pending_stripe_price_id &&
          currentPriceId &&
          row.pending_stripe_price_id === currentPriceId
        ) {
          Object.assign(updatePayload, CLEARED_PENDING)
        }

        // Customer is cancelling at period end: a scheduled switch no longer makes
        // sense. Release the schedule (best effort) and clear the pending change.
        if (sub.cancel_at_period_end && row.stripe_schedule_id) {
          try {
            await stripe.subscriptionSchedules.release(row.stripe_schedule_id)
          } catch (releaseErr) {
            console.error('Schedule release on cancel failed:', releaseErr)
          }
          Object.assign(updatePayload, CLEARED_PENDING, { stripe_schedule_id: null })
        }

        const { error: updateError } = await supabase
          .from('subscriptions')
          .update(updatePayload)
          .eq('stripe_subscription_id', sub.id)

        if (updateError) {
          console.error('Subscription update failed (customer.subscription.updated):', sub.id, updateError)
          throw new WebhookRetryError('Subscription update failed')
        }

        break
      }

      case 'subscription_schedule.updated':
      case 'subscription_schedule.completed':
      case 'subscription_schedule.released':
      case 'subscription_schedule.canceled': {
        const schedule = event.data.object as Stripe.SubscriptionSchedule

        await syncPendingFromSchedule(supabase, schedule.id)

        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription

        await supabase
          .from('subscriptions')
          .update({
            status: 'cancelled',
            stripe_schedule_id: null,
            ...CLEARED_PENDING,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)

        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice

        await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', invoice.customer as string)

        break
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)

    // Retryable failures answer 500; everything else (bad signature, malformed
    // payload) keeps the original 400. Stripe retries any non-2xx response.
    const status = err instanceof WebhookRetryError ? 500 : 400

    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status, headers: { 'Content-Type': 'application/json' } }
    )
  }
})