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

function inferNormalBalance(account, line) {
  if (account?.saldoNormal) return account.saldoNormal;
  if (line?.saldoNormal) return line.saldoNormal;

  const accountPrefix = String(account?.kode || line?.accountCode || '').slice(0, 1);
  return ['2', '3', '4'].includes(accountPrefix) ? 'Credit' : 'Debit';
}

function flattenPostedLines(journals, accountById) {
  const postedJournals = journals.filter((journal) => journal.status === 'Posted' && journal.isActive !== false);

  return postedJournals
    .flatMap((journal) =>
      (journal.lines || []).map((line) => {
        const account = accountById.get(line.accountId);

        return {
          id: `${journal.id}-${line.id}`,
          journalId: journal.id,
          journalNumber: journal.journalNumber,
          date: journal.date,
          description: journal.description,
          lineDescription: line.description,
          accountId: line.accountId,
          accountCode: line.accountCode,
          accountName: line.accountName,
          costCenterName: line.costCenterName,
          normalBalance: inferNormalBalance(account, line),
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0),
        };
      })
    )
    .sort((a, b) => {
      const accountCompare = String(a.accountCode || '').localeCompare(String(b.accountCode || ''), 'id-ID');
      if (accountCompare !== 0) return accountCompare;
      const dateCompare = String(a.date || '').localeCompare(String(b.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(a.journalNumber || '').localeCompare(String(b.journalNumber || ''), 'id-ID');
    });
}

function withRunningBalance(lines) {
  const balances = new Map();

  return lines.map((line) => {
    const current = balances.get(line.accountId) || 0;
    const movement = line.normalBalance === 'Credit' ? line.credit - line.debit : line.debit - line.credit;
    const next = current + movement;
    balances.set(line.accountId, next);

    return {
      ...line,
      runningBalance: next,
    };
  });
}

export function BukuBesarPage() {
  const { items, loading, error } = useJournalEntries();
  const { items: coaAccounts } = useMasterData('coaAccounts', { prefix: 'coa' });
  const [query, setQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const accountById = useMemo(() => new Map(coaAccounts.map((account) => [account.id, account])), [coaAccounts]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const ledgerRows = withRunningBalance(flattenPostedLines(items, accountById)).filter((row) =>
      isWithinDateRange(row.date, startDate, endDate)
    );

    if (!normalizedQuery) return ledgerRows;

    return ledgerRows.filter((row) =>
      [row.accountCode, row.accountName, row.journalNumber, row.description, row.lineDescription, row.costCenterName, row.normalBalance]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery))
    );
  }, [accountById, endDate, items, query, startDate]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (summary, row) => ({
          debit: summary.debit + row.debit,
          credit: summary.credit + row.credit,
        }),
        { debit: 0, credit: 0 }
      ),
    [rows]
  );
  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        Tanggal: row.date,
        Nomor: row.journalNumber,
        Akun: `${row.accountCode} - ${row.accountName}`,
        'Saldo Normal': row.normalBalance,
        'Cost Center': row.costCenterName || '',
        Keterangan: row.description,
        'Keterangan Baris': row.lineDescription || '',
        Debit: row.debit,
        Kredit: row.credit,
        Saldo: row.runningBalance,
      })),
    [rows]
  );
  const reportPeriod = dateRangeLabel(startDate, endDate);

  function handleExportExcel() {
    exportRowsToExcel({
      fileName: `buku-besar-${reportPeriod}`,
      sheetName: 'Buku Besar',
      rows: exportRows,
    });
  }

  function handleExportPdf() {
    exportRowsToPdf({
      fileName: `buku-besar-${reportPeriod}`,
      title: 'Buku Besar',
      subtitle: reportPeriod,
      columns: [
        { key: 'Tanggal', header: 'Tanggal' },
        { key: 'Nomor', header: 'Nomor' },
        { key: 'Akun', header: 'Akun' },
        { key: 'Saldo Normal', header: 'Saldo Normal' },
        { key: 'Debit', header: 'Debit' },
        { key: 'Kredit', header: 'Kredit' },
        { key: 'Saldo', header: 'Saldo' },
      ],
      rows: exportRows,
    });
  }

  const columns = [
    { key: 'date', label: 'Tanggal' },
    { key: 'journalNumber', label: 'Nomor' },
    {
      key: 'accountName',
      label: 'Akun',
      render: (row) => (
        <div>
          <p className="font-semibold">{row.accountCode} - {row.accountName}</p>
          {row.costCenterName ? <p className="mt-1 text-xs text-ios-secondary">{row.costCenterName}</p> : null}
        </div>
      ),
    },
    {
      key: 'description',
      label: 'Keterangan',
      render: (row) => (
        <div>
          <p>{row.description}</p>
          {row.lineDescription ? <p className="mt-1 text-xs text-ios-secondary">{row.lineDescription}</p> : null}
        </div>
      ),
    },
    { key: 'debit', label: 'Debit', render: (row) => formatCurrency(row.debit) },
    { key: 'credit', label: 'Kredit', render: (row) => formatCurrency(row.credit) },
    { key: 'normalBalance', label: 'Saldo Normal' },
    { key: 'runningBalance', label: 'Saldo', render: (row) => formatCurrency(row.runningBalance) },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Laporan"
        title="Buku Besar"
        description="Laporan ini hanya membaca jurnal posted dan menghitung saldo berjalan sesuai saldo normal tiap akun."
        actions={
          <>
            <Badge tone="green">Posted only</Badge>
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
        <StatCard label="Baris posted" value={String(rows.length)} helper="Baris jurnal yang masuk ledger." tone="blue" />
        <StatCard label="Total debit" value={formatCurrency(totals.debit)} helper="Akumulasi debit dari hasil filter." tone="green" />
        <StatCard label="Total kredit" value={formatCurrency(totals.credit)} helper="Akumulasi kredit dari hasil filter." tone="orange" />
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
        <SearchInput onChange={setQuery} placeholder="Cari akun, nomor jurnal, keterangan, atau cost center" value={query} />
      </section>

      {error ? (
        <div className="mb-4 rounded-2xl border border-ios-red/20 bg-ios-red/10 px-4 py-3 text-sm text-ios-red">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
          Memuat buku besar...
        </div>
      ) : rows.length ? (
        <DataTable columns={columns} rows={rows} />
      ) : (
        <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
          Belum ada jurnal posted untuk ditampilkan.
        </div>
      )}
    </div>
  );
}
