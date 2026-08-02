import { useState, useEffect, useMemo } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

export function useOrganization() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) return

    supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('role', 'owner')
      .maybeSingle()
      .then((result) => {
        console.log('ORG QUERY RESULT', result)

        setOrganizationId(
          result.data?.organization_id ?? null
        )

        setLoading(false)
      })
  }, [userId])

  return useMemo(() => ({ organizationId, loading }), [organizationId, loading])
}