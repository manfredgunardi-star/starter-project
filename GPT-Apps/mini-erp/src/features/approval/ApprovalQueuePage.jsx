import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, FileText, Landmark, ShieldAlert } from 'lucide-react';
import { DataTable } from '../../components/tables/DataTable.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatCard } from '../../components/ui/StatCard.jsx';
import { useApprovalPermission } from '../../hooks/useApprovalPermission.js';
import { useCashBankTransactions } from '../../hooks/useCashBankTransactions.js';
import { useJournalEntries } from '../../hooks/useJournalEntries.js';
import { formatCurrency } from '../../utils/currency.js';

function documentAmount(document) {
  return Number(document.totalDebit || document.debit || document.amount || 0);
}

export function ApprovalQueuePage() {
  const { canApprove, getApprovalReason } = useApprovalPermission();
  const {
    approve: approveJournal,
    error: journalError,
    items: journalEntries,
    loading: journalLoading,
  } = useJournalEntries();
  const {
    approve: approveCashBank,
    error: cashBankError,
    items: cashBankTransactions,
    loading: cashBankLoading,
  } = useCashBankTransactions();
  const [approvingId, setApprovingId] = useState('');
  const [pageError, setPageError] = useState('');

  const rows = useMemo(() => {
    const journals = journalEntries
      .filter((journal) => journal.status === 'Draft' && journal.approvalStatus !== 'Approved' && journal.isActive !== false)
      .map((journal) => ({
        id: `journal-${journal.id}`,
        sourceId: journal.id,
        source: 'journal',
        module: 'Jurnal',
        icon: FileText,
        date: journal.date,
        number: journal.journalNumber,
        description: journal.description,
        amount: documentAmount(journal),
        document: journal,
      }));

    const cashBank = cashBankTransactions
      .filter((transaction) => transaction.status === 'Draft' && transaction.approvalStatus !== 'Approved' && transaction.isActive !== false)
      .map((transaction) => ({
        id: `cash-bank-${transaction.id}`,
        sourceId: transaction.id,
        source: 'cash-bank',
        module: 'Kas & Bank',
        icon: Landmark,
        date: transaction.date,
        number: transaction.transactionNumber,
        description: transaction.description,
        amount: documentAmount(transaction),
        document: transaction,
      }));

    return [...journals, ...cashBank].sort((a, b) => {
      const dateCompare = String(b.date || '').localeCompare(String(a.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(b.number || '').localeCompare(String(a.number || ''), 'id-ID');
    });
  }, [cashBankTransactions, journalEntries]);

  const approvableCount = rows.filter((row) => canApprove(row.document)).length;
  const blockedCount = rows.length - approvableCount;
  const loading = journalLoading || cashBankLoading;
  const error = pageError || journalError || cashBankError;

  async function handleApprove(row) {
    setPageError('');
    const reason = getApprovalReason(row.document);
    if (reason) {
      setPageError(reason);
      return;
    }

    setApprovingId(row.id);
    try {
      if (row.source === 'journal') {
        await approveJournal(row.document);
      } else {
        await approveCashBank(row.document);
      }
    } catch (nextError) {
      setPageError(nextError.message);
    } finally {
      setApprovingId('');
    }
  }

  const columns = [
    {
      key: 'module',
      label: 'Modul',
      render: (row) => {
        const Icon = row.icon;
        return (
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ios-blue/10 text-ios-blue">
              <Icon size={16} aria-hidden="true" />
            </span>
            <span className="font-semibold">{row.module}</span>
          </div>
        );
      },
    },
    { key: 'date', label: 'Tanggal' },
    { key: 'number', label: 'Nomor' },
    { key: 'description', label: 'Keterangan' },
    { key: 'amount', label: 'Nominal', render: (row) => formatCurrency(row.amount) },
    {
      key: 'createdBy',
      label: 'Maker',
      render: (row) => row.document.createdBy || '-',
    },
    {
      key: 'approval',
      label: 'Approval',
      render: (row) => {
        const reason = getApprovalReason(row.document);
        return reason ? <Badge tone="orange">Blocked</Badge> : <Badge tone="green">Ready</Badge>;
      },
    },
    {
      key: 'action',
      label: 'Aksi',
      render: (row) => {
        const reason = getApprovalReason(row.document);
        return (
          <Button
            icon={CheckCircle2}
            onClick={(event) => {
              event.stopPropagation();
              handleApprove(row);
            }}
            size="sm"
            type="button"
            variant="secondary"
            disabled={Boolean(reason) || approvingId === row.id}
            title={reason || undefined}
          >
            {approvingId === row.id ? 'Approving...' : 'Approve'}
          </Button>
        );
      },
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Approval"
        title="Approval Queue"
        description="Antrian draft jurnal dan Kas/Bank yang perlu disetujui sebelum posting."
        actions={<Badge tone="blue">Maker checker</Badge>}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard icon={ClipboardCheck} label="Menunggu approval" value={String(rows.length)} helper="Draft lintas modul." tone="orange" />
        <StatCard icon={CheckCircle2} label="Siap approve" value={String(approvableCount)} helper="Role dan maker-check valid." tone="green" />
        <StatCard icon={ShieldAlert} label="Blocked" value={String(blockedCount)} helper="Butuh approver lain atau permission." tone="red" />
      </section>

      {error ? (
        <div className="mt-5 rounded-2xl border border-ios-red/20 bg-ios-red/10 px-4 py-3 text-sm text-ios-red">{error}</div>
      ) : null}

      <section className="mt-7">
        {loading ? (
          <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
            Memuat approval queue...
          </div>
        ) : rows.length ? (
          <DataTable columns={columns} rows={rows} />
        ) : (
          <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
            Tidak ada draft yang menunggu approval.
          </div>
        )}
      </section>
    </div>
  );
}
