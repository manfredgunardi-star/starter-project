import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, FileSpreadsheet, FileText, Plus, Send } from 'lucide-react';
import { DateRangeFilter } from '../../components/forms/DateRangeFilter.jsx';
import { SearchInput } from '../../components/forms/SearchInput.jsx';
import { SelectField } from '../../components/forms/SelectField.jsx';
import { TextArea } from '../../components/forms/TextArea.jsx';
import { TextField } from '../../components/forms/TextField.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Drawer } from '../../components/ui/Drawer.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatCard } from '../../components/ui/StatCard.jsx';
import { useCashBankTransactions } from '../../hooks/useCashBankTransactions.js';
import { useJournalEntries } from '../../hooks/useJournalEntries.js';
import { useMasterData } from '../../hooks/useMasterData.js';
import { formatCurrency } from '../../utils/currency.js';
import { dateRangeLabel, isWithinDateRange } from '../../utils/dateRange.js';
import { exportRowsToExcel, exportRowsToPdf } from '../../utils/reportExport.js';

const today = new Date().toISOString().slice(0, 10);

function isCashBankAccount(account, line = {}) {
  const label = `${account?.kode || line.accountCode || ''} ${account?.nama || line.accountName || ''}`.toLowerCase();
  return label.includes('kas') || label.includes('bank');
}

function transactionStatusTone(status) {
  return status === 'Posted' ? 'green' : 'orange';
}

