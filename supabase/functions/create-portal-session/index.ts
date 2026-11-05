// supabase/functions/create-portal-session/index.ts
//
// "Change payment method": opens a Stripe-hosted Customer Portal session that is
// restricted (by a dedicated portal configuration) to payment-method updates ONLY.
// VSTRK never sees or stores card details, and the portal cannot be used to cancel or
// change the subscription (those stay in VSTRK's own flows).
//
// Browser sends { subscription_id, origin }. Nothing else is trusted:
//  - the Stripe customer id comes from the subscriptions row (never from the client)
//  - the caller must OWN the organization of that exact subscription (cancelGuard)
//  - the return URL is built here from a fixed origin allowlist (the client's origin is
//    only used to PICK an entry from the list, never inserted into the URL)
//  - the portal configuration id comes from the STRIPE_PORTAL_CONFIGURATION_ID secret.
//    There is NO fallback to the Stripe account default configuration, and the function
//    refuses to open the portal if that configuration allows anything beyond payment
//    method updates.
//
// Default-card handling: Checkout-created subscriptions carry an explicit
// subscription-level default_payment_method, which overrides the customer-level default
// that the portal changes. Before opening the portal this function removes that override
// (after making sure the customer-level default holds the same card), so the card the
// customer picks in the portal is the one used for the next invoice. Idempotent.
//
// verify_jwt is false at the gateway: authentication happens in requireCancelableOwner.

import {
  corsHeaders,
  createClients,
  errorResponse,
  HttpError,
  json,
} from '../_shared/planChangeGuard.ts'
import { requireCancelableOwner, CANCELABLE_STATUSES } from '../_shared/cancelGuard.ts'

// Exact-match allowlist. Add specific preview origins here later if needed. No wildcards.
const ALLOWED_RETURN_ORIGINS = [
  'https://vstrk.com',
  'https://www.vstrk.com', // production traffic is served from www (seen in Stripe events); remove if unused
  'http://localhost:5173',
]
const RETURN_PATH = '/settings/upgrade'

function idOf(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && 'id' in v) return String((v as { id: string }).id)
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

    const body = await req.json().catch(() => ({}))
    const subscriptionId =
      typeof body.subscription_id === 'string' ? body.subscription_id.trim() : ''

    // 1. Authenticate + prove ownership of this exact subscription.
    const { sub } = await requireCancelableOwner(req, supabase, subscriptionId)

    // 2. Return URL from the allowlist (never from client input).
    const returnOrigin = ALLOWED_RETURN_ORIGINS.find((o) => o === body.origin)
    if (!returnOrigin) throw new HttpError(400, 'Unsupported origin')
    const returnUrl = `${returnOrigin}${RETURN_PATH}`

    // 3. Dedicated, restricted portal configuration (fail closed).
    const configurationId = (Deno.env.get('STRIPE_PORTAL_CONFIGURATION_ID') ?? '').trim()
    if (!configurationId.startsWith('bpc_')) {
      console.error('STRIPE_PORTAL_CONFIGURATION_ID is missing or invalid')
      throw new HttpError(503, 'Payment method management is not available right now')
    }

    // 4. Customer id from our database, cross-checked against Stripe.
    const customerId = sub.stripe_customer_id
    if (!customerId) throw new HttpError(409, 'No billing customer found for this subscription')

    const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
    if (idOf(stripeSub.customer) !== customerId) {
      console.error('CUSTOMER MISMATCH', sub.id, customerId, idOf(stripeSub.customer))
      throw new HttpError(409, 'This subscription cannot be changed automatically. Please contact support')
    }
    if (!CANCELABLE_STATUSES.includes(stripeSub.status)) {
      throw new HttpError(409, 'This subscription is no longer active')
    }

    // 5. Refuse to open a portal that allows more than payment-method updates.
    let cfg
    try {
      cfg = await stripe.billingPortal.configurations.retrieve(configurationId)
    } catch (err) {
      console.error('PORTAL CONFIG READ ERROR:', err)
      throw new HttpError(503, 'Payment method management is not available right now')
    }
    const f = cfg.features as Record<string, { enabled?: boolean } | undefined>
    const restricted =
      cfg.active === true &&
      f.payment_method_update?.enabled === true &&
      f.subscription_cancel?.enabled === false &&
      f.subscription_update?.enabled === false &&
      f.customer_update?.enabled === false &&
      f.subscription_pause?.enabled !== true
    if (!restricted) {
      console.error('PORTAL CONFIG NOT RESTRICTED (refusing to open):', configurationId)
      throw new HttpError(503, 'Payment method management is not available right now')
    }

    // 6. Make the portal's card change effective for this subscription.
    //    A subscription-level default_payment_method overrides the customer-level default
    //    the portal updates. Keep the current card as the customer default, then drop the
    //    override. Order matters: if the first step fails nothing has changed.
    try {
      const subPm = idOf(stripeSub.default_payment_method)
      if (subPm) {
        const customer = await stripe.customers.retrieve(customerId)
        if ('deleted' in customer && customer.deleted) {
          throw new HttpError(409, 'No billing customer found for this subscription')
        }
        const customerPm = idOf((customer as { invoice_settings?: { default_payment_method?: unknown } })
          .invoice_settings?.default_payment_method)
        if (!customerPm) {
          await stripe.customers.update(customerId, {
            invoice_settings: { default_payment_method: subPm },
          })
        }
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          default_payment_method: '',
        })
      }
    } catch (err) {
      if (err instanceof HttpError) throw err
      console.error('PAYMENT METHOD PREP ERROR:', err)
      throw new HttpError(502, 'Could not prepare the payment method update. Please try again')
    }

    // 7. Open the restricted portal.
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      configuration: configurationId,
      return_url: returnUrl,
    })

    return json({ url: portal.url })
  } catch (err) {
    return errorResponse(err)
  }
})
