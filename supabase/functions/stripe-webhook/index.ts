// supabase/functions/stripe-webhook/index.ts
// Phase C: on checkout.session.completed, optionally copy plan_name + billing_interval
// from pricing_plans via session.metadata.plan_code. Payment update never fails on plan lookup.
//
// Scheduled plan changes (Upgrade): the subscription_schedule.* events and the
// customer.subscription.updated/deleted handlers keep the pending_* columns and
// the current plan_name/billing_interval in sync with Stripe. Stripe is the
// authority: schedule events are never trusted from their payload, the latest
// schedule is re-fetched from Stripe so out-of-order delivery cannot corrupt state.

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

  const now = Math.floor(Date.now() / 1000)
  const next = schedule.phases.find((p) => p.start_date > now)

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

        if (!organization_id) break

        const updatePayload: Record<string, unknown> = {
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          status: 'active',
          updated_at: new Date().toISOString(),
        }

        // Best-effort plan label from Checkout metadata (Phase B sets plan_code).
        const planCode =
          typeof session.metadata?.plan_code === 'string'
            ? session.metadata.plan_code.trim()
            : ''

        if (planCode) {
          try {
            const { data: plan } = await supabase
              .from('pricing_plans')
              .select('name, interval')
              .eq('code', planCode)
              .maybeSingle()

            if (plan?.name) {
              updatePayload.plan_name = plan.name
            }
            if (plan?.interval) {
              updatePayload.billing_interval = plan.interval
            }
          } catch (planErr) {
            console.error('Plan metadata lookup failed (payment still applied):', planErr)
          }
        }

        await supabase
          .from('subscriptions')
          .update(updatePayload)
          .eq('organization_id', organization_id)

        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription

        const updatePayload: Record<string, unknown> = {
          status: sub.status,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
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

        const { data: row } = await supabase
          .from('subscriptions')
          .select('stripe_schedule_id, pending_stripe_price_id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle()

        // Transition applied: Stripe is now billing the pending price -> nothing pending.
        if (
          row?.pending_stripe_price_id &&
          currentPriceId &&
          row.pending_stripe_price_id === currentPriceId
        ) {
          Object.assign(updatePayload, CLEARED_PENDING)
        }

        // Customer is cancelling at period end: a scheduled switch no longer makes
        // sense. Release the schedule (best effort) and clear the pending change.
        if (sub.cancel_at_period_end && row?.stripe_schedule_id) {
          try {
            await stripe.subscriptionSchedules.release(row.stripe_schedule_id)
          } catch (releaseErr) {
            console.error('Schedule release on cancel failed:', releaseErr)
          }
          Object.assign(updatePayload, CLEARED_PENDING, { stripe_schedule_id: null })
        }

        await supabase
          .from('subscriptions')
          .update(updatePayload)
          .eq('stripe_subscription_id', sub.id)

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

    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 400 }
    )
  }
})
