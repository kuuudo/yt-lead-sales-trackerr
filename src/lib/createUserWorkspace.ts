import { supabase } from './supabase'

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
  // STEP 4 - SYSTEM CAMPAIGN
const { error: systemCampaignError } = await supabase
  .from('campaigns')
  .insert({
    organization_id: org.id,
    campaign_name: 'ONLY PROMOTE ASSET',
    is_system: true,
  })

if (systemCampaignError && systemCampaignError.code !== '23505') {
  console.error('System Campaign creation failed:', systemCampaignError)
  return {
    success: false,
    step: 'system_campaign',
    error: systemCampaignError,
  }
}


  // STEP 5 - SUBSCRIPTION
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