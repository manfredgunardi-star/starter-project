// erp-app/src/hooks/useCompanySettings.js
import { useState, useEffect } from 'react'
import { getCompanySettings } from '../services/companySettingsService'

export function useCompanySettings() {
  const [company, setCompany] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getCompanySettings()
      .then(setCompany)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return { company, loading, error, setCompany }
}
