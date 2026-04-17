// erp-app/src/hooks/usePrintPO.js
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createElement } from 'react'
import { jsPDF } from 'jspdf'
import { useToast } from '../components/ui/ToastContext'
import POPrintTemplate from '../components/shared/POPrintTemplate'
import { getPurchaseOrder } from '../services/purchaseService'
import { getCompanySettings } from '../services/companySettingsService'

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
    container.style.position = ''
    container.style.top = ''
    container.style.left = ''
    container.style.width = ''
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
      const container = renderToContainer(po, company)

      container.style.display = 'block'
      container.style.position = 'fixed'
      container.style.top = '-9999px'
      container.style.left = '0'
      container.style.width = '794px'

      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      await new Promise((resolve, reject) => {
        doc.html(container, {
          x: 15,
          y: 15,
          width: 565,
          windowWidth: 794,
          html2canvas: { scale: 1, useCORS: true },
          callback: (d) => {
            try {
              const filename = `po-${po.po_number}-${po.date}.pdf`
              d.save(filename)
              resolve()
            } catch (e) {
              reject(e)
            }
          }
        })
      })
    } catch (err) {
      toast.error(`Gagal mengunduh PDF: ${err.message}`)
    } finally {
      cleanupPrintContainer()
      setLoading(poId, false)
    }
  }

  return { triggerPrint, triggerPDF, loadingIds }
}
