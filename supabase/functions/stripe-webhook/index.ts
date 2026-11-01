// supabase/functions/stripe-webhook/index.ts
// Phase C: on checkout.session.completed, optionally copy plan_name + billing_interval
// from pricing_plans via session.metadata.plan_code. Payment update never fails on plan lookup.

import Stripe from 'https://esm.sh/stripe@14.21.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
})

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

        await supabase
          .from('subscriptions')
          .update({
            status: sub.status,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)

        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription

        await supabase
          .from('subscriptions')
          .update({
            status: 'cancelled',
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
