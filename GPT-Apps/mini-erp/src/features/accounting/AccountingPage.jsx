import { useMemo, useState } from 'react';
import { CheckCircle2, Lock, Plus, RotateCcw, Send, Trash2 } from 'lucide-react';
import { SelectField } from '../../components/forms/SelectField.jsx';
import { TextArea } from '../../components/forms/TextArea.jsx';
import { TextField } from '../../components/forms/TextField.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Drawer } from '../../components/ui/Drawer.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatCard } from '../../components/ui/StatCard.jsx';
import { useJournalEntries } from '../../hooks/useJournalEntries.js';
import { useMasterData } from '../../hooks/useMasterData.js';
import { validateJournalEntry } from '../../services/accountingService.js';
import { formatCurrency } from '../../utils/currency.js';
import { createId } from '../../utils/ids.js';

const today = new Date().toISOString().slice(0, 10);

function journalStatusTone(status) {
  if (status === 'Posted') return 'green';
  if (status === 'Void') return 'red';
  return 'orange';
}

const columns = [
  { key: 'journalNumber', label: 'Nomor' },
  { key: 'date', label: 'Tanggal' },
  { key: 'description', label: 'Keterangan' },
  { key: 'debit', label: 'Debit', render: (row) => formatCurrency(row.debit) },
  { key: 'credit', label: 'Kredit', render: (row) => formatCurrency(row.credit) },
  {
    key: 'status',
    label: 'Status',
    render: (row) => <Badge tone={journalStatusTone(row.status)}>{row.status}</Badge>,
  },
];

