import { useState, useEffect, useCallback } from 'react'
import * as svc from '../services/masterDataService'

export function useUnits() {
  const [units, setUnits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await svc.getUnits()
      setUnits(data || [])
    } catch (err) {
      setError(err.message)
      setUnits([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { units, loading, error, refetch: fetch }
}
