import Stripe from 'https://esm.sh/stripe@14.21.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(
  Deno.env.get('STRIPE_SECRET_KEY')!,
  {
    apiVersion: '2025-06-30.basil',
  }
)

Deno.serve(async (req) => {

  try {

    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      return new Response('No signature', { status: 400 })
    }

    const body = await req.text()

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    )

    console.log("EVENT RECEIVED:", event.type)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // =========================
    // CHECKOUT COMPLETED
    // =========================

    if (event.type === 'checkout.session.completed') {

      const session = event.data.object

      console.log("SESSION:", session)

      const organization_id = session.metadata?.organization_id

      if (organization_id) {

        const { error } = await supabase
          .from('subscriptions')
          .update({
            stripe_customer_id: String(session.customer),
            stripe_subscription_id: String(session.subscription),
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organization_id)

        if (error) {
          console.error("SUPABASE ERROR:", error)
        } else {
          console.log("SUB UPDATED")
        }
      }
    }

    return new Response(
      JSON.stringify({ received: true }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

  } catch (err) {

    console.error("FULL WEBHOOK ERROR:", err)

    return new Response(
      JSON.stringify({
        error: err instanceof Error
          ? err.message
          : String(err),
      }),
      {
        status: 400,
      }
    )
  }
})

  let event: Stripe.Event

  try {

    const body = await req.text()

    console.log("BODY LENGTH:", body.length)

    // ========================
    // VERIFY STRIPE EVENT
    // ========================

    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    )

    console.log("EVENT VERIFIED:", event.type)

  } catch (err) {

    console.error("STRIPE VERIFY FAILED:", err)

    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  }

  // ========================
  // SUPABASE
  // ========================

  const supabase = createClient(
    supabaseUrl,
    supabaseKey
  )

  try {

    switch (event.type) {

      // ========================
      // CHECKOUT COMPLETE
      // ========================

      case 'checkout.session.completed': {

        console.log("PROCESSING CHECKOUT SESSION")

        const session = event.data.object as Stripe.Checkout.Session

        const organization_id = session.metadata?.organization_id

        console.log("ORG ID:", organization_id)

        if (!organization_id) {
          console.log("NO ORGANIZATION ID FOUND")
          break
        }

        const { error } = await supabase
          .from('subscriptions')
          .update({
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            status: 'active',
            updated_at: new Date().toISOString(),
          })
          .eq('organization_id', organization_id)

        if (error) {
          console.error("SUPABASE UPDATE ERROR:", error)
        } else {
          console.log("SUBSCRIPTION UPDATED")
        }

        break
      }

      // ========================
      // SUB UPDATED
      // ========================

      case 'customer.subscription.updated': {

        console.log("PROCESSING SUBSCRIPTION UPDATED")

        const sub = event.data.object as Stripe.Subscription

        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: sub.status,
            current_period_end: new Date(
              sub.current_period_end * 1000
            ).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)

        if (error) {
          console.error("SUPABASE UPDATE ERROR:", error)
        }

        break
      }

      // ========================
      // SUB DELETED
      // ========================

      case 'customer.subscription.deleted': {

        console.log("PROCESSING SUBSCRIPTION DELETED")

        const sub = event.data.object as Stripe.Subscription

        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: 'cancelled',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)

        if (error) {
          console.error("SUPABASE UPDATE ERROR:", error)
        }

        break
      }

      // ========================
      // PAYMENT FAILED
      // ========================

      case 'invoice.payment_failed': {

        console.log("PROCESSING PAYMENT FAILED")

        const invoice = event.data.object as Stripe.Invoice

        const { error } = await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_customer_id', invoice.customer as string)

        if (error) {
          console.error("SUPABASE UPDATE ERROR:", error)
        }

        break
      }

      default:
        console.log("UNHANDLED EVENT:", event.type)
    }

    return new Response(
      JSON.stringify({
        received: true,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )

  } catch (err) {

    console.error("WEBHOOK PROCESS ERROR:", err)

    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  }
})