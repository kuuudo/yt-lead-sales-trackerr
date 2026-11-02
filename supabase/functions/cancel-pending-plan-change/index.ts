// supabase/functions/cancel-pending-plan-change/index.ts
//
// Cancels a pending plan change by RELEASING the subscription schedule.
// Releasing detaches the schedule and leaves the subscription exactly as it is:
// same sub_..., same current price, same current period, no invoice.
// The customer simply keeps their current plan.

import {
  CLEARED_PENDING,
  corsHeaders,
  createClients,
  errorResponse,
  json,
  requireEligibleOwner,
} from '../_shared/planChangeGuard.ts'

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

    // Find the schedule: ours, or one Stripe still has attached to the subscription.
    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
    const scheduleId =
      sub.stripe_schedule_id ??
      (typeof stripeSub.schedule === 'string' ? stripeSub.schedule : stripeSub.schedule?.id) ??
      null

    let released = false
    if (scheduleId) {
      const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId)
      if (schedule.status === 'active' || schedule.status === 'not_started') {
        await stripe.subscriptionSchedules.release(scheduleId)
        released = true
      }
    }

    const { error: writeError } = await supabase
      .from('subscriptions')
      .update({ ...CLEARED_PENDING, updated_at: new Date().toISOString() })
      .eq('id', sub.id)

    if (writeError) {
      console.error('CLEAR PENDING WRITE ERROR:', writeError)
      return json({ error: 'Cancelled in Stripe, but saving it failed. Please refresh in a minute' }, 500)
    }

    return json({ success: true, released })
  } catch (err) {
    return errorResponse(err)
  }
})
