// supabase/functions/_shared/planChangeGuard.ts
// Shared by schedule-plan-change and cancel-pending-plan-change.
// Every plan-change request is validated HERE, on the server, regardless of
// what the frontend shows:
//   1. valid Supabase session
//   2. global Upgrade switch is ON (billing_settings.upgrade_enabled)
//   3. caller is an OWNER of an org with a trusted paid subscription
//      (status 'active' + stripe_subscription_id), same rule as useAccessStatus
// Team-only, trial-only and never-paid users are rejected. Operator "viewing"
// never matters: the caller is always the real authenticated user.

import Stripe from 'https://esm.sh/stripe@14.21.0'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: err.message }, err.status)
  }
  console.error('PLAN CHANGE ERROR:', err)
  return json({ error: err instanceof Error ? err.message : String(err) }, 500)
}

export function createClients() {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!stripeKey || !supabaseUrl || !supabaseKey) {
    throw new Error('Missing environment variables')
  }

  return {
    stripe: new Stripe(stripeKey, { apiVersion: '2024-06-20' }),
    supabase: createClient(supabaseUrl, supabaseKey),
  }
}

export type PaidSubscriptionRow = {
  id: string
  organization_id: string
  status: string
  stripe_customer_id: string | null
  stripe_subscription_id: string
  stripe_schedule_id: string | null
}

export const CLEARED_PENDING = {
  stripe_schedule_id: null,
  pending_plan_code: null,
  pending_plan_name: null,
  pending_billing_interval: null,
  pending_effective_at: null,
  pending_stripe_price_id: null,
}

export async function requireEligibleOwner(
  req: Request,
  supabase: SupabaseClient<any, any, any>
): Promise<{ userId: string; sub: PaidSubscriptionRow }> {
  // 1. Auth
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) throw new HttpError(401, 'Missing auth header')

  const token = authHeader.replace('Bearer ', '')
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token)
  if (authError || !user) throw new HttpError(401, 'Unauthorized')

  // 2. Global Upgrade switch
  const { data: settings, error: settingsError } = await supabase
    .from('billing_settings')
    .select('upgrade_enabled')
    .eq('id', true)
    .maybeSingle()
  if (settingsError) {
    console.error('BILLING SETTINGS ERROR:', settingsError)
    throw new HttpError(500, 'Could not read billing settings')
  }
  if (settings?.upgrade_enabled !== true) {
    throw new HttpError(403, 'Plan changes are not available right now')
  }

  // 3. Owner of an org with a trusted paid subscription
  const { data: memberships, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('role', 'owner')
  if (membershipError) {
    console.error('MEMBERSHIP ERROR:', membershipError)
    throw new HttpError(500, 'Could not verify organization')
  }

  const orgIds = [...new Set((memberships ?? []).map((m) => m.organization_id))]
  if (orgIds.length === 0) throw new HttpError(403, 'Only the account owner can change the plan')

  const { data: subs, error: subError } = await supabase
    .from('subscriptions')
    .select(
      'id, organization_id, status, stripe_customer_id, stripe_subscription_id, stripe_schedule_id'
    )
    .in('organization_id', orgIds)
    .eq('status', 'active')
    .not('stripe_subscription_id', 'is', null)
  if (subError) {
    console.error('SUBSCRIPTION ERROR:', subError)
    throw new HttpError(500, 'Could not verify subscription')
  }

  const sub = (subs ?? [])[0] as PaidSubscriptionRow | undefined
  if (!sub) throw new HttpError(403, 'No active paid subscription found')

  return { userId: user.id, sub }
}
