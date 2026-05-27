// src/lib/createUserWorkspace.ts
import { supabase } from './supabase'

export async function createUserWorkspace(userId: string, email: string) {
  // 1. Create profile
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({ id: userId, email })

  if (profileError && profileError.code !== '23505') {
    // 23505 = already exists, safe to ignore
    console.error('Profile error:', profileError)
    return
  }

  // 2. Create organization
  const workspaceName = email.split('@')[0] + "'s Workspace"
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ owner_id: userId, name: workspaceName })
    .select()
    .single()

  if (orgError) {
    console.error('Org error:', orgError)
    return
  }

  // 3. Create membership
  await supabase
    .from('organization_members')
    .insert({
      organization_id: org.id,
      user_id: userId,
      role: 'owner'
    })

  // 4. Create subscription row (trialing)
  await supabase
    .from('subscriptions')
    .insert({
      organization_id: org.id,
      status: 'trialing'
    })
}