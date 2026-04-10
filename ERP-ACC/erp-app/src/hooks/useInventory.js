import { useState, useEffect, useCallback } from 'react'
import { getStock, getStockCard } from '../services/inventoryService'

export function useStock() {
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getStock()
      setStock(data || [])
    } catch (err) {
      setError(err.message)
      setStock([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  return { stock, loading, error, refetch: fetch }
}

export function useStockCard(productId, startDate, endDate) {
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    if (!productId) { setMovements([]); return }
    setLoading(true)
    setError(null)
    try {
      const data = await getStockCard(productId, startDate, endDate)
      setMovements(data || [])
    } catch (err) {
      setError(err.message)
      setMovements([])
    } finally {
      setLoading(false)
    }
  }, [productId, startDate, endDate])

  useEffect(() => { fetch() }, [fetch])

  return { movements, loading, error, refetch: fetch }
}
