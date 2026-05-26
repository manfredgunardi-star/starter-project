import { useCallback } from 'react'
import { useQuery } from './useQuery'
import * as svc from '../services/masterDataService'

export function useUnits() {
  const fetcher = useCallback(() => svc.getUnits(), [])
  const { data: units, loading, error, refetch } = useQuery(fetcher, { keepDataOnError: true })
  return { units, loading, error, refetch }
}

export function useProducts() {
  const fetcher = useCallback(() => svc.getProducts(), [])
  const { data: products, loading, error, refetch } = useQuery(fetcher, { keepDataOnError: true })
  return { products, loading, error, refetch }
}

export function useCOA() {
  const fetcher = useCallback(() => svc.getCOA(), [])
  const { data: coa, loading, error, refetch } = useQuery(fetcher, { keepDataOnError: true })
  return { coa, loading, error, refetch }
}

export function useCustomers() {
  const fetcher = useCallback(() => svc.getCustomers(), [])
  const { data: customers, loading, error, refetch } = useQuery(fetcher, { keepDataOnError: true })
  return { customers, loading, error, refetch }
}

export function useSuppliers() {
  const fetcher = useCallback(() => svc.getSuppliers(), [])
  const { data: suppliers, loading, error, refetch } = useQuery(fetcher, { keepDataOnError: true })
  return { suppliers, loading, error, refetch }
}

export function useCashBankAccounts() {
  const fetcher = useCallback(() => svc.getCashBankAccounts(), [])
  const { data: accounts, loading, error, refetch } = useQuery(fetcher, { keepDataOnError: true })
  return { accounts, loading, error, refetch }
}

export function useCOAForCashBank() {
  const fetcher = useCallback(() => svc.getCOAForCashBank(), [])
  const { data: coaOptions, loading, error } = useQuery(fetcher, { keepDataOnError: true })
  return { coaOptions, loading, error }
}
