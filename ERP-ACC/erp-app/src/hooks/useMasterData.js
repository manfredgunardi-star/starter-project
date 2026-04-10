import { useState, useEffect, useCallback } from 'react'
import * as svc from '../services/masterDataService'

function useFetchList(fetcher) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      setData(result || [])
    } catch (err) {
      setError(err.message)
      setData([])
    } finally {
      setLoading(false)
    }
  }, [fetcher])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, error, refetch: fetch }
}

export function useUnits() {
  const { data: units, loading, error, refetch } = useFetchList(svc.getUnits)
  return { units, loading, error, refetch }
}

export function useProducts() {
  const { data: products, loading, error, refetch } = useFetchList(svc.getProducts)
  return { products, loading, error, refetch }
}

export function useCOA() {
  const { data: coa, loading, error, refetch } = useFetchList(svc.getCOA)
  return { coa, loading, error, refetch }
}

export function useCustomers() {
  const { data: customers, loading, error, refetch } = useFetchList(svc.getCustomers)
  return { customers, loading, error, refetch }
}

export function useSuppliers() {
  const { data: suppliers, loading, error, refetch } = useFetchList(svc.getSuppliers)
  return { suppliers, loading, error, refetch }
}
