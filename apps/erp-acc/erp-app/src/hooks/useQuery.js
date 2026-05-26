import { useState, useEffect, useCallback } from 'react'

/**
 * Generic data-fetching hook.
 * @param {Function} fetcher - async function that returns an array
 * @param {object} options
 * @param {boolean} options.keepDataOnError - keep old data on refetch failure (default: false)
 */
export function useQuery(fetcher, { keepDataOnError = false } = {}) {
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
      if (!keepDataOnError) setData([])
    } finally {
      setLoading(false)
    }
  }, [fetcher, keepDataOnError])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, error, refetch: fetch }
}
