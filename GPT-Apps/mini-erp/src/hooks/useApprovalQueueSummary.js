import { useMemo } from 'react';
import { useCashBankTransactions } from './useCashBankTransactions.js';
import { useJournalEntries } from './useJournalEntries.js';

export function useApprovalQueueSummary() {
  const { items: journalEntries } = useJournalEntries();
  const { items: cashBankTransactions } = useCashBankTransactions();

  return useMemo(() => {
    const journalPending = journalEntries.filter(
      (journal) => journal.status === 'Draft' && journal.approvalStatus !== 'Approved' && journal.isActive !== false
    ).length;
    const cashBankPending = cashBankTransactions.filter(
      (transaction) => transaction.status === 'Draft' && transaction.approvalStatus !== 'Approved' && transaction.isActive !== false
    ).length;

    return {
      cashBankPending,
      journalPending,
      pendingApprovalCount: journalPending + cashBankPending,
    };
  }, [cashBankTransactions, journalEntries]);
}
