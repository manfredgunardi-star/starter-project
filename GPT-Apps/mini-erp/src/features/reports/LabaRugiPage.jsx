import { useMemo, useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { DateRangeFilter } from '../../components/forms/DateRangeFilter.jsx';
import { SearchInput } from '../../components/forms/SearchInput.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatCard } from '../../components/ui/StatCard.jsx';
import { useJournalEntries } from '../../hooks/useJournalEntries.js';
import { useMasterData } from '../../hooks/useMasterData.js';
import { buildAccountBalances } from '../../utils/accountingReports.js';
import { formatCurrency } from '../../utils/currency.js';
import { dateRangeLabel } from '../../utils/dateRange.js';
import { exportRowsToExcel, exportRowsToPdf } from '../../utils/reportExport.js';

const columns = [
  {
    key: 'accountName',
    label: 'Akun',
    render: (row) => (
      <div>
        <p className="font-semibold">{row.accountCode} - {row.accountName}</p>
        <p className="mt-1 text-xs text-ios-secondary">{row.accountType}</p>
      </div>
    ),
  },
  { key: 'debit', label: 'Debit', render: (row) => formatCurrency(row.debit) },
  { key: 'credit', label: 'Kredit', render: (row) => formatCurrency(row.credit) },
  { key: 'balance', label: 'Nilai Laba Rugi', render: (row) => formatCurrency(row.balance) },
];

export function LabaRugiPage() {
  const { items, loading, error } = useJournalEntries();
  const { items: coaAccounts } = useMasterData('coaAccounts', { prefix: 'coa' });
  const [query, setQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const reportRows = buildAccountBalances({ journals: items, coaAccounts, startDate, endDate }).filter((row) =>
      ['Revenue', 'Expense'].includes(row.accountType)
    );

    if (!normalizedQuery) return reportRows;

    return reportRows.filter((row) =>
      [row.accountCode, row.accountName, row.accountType, row.normalBalance]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery))
    );
  }, [coaAccounts, endDate, items, query, startDate]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (summary, row) => ({
          revenue: summary.revenue + (row.accountType === 'Revenue' ? row.balance : 0),
          expense: summary.expense + (row.accountType === 'Expense' ? row.balance : 0),
        }),
        { revenue: 0, expense: 0 }
      ),
    [rows]
  );
  const netIncome = totals.revenue - totals.expense;
  const reportPeriod = dateRangeLabel(startDate, endDate);
  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        Akun: `${row.accountCode} - ${row.accountName}`,
        Tipe: row.accountType,
        Debit: row.debit,
        Kredit: row.credit,
        'Nilai Laba Rugi': row.balance,
      })),
    [rows]
  );

  function handleExportExcel() {
    exportRowsToExcel({
      fileName: `laba-rugi-${reportPeriod}`,
      sheetName: 'Laba Rugi',
      rows: exportRows,
    });
  }

  function handleExportPdf() {
    exportRowsToPdf({
      fileName: `laba-rugi-${reportPeriod}`,
      title: 'Laba Rugi',
      subtitle: reportPeriod,
      columns: [
        { key: 'Akun', header: 'Akun' },
        { key: 'Tipe', header: 'Tipe' },
        { key: 'Debit', header: 'Debit' },
        { key: 'Kredit', header: 'Kredit' },
        { key: 'Nilai Laba Rugi', header: 'Nilai Laba Rugi' },
      ],
      rows: exportRows,
    });
  }

  return (
    <div>
      <PageHeader
        eyebrow="Laporan"
        title="Laba Rugi"
        description="Ringkasan pendapatan dan beban dari jurnal posted pada periode yang dipilih."
        actions={
          <>
            <Badge tone={netIncome >= 0 ? 'green' : 'red'}>{netIncome >= 0 ? 'Laba' : 'Rugi'}</Badge>
            <Button icon={FileSpreadsheet} onClick={handleExportExcel} type="button" variant="secondary" disabled={!rows.length}>
              Excel
            </Button>
            <Button icon={FileText} onClick={handleExportPdf} type="button" variant="secondary" disabled={!rows.length}>
              PDF
            </Button>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard label="Pendapatan" value={formatCurrency(totals.revenue)} helper="Saldo akun Revenue." tone="green" />
        <StatCard label="Beban" value={formatCurrency(totals.expense)} helper="Saldo akun Expense." tone="orange" />
        <StatCard label="Laba/Rugi Bersih" value={formatCurrency(netIncome)} helper="Pendapatan dikurangi beban." tone={netIncome >= 0 ? 'blue' : 'red'} />
      </section>

      <section className="my-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] lg:items-start">
        <DateRangeFilter
          endDate={endDate}
          onClear={() => {
            setStartDate('');
            setEndDate('');
          }}
          onEndDateChange={setEndDate}
          onStartDateChange={setStartDate}
          startDate={startDate}
        />
        <SearchInput onChange={setQuery} placeholder="Cari kode akun, nama akun, atau tipe" value={query} />
      </section>

      {error ? (
        <div className="mb-4 rounded-2xl border border-ios-red/20 bg-ios-red/10 px-4 py-3 text-sm text-ios-red">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
          Memuat laba rugi...
        </div>
      ) : rows.length ? (
        <DataTable columns={columns} rows={rows} />
      ) : (
        <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
          Belum ada mutasi akun Revenue atau Expense pada periode ini.
        </div>
      )}
    </div>
  );
}
