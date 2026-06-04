// src/lib/createUserWorkspace.ts
import { supabase } from './supabase'

export async function createUserWorkspace(
  userId: string,
  email: string
) {
  console.log('========================')
  console.log('WORKSPACE START')
  console.log('userId:', userId)
  console.log('email:', email)
  console.log('========================')

  // STEP 1 - PROFILE
  console.log('STEP 1: Creating profile')

  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      email
    })

  console.log('PROFILE RESULT:', profileError)

  if (profileError && profileError.code !== '23505') {
    console.error('PROFILE FAILED')
    return
  }

  console.log('PROFILE OK')

// STEP 2 - ORGANIZATION
console.log('STEP 2: Creating organization')

const {
  data: { user }
} = await supabase.auth.getUser()

console.log('AUTH USER:', user?.id)
console.log('INSERT OWNER:', userId)

const workspaceName =
  email.split('@')[0] + "'s Workspace"

const { data: org, error: orgError } = await supabase
  .from('organizations')
  .insert({
    owner_id: userId,
    name: workspaceName
  })
    .select()
    .single()

  console.log('ORG RESULT:', org)
  console.log('ORG ERROR:', orgError)

  if (orgError) {
    console.error('ORG FAILED')
    return
  }

  console.log('ORG OK')
  console.log('ORG ID:', org.id)

  // STEP 3 - MEMBERSHIP
  console.log('STEP 3: Creating membership')

  const membershipResult = await supabase
    .from('organization_members')
    .insert({
      organization_id: org.id,
      user_id: userId,
      role: 'owner'
    })

  console.log('MEMBERSHIP RESULT:', membershipResult)

  if (membershipResult.error) {
    console.error('MEMBERSHIP FAILED')
    return
  }

  console.log('MEMBERSHIP OK')

  // STEP 4 - SUBSCRIPTION
  console.log('STEP 4: Creating subscription')

  const subscriptionResult = await supabase
    .from('subscriptions')
    .insert({
      organization_id: org.id,
      status: 'trialing'
    })

  console.log('SUBSCRIPTION RESULT:', subscriptionResult)

  if (subscriptionResult.error) {
    console.error('SUBSCRIPTION FAILED')
    return
  }

  console.log('SUBSCRIPTION OK')

  console.log('========================')
  console.log('WORKSPACE COMPLETE')
  console.log('========================')
}