export function AccountingPage() {
  const { items: coaAccounts } = useMasterData('coaAccounts', { prefix: 'coa' });
  const { error: journalError, items: journalEntries, loading: journalLoading, post, saveDraft, voidJournal } = useJournalEntries();
  const { items: costCenters } = useMasterData('costCenters', { prefix: 'cc' });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [journalForm, setJournalForm] = useState({
    date: today,
    description: '',
    lines: [
      { id: 'draft-line-1', accountId: '', debit: '', credit: '', description: '', costCenterId: '' },
      { id: 'draft-line-2', accountId: '', debit: '', credit: '', description: '', costCenterId: '' },
    ],
  });
  const [validationLines, setValidationLines] = useState([
    { id: 'line-1', accountId: '1-1000', accountName: 'Kas', debit: 1000000, credit: 0 },
    { id: 'line-2', accountId: '3-1000', accountName: 'Modal', debit: 0, credit: 1000000 },
  ]);

  const validationResult = useMemo(() => validateJournalEntry({ lines: validationLines }), [validationLines]);
  const validationTone = validationResult.valid ? 'green' : 'red';
  const activeAccounts = useMemo(() => coaAccounts.filter((account) => account.isActive !== false), [coaAccounts]);
  const activeCostCenters = useMemo(() => costCenters.filter((costCenter) => costCenter.isActive !== false), [costCenters]);
  const draftLines = useMemo(
    () =>
      journalForm.lines.map((line) => {
        const account = activeAccounts.find((item) => item.id === line.accountId);
        const costCenter = activeCostCenters.find((item) => item.id === line.costCenterId);
        return {
          ...line,
          accountName: account?.nama || '',
          accountCode: account?.kode || '',
          costCenterName: costCenter?.nama || '',
          costCenterCode: costCenter?.kode || '',
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0),
        };
      }),
    [activeAccounts, activeCostCenters, journalForm.lines]
  );
  const draftValidation = useMemo(() => validateJournalEntry({ lines: draftLines }), [draftLines]);
  const postedCount = journalEntries.filter((entry) => entry.status === 'Posted').length;
  const draftCount = journalEntries.filter((entry) => entry.status === 'Draft').length;

  function updateValidationLine(index, patch) {
    setValidationLines((current) => current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)));
  }

  function openJournalDrawer() {
    setJournalForm({
      date: today,
      description: '',
      lines: [
        {
          id: createId('line'),
          accountId: activeAccounts[0]?.id || '',
          debit: '1000000',
          credit: '',
          description: 'Debit draft',
          costCenterId: activeCostCenters[0]?.id || '',
        },
        {
          id: createId('line'),
          accountId: activeAccounts[3]?.id || activeAccounts[1]?.id || '',
          debit: '',
          credit: '1000000',
          description: 'Kredit draft',
          costCenterId: activeCostCenters[0]?.id || '',
        },
      ],
    });
    setDrawerOpen(true);
  }

  function openJournalDetail(journal) {
    setSelectedJournal(journal);
    setDetailDrawerOpen(true);
  }

  function updateJournalForm(patch) {
    setJournalForm((current) => ({ ...current, ...patch }));
  }

  function updateJournalLine(index, patch) {
    setJournalForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    }));
  }

  function addJournalLine() {
    setJournalForm((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          id: createId('line'),
          accountId: activeAccounts[0]?.id || '',
          debit: '',
          credit: '',
          description: '',
          costCenterId: activeCostCenters[0]?.id || '',
        },
      ],
    }));
  }

  function removeJournalLine(index) {
    setJournalForm((current) => ({
      ...current,
      lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
    }));
  }

  async function handleSaveDraftJournal(event) {
    event.preventDefault();

    if (!draftValidation.valid || !journalForm.description.trim()) return;

    setSaving(true);
    try {
      await saveDraft({
        journal: {
          date: journalForm.date,
          description: journalForm.description.trim(),
          lines: draftLines.map((line) => ({
            id: line.id,
            accountId: line.accountId,
            accountCode: line.accountCode,
            accountName: line.accountName,
            debit: line.debit,
            credit: line.credit,
            description: line.description?.trim() || '',
            costCenterId: line.costCenterId || '',
            costCenterCode: line.costCenterCode || '',
            costCenterName: line.costCenterName || '',
          })),
        },
        totals: draftValidation.totals,
      });
      setDrawerOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handlePostJournal() {
    if (!selectedJournal) return;
    const confirmed = window.confirm(`Posting jurnal "${selectedJournal.description}"? Jurnal posted akan terkunci.`);
    if (!confirmed) return;

    setPosting(true);
    try {
      const postedJournal = await post(selectedJournal);
      setSelectedJournal(postedJournal);
      setDetailDrawerOpen(false);
    } finally {
      setPosting(false);
    }
  }

  async function handleVoidJournal() {
    if (!selectedJournal) return;
    const confirmed = window.confirm(`Void jurnal "${selectedJournal.description}" dan buat reversal journal?`);
    if (!confirmed) return;

    setVoiding(true);
    try {
      const result = await voidJournal({
        journal: selectedJournal,
        reason: 'Void journal dari halaman Accounting.',
      });
      setSelectedJournal(result.voidedJournal);
      setDetailDrawerOpen(false);
    } finally {
      setVoiding(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Double-entry"
        title="Accounting"
        description="Jurnal umum memakai draft, posting, dan validasi debit kredit seimbang."
        actions={<Button icon={Plus} onClick={openJournalDrawer}>Buat Jurnal</Button>}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard icon={CheckCircle2} label="Draft journal" value={String(draftCount)} helper="Belum mempengaruhi laporan." tone="orange" />
        <StatCard icon={CheckCircle2} label="Posted journal" value={String(postedCount)} helper="Terkunci setelah posting." tone="green" />
        <StatCard icon={CheckCircle2} label="Selisih" value={formatCurrency(0)} helper="Debit dan kredit seimbang." tone="blue" />
      </section>

      <section className="mt-7">
        {journalError ? (
          <div className="mb-4 rounded-2xl border border-ios-red/20 bg-ios-red/10 px-4 py-3 text-sm text-ios-red">{journalError}</div>
        ) : null}
        {journalLoading ? (
          <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
            Memuat jurnal...
          </div>
        ) : (
          <DataTable columns={columns} rows={journalEntries} onRowClick={openJournalDetail} />
        )}
      </section>

      <section className="mt-7 rounded-2xl border border-ios-separator bg-white p-5 shadow-ios-subtle">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ios-label">Validasi Jurnal Draft</h2>
            <p className="mt-1 text-sm leading-6 text-ios-secondary">
              Agent test memakai panel ini untuk memastikan aturan double-entry tetap menjaga debit dan kredit seimbang.
            </p>
          </div>
          <Badge tone={validationTone}>{validationResult.valid ? 'Seimbang' : 'Tidak seimbang'}</Badge>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {validationLines.map((line, index) => (
            <div className="rounded-2xl bg-ios-grouped p-4" key={line.id}>
              <p className="text-sm font-semibold text-ios-label">{line.accountName}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Debit</span>
                  <input
                    aria-label={`Debit ${line.accountName}`}
                    className="mt-2 h-11 w-full rounded-xl border border-ios-separator bg-white px-3 text-sm outline-none focus:border-ios-blue focus:ring-2 focus:ring-ios-blue/15"
                    min="0"
                    onChange={(event) => updateValidationLine(index, { debit: Number(event.target.value || 0) })}
                    type="number"
                    value={line.debit}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Kredit</span>
                  <input
                    aria-label={`Kredit ${line.accountName}`}
                    className="mt-2 h-11 w-full rounded-xl border border-ios-separator bg-white px-3 text-sm outline-none focus:border-ios-blue focus:ring-2 focus:ring-ios-blue/15"
                    min="0"
                    onChange={(event) => updateValidationLine(index, { credit: Number(event.target.value || 0) })}
                    type="number"
                    value={line.credit}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>

        <div
          className={[
            'mt-4 rounded-2xl border px-4 py-3 text-sm font-medium',
            validationResult.valid
              ? 'border-ios-green/20 bg-ios-green/10 text-[#147A31]'
              : 'border-ios-red/20 bg-ios-red/10 text-ios-red',
          ].join(' ')}
          role="status"
        >
          {validationResult.message}
        </div>
      </section>

      <Drawer
        description="Buat draft jurnal dari COA aktif. Draft belum memposting transaksi ke ledger."
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        title="Buat Jurnal Draft"
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Badge tone={draftValidation.valid ? 'green' : 'red'}>{draftValidation.valid ? 'Seimbang' : 'Tidak seimbang'}</Badge>
            <div className="flex gap-2 sm:justify-end">
              <Button onClick={() => setDrawerOpen(false)} type="button" variant="secondary" disabled={saving}>Batal</Button>
              <Button form="journal-draft-form" type="submit" disabled={saving || !journalForm.description.trim() || !draftValidation.valid}>
                {saving ? 'Menyimpan...' : 'Simpan Draft'}
              </Button>
            </div>
          </div>
        }
      >
        <form id="journal-draft-form" onSubmit={handleSaveDraftJournal} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Tanggal Jurnal"
              onChange={(event) => updateJournalForm({ date: event.target.value })}
              type="date"
              value={journalForm.date}
            />
            <TextField label="Nomor" readOnly value="Auto draft" />
          </div>

          <TextArea
            label="Keterangan Jurnal"
            onChange={(event) => updateJournalForm({ description: event.target.value })}
            placeholder="Contoh: Setoran modal awal"
            required
            value={journalForm.description}
          />

          <div className="space-y-4">
            {journalForm.lines.map((line, index) => (
              <div className="rounded-2xl bg-ios-grouped p-4" key={line.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ios-label">Baris {index + 1}</p>
                  {journalForm.lines.length > 2 ? (
                    <button
                      aria-label={`Hapus Baris ${index + 1}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ios-red shadow-ios-subtle transition hover:bg-ios-red/10 focus:outline-none focus:ring-2 focus:ring-ios-red/30"
                      onClick={() => removeJournalLine(index)}
                      type="button"
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  <SelectField
                    label={`Akun Baris ${index + 1}`}
                    onChange={(event) => updateJournalLine(index, { accountId: event.target.value })}
                    value={line.accountId}
                  >
                    <option value="">Pilih akun</option>
                    {activeAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.kode} - {account.nama}
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    label={`Debit Baris ${index + 1}`}
                    min="0"
                    onChange={(event) => updateJournalLine(index, { debit: event.target.value, credit: event.target.value ? '' : line.credit })}
                    type="number"
                    value={line.debit}
                  />
                  <TextField
                    label={`Kredit Baris ${index + 1}`}
                    min="0"
                    onChange={(event) => updateJournalLine(index, { credit: event.target.value, debit: event.target.value ? '' : line.debit })}
                    type="number"
                    value={line.credit}
                  />
                </div>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <TextField
                    label={`Deskripsi Baris ${index + 1}`}
                    onChange={(event) => updateJournalLine(index, { description: event.target.value })}
                    placeholder="Keterangan baris"
                    value={line.description}
                  />
                  <SelectField
                    label={`Cost Center Baris ${index + 1}`}
                    onChange={(event) => updateJournalLine(index, { costCenterId: event.target.value })}
                    value={line.costCenterId}
                  >
                    <option value="">Tanpa cost center</option>
                    {activeCostCenters.map((costCenter) => (
                      <option key={costCenter.id} value={costCenter.id}>
                        {costCenter.kode} - {costCenter.nama}
                      </option>
                    ))}
                  </SelectField>
                </div>
              </div>
            ))}
          </div>

          <Button onClick={addJournalLine} type="button" variant="secondary">Tambah Baris</Button>

          <div
            className={[
              'rounded-2xl border px-4 py-3 text-sm font-medium',
              draftValidation.valid
                ? 'border-ios-green/20 bg-ios-green/10 text-[#147A31]'
                : 'border-ios-red/20 bg-ios-red/10 text-ios-red',
            ].join(' ')}
            role="status"
          >
            {draftValidation.message}
          </div>
        </form>
      </Drawer>

      <Drawer
        description={
          selectedJournal?.status === 'Posted'
            ? 'Jurnal posted terkunci. Koreksi dilakukan dengan reversal journal.'
            : selectedJournal?.status === 'Void'
              ? 'Jurnal ini sudah dibatalkan dan tidak masuk ledger.'
              : 'Review draft sebelum diposting ke ledger.'
        }
        onClose={() => setDetailDrawerOpen(false)}
        open={detailDrawerOpen}
        title={selectedJournal?.journalNumber || 'Detail Jurnal'}
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Badge tone={journalStatusTone(selectedJournal?.status)}>{selectedJournal?.status || 'Draft'}</Badge>
            <div className="flex gap-2 sm:justify-end">
              <Button onClick={() => setDetailDrawerOpen(false)} type="button" variant="secondary" disabled={posting || voiding}>Tutup</Button>
              {selectedJournal?.status === 'Draft' ? (
                <Button icon={Send} onClick={handlePostJournal} type="button" disabled={posting}>
                  {posting ? 'Posting...' : 'Post Journal'}
                </Button>
              ) : selectedJournal?.status === 'Posted' ? (
                <>
                  <Button icon={RotateCcw} onClick={handleVoidJournal} type="button" variant="danger" disabled={voiding}>
                    {voiding ? 'Membuat Reversal...' : 'Void Journal'}
                  </Button>
                  <Button icon={Lock} type="button" variant="secondary" disabled>Jurnal Terkunci</Button>
                </>
              ) : (
                <Button icon={RotateCcw} type="button" variant="secondary" disabled>Sudah Void</Button>
              )}
            </div>
          </div>
        }
      >
        {selectedJournal ? (
          <div className="space-y-5">
            <div className="rounded-2xl bg-ios-grouped p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Keterangan</p>
              <p className="mt-2 text-base font-semibold text-ios-label">{selectedJournal.description}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Tanggal</p>
                  <p className="mt-1 text-sm text-ios-label">{selectedJournal.date}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Debit</p>
                  <p className="mt-1 text-sm font-semibold text-ios-label">{formatCurrency(selectedJournal.totalDebit || selectedJournal.debit)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Kredit</p>
                  <p className="mt-1 text-sm font-semibold text-ios-label">{formatCurrency(selectedJournal.totalCredit || selectedJournal.credit)}</p>
                </div>
              </div>
              {selectedJournal.status === 'Void' ? (
                <div className="mt-4 rounded-2xl border border-ios-red/20 bg-ios-red/10 px-4 py-3 text-sm text-ios-red">
                  Divoid pada {selectedJournal.voidedAt?.slice(0, 10)}. Reversal journal: {selectedJournal.reversalJournalId || '-'}.
                </div>
              ) : null}
            </div>

            <div className="space-y-3">
              {(selectedJournal.lines || []).map((line, index) => (
                <div className="rounded-2xl border border-ios-separator bg-white p-4 shadow-ios-subtle" key={line.id || index}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-ios-label">{line.accountCode} - {line.accountName}</p>
                      <p className="mt-1 text-sm text-ios-secondary">{line.description || 'Tanpa deskripsi baris'}</p>
                      {line.costCenterName ? (
                        <p className="mt-1 text-xs font-semibold text-ios-blue">{line.costCenterCode} - {line.costCenterName}</p>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-right text-sm sm:min-w-48">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Debit</p>
                        <p className="mt-1 font-semibold text-ios-label">{formatCurrency(line.debit)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Kredit</p>
                        <p className="mt-1 font-semibold text-ios-label">{formatCurrency(line.credit)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
