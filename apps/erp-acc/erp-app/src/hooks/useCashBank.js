import { useState, useEffect, useCallback } from 'react'
import { getPayments, getAccounts } from '../services/cashBankService'

function useList(fetcher) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await fetcher() || [])
    } catch (err) {
      setError(err.message)
      setData([])
    } finally {
      setLoading(false)
    }
  }, [fetcher])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}

export function usePayments(type) {
  const fetcher = useCallback(() => getPayments(type), [type])
  const { data: payments, loading, error, refetch } = useList(fetcher)
  return { payments, loading, error, refetch }
}

export function useAccounts() {
  const { data: accounts, loading, error } = useList(getAccounts)
  return { accounts, loading, error }
}