function buildCashBankRows(journals, coaAccounts) {
  const accountById = new Map(coaAccounts.map((account) => [account.id, account]));

  return journals
    .filter((journal) => journal.status === 'Posted' && journal.isActive !== false)
    .flatMap((journal) =>
      (journal.lines || []).flatMap((line) => {
        const account = accountById.get(line.accountId);
        if (!isCashBankAccount(account, line)) return [];

        const debit = Number(line.debit || 0);
        const credit = Number(line.credit || 0);
        const amount = Math.abs(debit - credit);
        if (!amount) return [];

        return [
          {
            id: `${journal.id}-${line.id}`,
            date: journal.date,
            journalNumber: journal.journalNumber,
            description: journal.description,
            lineDescription: line.description,
            accountCode: account?.kode || line.accountCode,
            accountName: account?.nama || line.accountName,
            costCenterName: line.costCenterName,
            type: debit >= credit ? 'Masuk' : 'Keluar',
            amount,
          },
        ];
      })
    )
    .sort((a, b) => {
      const dateCompare = String(b.date || '').localeCompare(String(a.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(b.journalNumber || '').localeCompare(String(a.journalNumber || ''), 'id-ID');
    });
}

const mutationColumns = [
  { key: 'date', label: 'Tanggal' },
  { key: 'journalNumber', label: 'Nomor' },
  {
    key: 'account',
    label: 'Akun Kas/Bank',
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
  { key: 'type', label: 'Tipe', render: (row) => <Badge tone={row.type === 'Masuk' ? 'green' : 'red'}>{row.type}</Badge> },
  { key: 'amount', label: 'Nominal', render: (row) => formatCurrency(row.amount) },
];

const transactionColumns = [
  { key: 'transactionNumber', label: 'Nomor' },
  { key: 'date', label: 'Tanggal' },
  {
    key: 'description',
    label: 'Keterangan',
    render: (row) => (
      <div>
        <p className="font-semibold">{row.description}</p>
        <p className="mt-1 text-xs text-ios-secondary">{row.cashAccountCode} - {row.cashAccountName}</p>
      </div>
    ),
  },
  { key: 'type', label: 'Tipe', render: (row) => <Badge tone={row.type === 'Masuk' ? 'green' : 'red'}>{row.type}</Badge> },
  { key: 'amount', label: 'Nominal', render: (row) => formatCurrency(row.amount) },
  { key: 'status', label: 'Status', render: (row) => <Badge tone={transactionStatusTone(row.status)}>{row.status}</Badge> },
];

export function KasBankPage() {
  const { error, items: journals, loading } = useJournalEntries();
  const {
    error: transactionError,
    items: transactions,
    loading: transactionsLoading,
    post,
    saveDraft,
  } = useCashBankTransactions();
  const { items: coaAccounts } = useMasterData('coaAccounts', { prefix: 'coa' });
  const { items: costCenters } = useMasterData('costCenters', { prefix: 'cc' });
  const [query, setQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [form, setForm] = useState({
    date: today,
    type: 'Masuk',
    cashAccountId: '',
    counterAccountId: '',
    costCenterId: '',
    amount: '1000000',
    description: '',
  });

  const activeAccounts = useMemo(() => coaAccounts.filter((account) => account.isActive !== false), [coaAccounts]);
  const cashAccounts = useMemo(() => activeAccounts.filter((account) => isCashBankAccount(account)), [activeAccounts]);
  const activeCostCenters = useMemo(() => costCenters.filter((costCenter) => costCenter.isActive !== false), [costCenters]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const cashRows = buildCashBankRows(journals, coaAccounts).filter((row) =>
      isWithinDateRange(row.date, startDate, endDate)
    );

    if (!normalizedQuery) return cashRows;

    return cashRows.filter((row) =>
      [row.accountCode, row.accountName, row.journalNumber, row.description, row.lineDescription, row.costCenterName, row.type]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedQuery))
    );
  }, [coaAccounts, endDate, journals, query, startDate]);

  const transactionRows = useMemo(
    () => transactions.filter((transaction) => transaction.isActive !== false),
    [transactions]
  );
  const draftCount = transactionRows.filter((transaction) => transaction.status === 'Draft').length;

  const totals = useMemo(
    () =>
      rows.reduce(
        (summary, row) => ({
          masuk: summary.masuk + (row.type === 'Masuk' ? row.amount : 0),
          keluar: summary.keluar + (row.type === 'Keluar' ? row.amount : 0),
        }),
        { masuk: 0, keluar: 0 }
      ),
    [rows]
  );
  const balance = totals.masuk - totals.keluar;
  const reportPeriod = dateRangeLabel(startDate, endDate);
  const exportRows = useMemo(
    () =>
      rows.map((row) => ({
        Tanggal: row.date,
        Nomor: row.journalNumber,
        Akun: `${row.accountCode} - ${row.accountName}`,
        Tipe: row.type,
        Nominal: row.amount,
        Keterangan: row.description,
        'Keterangan Baris': row.lineDescription || '',
        'Cost Center': row.costCenterName || '',
      })),
    [rows]
  );

  function openDrawer() {
    const firstCash = cashAccounts[0];
    const firstCounter = activeAccounts.find((account) => account.id !== firstCash?.id && account.kode?.startsWith('3-')) || activeAccounts[0];
    setForm({
      date: today,
      type: 'Masuk',
      cashAccountId: firstCash?.id || '',
      counterAccountId: firstCounter?.id || '',
      costCenterId: activeCostCenters[0]?.id || '',
      amount: '1000000',
      description: '',
    });
    setDrawerOpen(true);
  }

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function buildTransactionPayload() {
    const cashAccount = activeAccounts.find((account) => account.id === form.cashAccountId);
    const counterAccount = activeAccounts.find((account) => account.id === form.counterAccountId);
    const costCenter = activeCostCenters.find((item) => item.id === form.costCenterId);

    return {
      date: form.date,
      type: form.type,
      cashAccountId: cashAccount?.id || '',
      cashAccountCode: cashAccount?.kode || '',
      cashAccountName: cashAccount?.nama || '',
      counterAccountId: counterAccount?.id || '',
      counterAccountCode: counterAccount?.kode || '',
      counterAccountName: counterAccount?.nama || '',
      costCenterId: costCenter?.id || '',
      costCenterCode: costCenter?.kode || '',
      costCenterName: costCenter?.nama || '',
      amount: Number(form.amount || 0),
      description: form.description.trim(),
    };
  }

  async function handleSaveDraft(event) {
    event.preventDefault();
    const payload = buildTransactionPayload();
    if (!payload.description || !payload.cashAccountId || !payload.counterAccountId || payload.cashAccountId === payload.counterAccountId || payload.amount <= 0) return;

    setSaving(true);
    try {
      await saveDraft(payload);
      setDrawerOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handlePostTransaction() {
    if (!selectedTransaction) return;
    const confirmed = window.confirm(`Posting transaksi "${selectedTransaction.description}" menjadi jurnal?`);
    if (!confirmed) return;

    setPosting(true);
    try {
      const result = await post(selectedTransaction);
      setSelectedTransaction(result.postedTransaction);
      setDetailOpen(false);
    } finally {
      setPosting(false);
    }
  }

  function handleExportExcel() {
    exportRowsToExcel({
      fileName: `kas-bank-${reportPeriod}`,
      sheetName: 'Kas Bank',
      rows: exportRows,
    });
  }

  function handleExportPdf() {
    exportRowsToPdf({
      fileName: `kas-bank-${reportPeriod}`,
      title: 'Kas & Bank',
      subtitle: reportPeriod,
      columns: [
        { key: 'Tanggal', header: 'Tanggal' },
        { key: 'Nomor', header: 'Nomor' },
        { key: 'Akun', header: 'Akun' },
        { key: 'Tipe', header: 'Tipe' },
        { key: 'Nominal', header: 'Nominal' },
        { key: 'Keterangan', header: 'Keterangan' },
      ],
      rows: exportRows,
    });
  }

  const canSave =
    form.description.trim() &&
    form.cashAccountId &&
    form.counterAccountId &&
    form.cashAccountId !== form.counterAccountId &&
    Number(form.amount || 0) > 0;

  return (
    <div>
      <PageHeader
        eyebrow="Treasury"
        title="Kas & Bank"
        description="Transaksi kas/bank dibuat sebagai draft, lalu posting menghasilkan jurnal otomatis yang masuk laporan."
        actions={
          <>
            <Button icon={Plus} onClick={openDrawer} type="button">
              Tambah Transaksi
            </Button>
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
        <StatCard icon={ArrowDownLeft} label="Kas masuk" value={formatCurrency(totals.masuk)} helper="Debit pada akun kas/bank." tone="green" />
        <StatCard icon={ArrowUpRight} label="Kas keluar" value={formatCurrency(totals.keluar)} helper="Kredit pada akun kas/bank." tone="red" />
        <StatCard label="Saldo kas/bank" value={formatCurrency(balance)} helper="Selisih masuk dan keluar periode ini." tone="blue" />
        <StatCard label="Draft transaksi" value={String(draftCount)} helper="Belum membuat jurnal." tone="orange" />
      </section>

      <section className="mt-7">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ios-label">Transaksi Kas/Bank</h2>
            <p className="mt-1 text-sm text-ios-secondary">Klik transaksi draft untuk memposting jurnal otomatis.</p>
          </div>
        </div>
        {transactionError ? (
          <div className="mb-4 rounded-2xl border border-ios-red/20 bg-ios-red/10 px-4 py-3 text-sm text-ios-red">{transactionError}</div>
        ) : null}
        {transactionsLoading ? (
          <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
            Memuat transaksi kas/bank...
          </div>
        ) : transactionRows.length ? (
          <DataTable
            columns={transactionColumns}
            rows={transactionRows}
            onRowClick={(row) => {
              setSelectedTransaction(row);
              setDetailOpen(true);
            }}
          />
        ) : (
          <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
            Belum ada transaksi kas/bank. Buat draft pertama dari tombol Tambah Transaksi.
          </div>
        )}
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
        <SearchInput onChange={setQuery} placeholder="Cari akun, nomor jurnal, keterangan, tipe, atau cost center" value={query} />
      </section>

      {error ? (
        <div className="mb-4 rounded-2xl border border-ios-red/20 bg-ios-red/10 px-4 py-3 text-sm text-ios-red">{error}</div>
      ) : null}

      <section className="mt-7">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-ios-label">Mutasi dari Jurnal Posted</h2>
          <p className="mt-1 text-sm text-ios-secondary">Tabel ini hanya membaca baris jurnal posted untuk akun Kas/Bank.</p>
        </div>
        {loading ? (
          <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
            Memuat kas dan bank...
          </div>
        ) : rows.length ? (
          <DataTable columns={mutationColumns} rows={rows} />
        ) : (
          <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
            Belum ada mutasi kas/bank dari jurnal posted.
          </div>
        )}
      </section>

      <Drawer
        description="Draft belum mempengaruhi laporan sampai diposting menjadi jurnal."
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDrawerOpen(false)} type="button" variant="secondary" disabled={saving}>Batal</Button>
            <Button form="cash-bank-form" type="submit" disabled={!canSave || saving}>
              {saving ? 'Menyimpan...' : 'Simpan Draft'}
            </Button>
          </div>
        }
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        title="Tambah Transaksi Kas/Bank"
      >
        <form id="cash-bank-form" className="space-y-5" onSubmit={handleSaveDraft}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Tanggal Transaksi" onChange={(event) => updateForm({ date: event.target.value })} type="date" value={form.date} />
            <SelectField label="Tipe Transaksi" onChange={(event) => updateForm({ type: event.target.value })} value={form.type}>
              <option value="Masuk">Masuk</option>
              <option value="Keluar">Keluar</option>
            </SelectField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Akun Kas/Bank" onChange={(event) => updateForm({ cashAccountId: event.target.value })} value={form.cashAccountId}>
              <option value="">Pilih akun</option>
              {cashAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.kode} - {account.nama}</option>
              ))}
            </SelectField>
            <SelectField label="Akun Lawan" onChange={(event) => updateForm({ counterAccountId: event.target.value })} value={form.counterAccountId}>
              <option value="">Pilih akun</option>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>{account.kode} - {account.nama}</option>
              ))}
            </SelectField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nominal" min="0" onChange={(event) => updateForm({ amount: event.target.value })} type="number" value={form.amount} />
            <SelectField label="Cost Center" onChange={(event) => updateForm({ costCenterId: event.target.value })} value={form.costCenterId}>
              <option value="">Tanpa cost center</option>
              {activeCostCenters.map((costCenter) => (
                <option key={costCenter.id} value={costCenter.id}>{costCenter.kode} - {costCenter.nama}</option>
              ))}
            </SelectField>
          </div>
          <TextArea
            label="Keterangan Transaksi"
            onChange={(event) => updateForm({ description: event.target.value })}
            placeholder="Contoh: Setoran kas operasional"
            required
            value={form.description}
          />
          {form.cashAccountId && form.cashAccountId === form.counterAccountId ? (
            <div className="rounded-2xl border border-ios-red/20 bg-ios-red/10 px-4 py-3 text-sm text-ios-red">
              Akun Kas/Bank dan Akun Lawan tidak boleh sama.
            </div>
          ) : null}
        </form>
      </Drawer>

      <Drawer
        description={selectedTransaction?.status === 'Draft' ? 'Posting akan membuat jurnal posted otomatis.' : 'Transaksi ini sudah diposting.'}
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Badge tone={transactionStatusTone(selectedTransaction?.status)}>{selectedTransaction?.status || 'Draft'}</Badge>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDetailOpen(false)} type="button" variant="secondary" disabled={posting}>Tutup</Button>
              {selectedTransaction?.status === 'Draft' ? (
                <Button icon={Send} onClick={handlePostTransaction} type="button" disabled={posting}>
                  {posting ? 'Posting...' : 'Post Transaksi'}
                </Button>
              ) : null}
            </div>
          </div>
        }
        onClose={() => setDetailOpen(false)}
        open={detailOpen}
        title={selectedTransaction?.transactionNumber || 'Detail Transaksi'}
      >
        {selectedTransaction ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-ios-grouped p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Keterangan</p>
              <p className="mt-2 text-base font-semibold text-ios-label">{selectedTransaction.description}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Kas/Bank</p>
                  <p className="mt-1 text-sm text-ios-label">{selectedTransaction.cashAccountCode} - {selectedTransaction.cashAccountName}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Akun Lawan</p>
                  <p className="mt-1 text-sm text-ios-label">{selectedTransaction.counterAccountCode} - {selectedTransaction.counterAccountName}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Nominal</p>
                  <p className="mt-1 text-sm font-semibold text-ios-label">{formatCurrency(selectedTransaction.amount)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Jurnal</p>
                  <p className="mt-1 text-sm text-ios-label">{selectedTransaction.journalNumber || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
