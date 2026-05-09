import { useState, useEffect, useCallback } from 'react'
import { getPurchaseOrders, getGoodsReceipts, getPurchaseInvoices } from '../services/purchaseService'

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

export function usePurchaseOrders() {
  const fetcher = useCallback(() => getPurchaseOrders(), [])
  const { data: purchaseOrders, loading, error, refetch } = useList(fetcher)
  return { purchaseOrders, loading, error, refetch }
}

export function useGoodsReceipts() {
  const fetcher = useCallback(() => getGoodsReceipts(), [])
  const { data: goodsReceipts, loading, error, refetch } = useList(fetcher)
  return { goodsReceipts, loading, error, refetch }
}

export function usePurchaseInvoices() {
  const fetcher = useCallback(() => getPurchaseInvoices(), [])
  const { data: purchaseInvoices, loading, error, refetch } = useList(fetcher)
  return { purchaseInvoices, loading, error, refetch }
}
