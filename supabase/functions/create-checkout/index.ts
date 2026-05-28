import Stripe from 'https://esm.sh/stripe@14.21.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log("CREATE CHECKOUT STARTED")

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const priceId = Deno.env.get('STRIPE_PRICE_ID')

if (!stripeKey || !supabaseUrl || !supabaseKey || !priceId) {
  throw new Error("Missing environment variables")
}

const stripe = new Stripe(stripeKey, {
  apiVersion: '2024-06-20',
})

Deno.serve(async (req) => {
  console.log("REQUEST:", req.method)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth header' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders,
      })
    }

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .single()

    if (!membership) {
      return new Response(JSON.stringify({ error: 'No organization found' }), {
        status: 400,
        headers: corsHeaders,
      })
    }

    const { origin } = await req.json()

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 7,
      },
      success_url: `${origin}/dashboard?upgraded=true`,
      cancel_url: `${origin}/pricing`,
      metadata: {
        organization_id: membership.organization_id,
        user_id: user.id,
      },
    })

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    })

  } catch (err) {
    console.error("CHECKOUT ERROR:", err)

    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})