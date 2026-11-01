// supabase/functions/create-checkout/index.ts
// Phase B: accepts plan_id, looks up stripe_price_id server-side.
// Never trusts a Price ID from the browser.

import Stripe from 'https://esm.sh/stripe@14.21.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log('CREATE CHECKOUT STARTED')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!stripeKey || !supabaseUrl || !supabaseKey) {
  throw new Error('Missing environment variables')
}

const stripe = new Stripe(stripeKey, {
  apiVersion: '2024-06-20',
})

Deno.serve(async (req) => {
  console.log('REQUEST:', req.method)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const origin = typeof body.origin === 'string' ? body.origin : null
    const planId = typeof body.plan_id === 'string' ? body.plan_id.trim() : null

    if (!origin) {
      return new Response(JSON.stringify({ error: 'Missing origin' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!planId) {
      return new Response(JSON.stringify({ error: 'Missing plan_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Server-side plan lookup only. Ignore any stripe_price_id from the client.
    const { data: plan, error: planError } = await supabase
      .from('pricing_plans')
      .select('id, code, name, stripe_price_id, is_enabled')
      .eq('id', planId)
      .eq('is_enabled', true)
      .maybeSingle()

    if (planError) {
      console.error('PLAN LOOKUP ERROR:', planError)
      return new Response(JSON.stringify({ error: 'Plan lookup failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!plan || !plan.stripe_price_id || plan.stripe_price_id.startsWith('REPLACE_ME_')) {
      return new Response(JSON.stringify({ error: 'Invalid or unavailable plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // No trial_period_days — Supabase owns the trial clock (Stage A).
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: plan.stripe_price_id,
          quantity: 1,
        },
      ],
      success_url: `${origin}/dashboard?upgraded=true`,
      cancel_url: `${origin}/pricing`,
      metadata: {
        organization_id: membership.organization_id,
        user_id: user.id,
        plan_id: plan.id,
        plan_code: plan.code,
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
    console.error('CHECKOUT ERROR:', err)

    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
