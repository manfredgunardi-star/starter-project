import { useCallback } from 'react'
import { useQuery } from './useQuery'
import { getPurchaseOrders, getGoodsReceipts, getPurchaseInvoices } from '../services/purchaseService'
import { getPurchaseReturns } from '../services/purchaseReturnService'

export function usePurchaseOrders() {
  const fetcher = useCallback(() => getPurchaseOrders(), [])
  const { data: purchaseOrders, loading, error, refetch } = useQuery(fetcher)
  return { purchaseOrders, loading, error, refetch }
}

export function useGoodsReceipts() {
  const fetcher = useCallback(() => getGoodsReceipts(), [])
  const { data: goodsReceipts, loading, error, refetch } = useQuery(fetcher)
  return { goodsReceipts, loading, error, refetch }
}

export function usePurchaseInvoices() {
  const fetcher = useCallback(() => getPurchaseInvoices(), [])
  const { data: purchaseInvoices, loading, error, refetch } = useQuery(fetcher)
  return { purchaseInvoices, loading, error, refetch }
}

export function usePurchaseReturns() {
  const fetcher = useCallback(() => getPurchaseReturns(), [])
  const { data: returns, loading, error, refetch } = useQuery(fetcher)
  return { returns, loading, error, refetch }
}
