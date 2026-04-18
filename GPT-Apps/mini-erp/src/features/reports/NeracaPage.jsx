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
  { key: 'normalBalance', label: 'Saldo Normal' },
  { key: 'balance', label: 'Saldo', render: (row) => formatCurrency(row.balance) },
];

export function NeracaPage() {
  const { items, loading, error } = useJournalEntries();
  const { items: coaAccounts } = useMasterData('coaAccounts', { prefix: 'coa' });
  const [query, setQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const allBalances = useMemo(
    () => buildAccountBalances({ journals: items, coaAccounts, startDate, endDate }),
    [coaAccounts, endDate, items, startDate]
  );
  const netIncome = useMemo(
    () =>
      allBalances.reduce((summary, row) => {
        if (row.accountType === 'Revenue') return summary + row.balance;
        if (row.accountType === 'Expense') return summary - row.balance;
        return summary;
      }, 0),
    [allBalances]
  );

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const balanceRows = allBalances
      .filter((row) => ['Asset', 'Liability', 'Equity'].includes(row.accountType))
      .concat(
        netIncome
          ? [
              {
                id: 'current-net-income',
                accountCode: '3-9999',
                accountName: 'Laba/Rugi Berjalan',
                accountType: 'Equity',
                normalBalance: 'Credit',
                debit: 0,
                credit: 0,
                balance: netIncome,
              },
            ]
          : []
      )
      .sort((a, b) => String(a.accountCode || '').localeCompare(String(b.accountCode || ''), 'id-ID'));

    if (!normalizedQuery) return balanceRows;

    return balanceRows.filter((row) =>
      [row.accountCode, row.accountName, row.accountType, row.normalBalance]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery))
    );
  }, [allBalances, netIncome, query]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (summary, row) => ({
          asset: summary.asset + (row.accountType === 'Asset' ? row.balance : 0),
          liability: summary.liability + (row.accountType === 'Liability' ? row.balance : 0),
          equity: summary.equity + (row.accountType === 'Equity' ? row.balance : 0),
        }),
        { asset: 0, liability: 0, equity: 0 }
      ),
    [rows]
  );
  const difference = totals.asset - (totals.liability + totals.equity);
  const reportPeriod = dateRangeLabel(startDate, endDate);
  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        Akun: `${row.accountCode} - ${row.accountName}`,
        Tipe: row.accountType,
        'Saldo Normal': row.normalBalance,
        Saldo: row.balance,
      })),
    [rows]
  );

  function handleExportExcel() {
    exportRowsToExcel({
      fileName: `neraca-${reportPeriod}`,
      sheetName: 'Neraca',
      rows: exportRows,
    });
  }

  function handleExportPdf() {
    exportRowsToPdf({
      fileName: `neraca-${reportPeriod}`,
      title: 'Neraca',
      subtitle: reportPeriod,
      columns: [
        { key: 'Akun', header: 'Akun' },
        { key: 'Tipe', header: 'Tipe' },
        { key: 'Saldo Normal', header: 'Saldo Normal' },
        { key: 'Saldo', header: 'Saldo' },
      ],
      rows: exportRows,
    });
  }

  return (
    <div>
      <PageHeader
        eyebrow="Laporan"
        title="Neraca"
        description="Posisi aset, liabilitas, dan ekuitas dari jurnal posted, termasuk laba/rugi berjalan."
        actions={
          <>
            <Badge tone={Math.abs(difference) < 1 ? 'green' : 'red'}>{Math.abs(difference) < 1 ? 'Balance' : 'Selisih'}</Badge>
            <Button icon={FileSpreadsheet} onClick={handleExportExcel} type="button" variant="secondary" disabled={!rows.length}>
              Excel
            </Button>
            <Button icon={FileText} onClick={handleExportPdf} type="button" variant="secondary" disabled={!rows.length}>
              PDF
            </Button>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard label="Aset" value={formatCurrency(totals.asset)} helper="Saldo akun Asset." tone="blue" />
        <StatCard label="Liabilitas" value={formatCurrency(totals.liability)} helper="Saldo akun Liability." tone="orange" />
        <StatCard label="Ekuitas" value={formatCurrency(totals.equity)} helper="Equity termasuk laba berjalan." tone="green" />
        <StatCard label="Selisih" value={formatCurrency(difference)} helper="Aset minus liabilitas dan ekuitas." tone={Math.abs(difference) < 1 ? 'green' : 'red'} />
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
        <SearchInput onChange={setQuery} placeholder="Cari kode akun, nama akun, tipe, atau saldo normal" value={query} />
      </section>

      {error ? (
        <div className="mb-4 rounded-2xl border border-ios-red/20 bg-ios-red/10 px-4 py-3 text-sm text-ios-red">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
          Memuat neraca...
        </div>
      ) : rows.length ? (
        <DataTable columns={columns} rows={rows} />
      ) : (
        <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
          Belum ada saldo akun neraca pada periode ini.
        </div>
      )}
    </div>
  );
}
