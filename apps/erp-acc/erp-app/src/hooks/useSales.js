import { useCallback } from 'react'
import { useQuery } from './useQuery'
import { getSalesOrders, getGoodsDeliveries, getSalesInvoices } from '../services/salesService'
import { getSalesReturns } from '../services/salesReturnService'

export function useSalesOrders() {
  const fetcher = useCallback(() => getSalesOrders(), [])
  const { data: orders, loading, error, refetch } = useQuery(fetcher)
  return { orders, loading, error, refetch }
}

export function useGoodsDeliveries() {
  const fetcher = useCallback(() => getGoodsDeliveries(), [])
  const { data: deliveries, loading, error, refetch } = useQuery(fetcher)
  return { deliveries, loading, error, refetch }
}

export function useSalesInvoices() {
  const fetcher = useCallback(() => getSalesInvoices(), [])
  const { data: invoices, loading, error, refetch } = useQuery(fetcher)
  return { invoices, loading, error, refetch }
}

export function useSalesReturns() {
  const fetcher = useCallback(() => getSalesReturns(), [])
  const { data: returns, loading, error, refetch } = useQuery(fetcher)
  return { returns, loading, error, refetch }
}
