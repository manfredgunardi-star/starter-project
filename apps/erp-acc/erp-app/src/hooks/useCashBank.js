import { useCallback } from 'react'
import { useQuery } from './useQuery'
import { getPayments, getAccounts } from '../services/cashBankService'

export function usePayments(type) {
  const fetcher = useCallback(() => getPayments(type), [type])
  const { data: payments, loading, error, refetch } = useQuery(fetcher)
  return { payments, loading, error, refetch }
}

export function useAccounts() {
  const fetcher = useCallback(() => getAccounts(), [])
  const { data: accounts, loading, error } = useQuery(fetcher)
  return { accounts, loading, error }
}
