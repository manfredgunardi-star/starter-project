import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createElement } from 'react'
import { useToast } from '../components/ui/ToastContext'
import ProformaInvoicePrintTemplate from '../components/shared/ProformaInvoicePrintTemplate'
import { getProformaInvoice } from '../services/proformaService'
import { getCompanySettings } from '../services/companySettingsService'
import { renderProformaPdf } from '../utils/pdfRenderers/proformaRenderer'

// Module-level variable untuk track root React yang di-render ke print container
let _printRoot = null

function cleanupPrintContainer() {
  if (_printRoot) {
    try { _printRoot.unmount() } catch { /* ignore */ }
    _printRoot = null
  }
  const container = document.getElementById('proforma-invoice-print-root')
  if (container) {
    container.style.display = 'none'
  }
}

function renderToContainer(proforma, company) {
  cleanupPrintContainer()
  const container = document.getElementById('proforma-invoice-print-root')
  const root = createRoot(container)
  flushSync(() => {
    root.render(createElement(ProformaInvoicePrintTemplate, { proforma, company }))
  })
  _printRoot = root
  return container
}

export function usePrintProformaInvoice() {
  // loadingIds: { [proformaId]: boolean } - tracking loading per baris di list
  const [loadingIds, setLoadingIds] = useState({})
  const toast = useToast()

  function setLoading(proformaId, val) {
    setLoadingIds(prev => ({ ...prev, [proformaId]: val }))
  }

  async function triggerPrint(proformaId) {
    setLoading(proformaId, true)
    try {
      const [proforma, company] = await Promise.all([
        getProformaInvoice(proformaId),
        getCompanySettings(),
      ])
      renderToContainer(proforma, company)

      // Setelah dialog print ditutup, bersihkan container
      const afterPrint = () => {
        cleanupPrintContainer()
        window.removeEventListener('afterprint', afterPrint)
      }
      window.addEventListener('afterprint', afterPrint)
      window.print()
    } catch (err) {
      toast.error(`Gagal mencetak: ${err.message}`)
      cleanupPrintContainer()
    } finally {
      setLoading(proformaId, false)
    }
  }

  async function triggerPDF(proformaId) {
    setLoading(proformaId, true)
    try {
      const [proforma, company] = await Promise.all([
        getProformaInvoice(proformaId),
        getCompanySettings(),
      ])
      const doc = await renderProformaPdf(proforma, company)
      doc.save(`proforma-${proforma.proforma_number}-${proforma.date}.pdf`)
    } catch (err) {
      toast.error(`Gagal mengunduh PDF: ${err.message}`)
    } finally {
      setLoading(proformaId, false)
    }
  }

  return { triggerPrint, triggerPDF, loadingIds }
}
