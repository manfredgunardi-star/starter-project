// erp-app/src/hooks/usePrintPO.js
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createElement } from 'react'
import { useToast } from '../components/ui/ToastContext'
import POPrintTemplate from '../components/shared/POPrintTemplate'
import { getPurchaseOrder } from '../services/purchaseService'
import { getCompanySettings } from '../services/companySettingsService'
import { renderPOPdf } from '../utils/pdfRenderers/poRenderer'

// Module-level variable untuk track root React di print container
let _printRoot = null

function cleanupPrintContainer() {
  if (_printRoot) {
    try { _printRoot.unmount() } catch { /* ignore */ }
    _printRoot = null
  }
  const container = document.getElementById('invoice-print-root')
  if (container) {
    container.style.display = 'none'
  }
}

function renderToContainer(po, company) {
  cleanupPrintContainer()
  const container = document.getElementById('invoice-print-root')
  const root = createRoot(container)
  flushSync(() => {
    root.render(createElement(POPrintTemplate, { po, company }))
  })
  _printRoot = root
  return container
}

export function usePrintPO() {
  // loadingIds: { [poId]: boolean } — tracking loading per baris di list
  const [loadingIds, setLoadingIds] = useState({})
  const toast = useToast()

  function setLoading(poId, val) {
    setLoadingIds(prev => ({ ...prev, [poId]: val }))
  }

  async function triggerPrint(poId) {
    setLoading(poId, true)
    try {
      const [po, company] = await Promise.all([
        getPurchaseOrder(poId),
        getCompanySettings(),
      ])
      renderToContainer(po, company)

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
      setLoading(poId, false)
    }
  }

  async function triggerPDF(poId) {
    setLoading(poId, true)
    try {
      const [po, company] = await Promise.all([
        getPurchaseOrder(poId),
        getCompanySettings(),
      ])
      const doc = await renderPOPdf(po, company)
      doc.save(`po-${po.po_number}-${po.date}.pdf`)
    } catch (err) {
      toast.error(`Gagal mengunduh PDF: ${err.message}`)
    } finally {
      setLoading(poId, false)
    }
  }

  return { triggerPrint, triggerPDF, loadingIds }
}
