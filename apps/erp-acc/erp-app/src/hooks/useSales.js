import { useState, useEffect, useCallback } from 'react'
import { getSalesOrders, getGoodsDeliveries, getSalesInvoices } from '../services/salesService'

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

export function useSalesOrders() {
  const { data: orders, loading, error, refetch } = useList(getSalesOrders)
  return { orders, loading, error, refetch }
}

export function useGoodsDeliveries() {
  const { data: deliveries, loading, error, refetch } = useList(getGoodsDeliveries)
  return { deliveries, loading, error, refetch }
}

export function useSalesInvoices() {
  const { data: invoices, loading, error, refetch } = useList(getSalesInvoices)
  return { invoices, loading, error, refetch }
}
