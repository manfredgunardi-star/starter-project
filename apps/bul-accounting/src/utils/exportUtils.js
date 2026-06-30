// Journal Excel export. xlsx is lazy-loaded so it stays out of the initial
// bundle (the heavy report exporters live in reportRenderers.js, also lazy).
export async function exportJournalsToExcel(journals, filename = 'Jurnal_Umum') {
  const XLSX = await import('xlsx')
  const rows = []
  journals.forEach(j => {
    j.lines?.forEach((line, idx) => {
      rows.push({
        Tanggal: idx === 0 ? j.date : '',
        'No. Jurnal': idx === 0 ? j.id?.slice(0, 8) : '',
        Keterangan: idx === 0 ? j.description : '',
        Truck: idx === 0 ? (j.truckId || '-') : '',
        'Kode Akun': line.accountCode,
        Debit: line.debit || 0,
        Kredit: line.credit || 0
      })
    })
    rows.push({}) // Empty row separator
  })

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 35 }, { wch: 15 },
    { wch: 12 }, { wch: 18 }, { wch: 18 }
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Jurnal')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}
