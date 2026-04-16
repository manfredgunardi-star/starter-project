import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createElement } from 'react'
import { jsPDF } from 'jspdf'
import { useToast } from '../components/ui/ToastContext'
import InvoicePrintTemplate from '../components/shared/InvoicePrintTemplate'
import { getSalesInvoice } from '../services/salesService'
import { getCompanySettings } from '../services/companySettingsService'

// Module-level variable untuk track root React yang di-render ke print container
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

function renderToContainer(invoice, company) {
  cleanupPrintContainer()
  const container = document.getElementById('invoice-print-root')
  const root = createRoot(container)
  flushSync(() => {
    root.render(createElement(InvoicePrintTemplate, { invoice, company }))
  })
  _printRoot = root
  return container
}

export function usePrintInvoice() {
  // loadingIds: { [invoiceId]: boolean } — tracking loading per baris di list
  const [loadingIds, setLoadingIds] = useState({})
  const toast = useToast()

  function setLoading(invoiceId, val) {
    setLoadingIds(prev => ({ ...prev, [invoiceId]: val }))
  }

  async function triggerPrint(invoiceId) {
    setLoading(invoiceId, true)
    try {
      const [invoice, company] = await Promise.all([
        getSalesInvoice(invoiceId),
        getCompanySettings(),
      ])
      renderToContainer(invoice, company)

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
      setLoading(invoiceId, false)
    }
  }

  async function triggerPDF(invoiceId) {
    setLoading(invoiceId, true)
    try {
      const [invoice, company] = await Promise.all([
        getSalesInvoice(invoiceId),
        getCompanySettings(),
      ])
      const container = renderToContainer(invoice, company)

      // Tampilkan container off-screen agar html2canvas bisa mengukurnya
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
              const filename = `invoice-${invoice.invoice_number}-${invoice.date}.pdf`
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
      setLoading(invoiceId, false)
    }
  }

  return { triggerPrint, triggerPDF, loadingIds }
}
