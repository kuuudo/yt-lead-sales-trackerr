import { supabase } from './supabase'

export async function createCheckout() {
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session) throw new Error('Not logged in')

  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: { origin: window.location.origin },
  })

  if (error) throw error
  if (data.url) window.location.href = data.url
}