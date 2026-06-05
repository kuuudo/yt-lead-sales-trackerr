import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

export function useOrganization() {
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .maybeSingle()
      .then((result) => {
        console.log('ORG QUERY RESULT', result)

        setOrganizationId(
          result.data?.organization_id ?? null
        )

        setLoading(false)
      })
  }, [user])

  return { organizationId, loading }
}