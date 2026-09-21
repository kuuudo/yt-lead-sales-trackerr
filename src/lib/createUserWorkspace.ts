import { supabase } from './supabase'

/**
 * Create a new user workspace (profile, org, membership, trial subscription).
 *
 * PHASE 1 (2026-09): Do NOT auto-create the legacy system campaign
 * "ONLY PROMOTE ASSET". Asset-only promotion is now expressed as a real
 * Campaign with zero Campaign Links selected. Existing org rows that
 * already have ONLY PROMOTE ASSET are left untouched for compatibility.
 */
export async function createUserWorkspace(userId: string, email: string, fullName: string) {
  console.log("createUserWorkspace", userId, new Date().toISOString());
  // STEP 1 - PROFILE
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: userId, email, full_name: fullName })

  if (profileError && profileError.code !== '23505') {
    console.error('Profile creation failed:', profileError)
    return { success: false, step: 'profile', error: profileError }
  }

  // STEP 2 - ORGANIZATION
  const workspaceName = email.split('@')[0] + "'s Workspace"

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ owner_id: userId, name: workspaceName })
    .select()
    .single()

  if (orgError) {
    console.error('Organization creation failed:', orgError)
    return { success: false, step: 'organization', error: orgError }
  }

  // STEP 3 - MEMBERSHIP
  const { error: membershipError } = await supabase
    .from('organization_members')
    .insert({
      organization_id: org.id,
      user_id: userId,
      role: 'owner'
    })

  if (membershipError) {
    console.error('Membership creation failed:', membershipError)
    return { success: false, step: 'membership', error: membershipError }
  }

  // STEP 4 - SUBSCRIPTION (was STEP 5; system campaign step removed)
  const { error: subscriptionError } = await supabase
    .from('subscriptions')
    .insert({
      organization_id: org.id,
      status: 'trialing'
    })

  if (subscriptionError) {
    console.error('Subscription creation failed:', subscriptionError)
    return { success: false, step: 'subscription', error: subscriptionError }
  }

  return { success: true, organizationId: org.id }
}
