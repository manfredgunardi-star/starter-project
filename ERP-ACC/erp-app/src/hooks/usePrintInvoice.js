import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { createElement } from 'react'
import { useToast } from '../components/ui/ToastContext'
import InvoicePrintTemplate from '../components/shared/InvoicePrintTemplate'
import { getSalesInvoice, getSalesOrder, getGoodsDelivery } from '../services/salesService'
import { getCompanySettings } from '../services/companySettingsService'
import { renderInvoicePdf } from '../utils/pdfRenderers/invoiceRenderer'

async function fetchInvoiceWithRefs(invoiceId) {
  const invoice = await getSalesInvoice(invoiceId)

  const [soResult, gdResult] = await Promise.allSettled([
    invoice.sales_order_id
      ? getSalesOrder(invoice.sales_order_id)
      : Promise.resolve(null),
    invoice.goods_delivery_id
      ? getGoodsDelivery(invoice.goods_delivery_id)
      : Promise.resolve(null),
  ])

  return {
    ...invoice,
    sales_order_number:
      soResult.status === 'fulfilled' && soResult.value
        ? soResult.value.so_number
        : null,
    goods_delivery_number:
      gdResult.status === 'fulfilled' && gdResult.value
        ? (gdResult.value.gd_number ?? gdResult.value.delivery_number ?? null)
        : null,
  }
}

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
        fetchInvoiceWithRefs(invoiceId),
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
        fetchInvoiceWithRefs(invoiceId),
        getCompanySettings(),
      ])
      const doc = await renderInvoicePdf(invoice, company)
      doc.save(`invoice-${invoice.invoice_number}-${invoice.date}.pdf`)
    } catch (err) {
      toast.error(`Gagal mengunduh PDF: ${err.message}`)
    } finally {
      setLoading(invoiceId, false)
    }
  }

  return { triggerPrint, triggerPDF, loadingIds }
}
