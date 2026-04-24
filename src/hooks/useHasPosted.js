import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export function useHasPosted() {
  const { user } = useAuth()
  const userId = user?.id || ''
  const [hasPosted, setHasPosted] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    if (!userId) {
      setHasPosted(true)
      setLoading(false)
      return () => {}
    }
    setLoading(true)
    supabase
      .from('events')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .then(({ data, error }) => {
        if (!alive) return
        if (error) throw error
        setHasPosted((data || []).length > 0)
      })
      .catch(() => {
        if (!alive) return
        setHasPosted(true)
      })
      .finally(() => {
        if (!alive) return
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [userId])

  return { hasPosted: !!hasPosted, loading: !!loading }
}
