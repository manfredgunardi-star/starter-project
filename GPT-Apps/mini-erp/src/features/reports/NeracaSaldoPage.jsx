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
import { formatCurrency } from '../../utils/currency.js';
import { dateRangeLabel, isWithinDateRange } from '../../utils/dateRange.js';
import { exportRowsToExcel, exportRowsToPdf } from '../../utils/reportExport.js';

function inferNormalBalance(account, accountCode) {
  if (account?.saldoNormal) return account.saldoNormal;

  const accountPrefix = String(account?.kode || accountCode || '').slice(0, 1);
  return ['2', '3', '4'].includes(accountPrefix) ? 'Credit' : 'Debit';
}

function buildTrialBalanceRows(journals, coaAccounts, startDate, endDate) {
  const accountById = new Map(coaAccounts.map((account) => [account.id, account]));
  const rowsByAccount = new Map();
  const postedJournals = journals.filter(
    (journal) => journal.status === 'Posted' && journal.isActive !== false && isWithinDateRange(journal.date, startDate, endDate)
  );

  postedJournals.forEach((journal) => {
    (journal.lines || []).forEach((line) => {
      const account = accountById.get(line.accountId);
      const key = line.accountId || line.accountCode;
      const current = rowsByAccount.get(key) || {
        id: key,
        accountCode: account?.kode || line.accountCode,
        accountName: account?.nama || line.accountName,
        accountType: account?.tipe || '-',
        normalBalance: inferNormalBalance(account, line.accountCode),
        debit: 0,
        credit: 0,
      };

      current.debit += Number(line.debit || 0);
      current.credit += Number(line.credit || 0);
      rowsByAccount.set(key, current);
    });
  });

  return [...rowsByAccount.values()]
    .map((row) => {
      const normalEnding = row.normalBalance === 'Credit' ? row.credit - row.debit : row.debit - row.credit;
      const endingDebit = row.normalBalance === 'Debit'
        ? Math.max(normalEnding, 0)
        : Math.max(-normalEnding, 0);
      const endingCredit = row.normalBalance === 'Credit'
        ? Math.max(normalEnding, 0)
        : Math.max(-normalEnding, 0);

      return {
        ...row,
        endingDebit,
        endingCredit,
      };
    })
    .filter((row) => row.debit || row.credit || row.endingDebit || row.endingCredit)
    .sort((a, b) => String(a.accountCode || '').localeCompare(String(b.accountCode || ''), 'id-ID'));
}

export function NeracaSaldoPage() {
  const { items, loading, error } = useJournalEntries();
  const { items: coaAccounts } = useMasterData('coaAccounts', { prefix: 'coa' });
  const [query, setQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const trialBalanceRows = buildTrialBalanceRows(items, coaAccounts, startDate, endDate);

    if (!normalizedQuery) return trialBalanceRows;

    return trialBalanceRows.filter((row) =>
      [row.accountCode, row.accountName, row.accountType, row.normalBalance]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery))
    );
  }, [coaAccounts, endDate, items, query, startDate]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (summary, row) => ({
          debit: summary.debit + row.debit,
          credit: summary.credit + row.credit,
          endingDebit: summary.endingDebit + row.endingDebit,
          endingCredit: summary.endingCredit + row.endingCredit,
        }),
        { debit: 0, credit: 0, endingDebit: 0, endingCredit: 0 }
      ),
    [rows]
  );
  const difference = totals.endingDebit - totals.endingCredit;
  const reportPeriod = dateRangeLabel(startDate, endDate);
  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        Akun: `${row.accountCode} - ${row.accountName}`,
        Tipe: row.accountType,
        'Saldo Normal': row.normalBalance,
        'Mutasi Debit': row.debit,
        'Mutasi Kredit': row.credit,
        'Saldo Debit': row.endingDebit,
        'Saldo Kredit': row.endingCredit,
      })),
    [rows]
  );

  function handleExportExcel() {
    exportRowsToExcel({
      fileName: `neraca-saldo-${reportPeriod}`,
      sheetName: 'Neraca Saldo',
      rows: exportRows,
    });
  }

  function handleExportPdf() {
    exportRowsToPdf({
      fileName: `neraca-saldo-${reportPeriod}`,
      title: 'Neraca Saldo',
      subtitle: reportPeriod,
      columns: [
        { key: 'Akun', header: 'Akun' },
        { key: 'Tipe', header: 'Tipe' },
        { key: 'Saldo Normal', header: 'Saldo Normal' },
        { key: 'Mutasi Debit', header: 'Mutasi Debit' },
        { key: 'Mutasi Kredit', header: 'Mutasi Kredit' },
        { key: 'Saldo Debit', header: 'Saldo Debit' },
        { key: 'Saldo Kredit', header: 'Saldo Kredit' },
      ],
      rows: exportRows,
    });
  }

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
    { key: 'debit', label: 'Mutasi Debit', render: (row) => formatCurrency(row.debit) },
    { key: 'credit', label: 'Mutasi Kredit', render: (row) => formatCurrency(row.credit) },
    { key: 'endingDebit', label: 'Saldo Debit', render: (row) => formatCurrency(row.endingDebit) },
    { key: 'endingCredit', label: 'Saldo Kredit', render: (row) => formatCurrency(row.endingCredit) },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Laporan"
        title="Neraca Saldo"
        description="Ringkasan saldo akhir per akun dari jurnal posted, disajikan sesuai saldo normal COA."
        actions={
          <>
            <Badge tone={difference === 0 ? 'green' : 'red'}>{difference === 0 ? 'Balance' : 'Selisih'}</Badge>
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
        <StatCard label="Akun bergerak" value={String(rows.length)} helper="Akun dengan mutasi posted." tone="blue" />
        <StatCard label="Saldo debit" value={formatCurrency(totals.endingDebit)} helper="Total saldo akhir debit." tone="green" />
        <StatCard label="Saldo kredit" value={formatCurrency(totals.endingCredit)} helper="Total saldo akhir kredit." tone="orange" />
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
          Memuat neraca saldo...
        </div>
      ) : rows.length ? (
        <DataTable columns={columns} rows={rows} />
      ) : (
        <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
          Belum ada jurnal posted untuk dihitung.
        </div>
      )}
    </div>
  );
}
