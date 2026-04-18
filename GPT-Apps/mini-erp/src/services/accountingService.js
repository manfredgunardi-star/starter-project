const EPSILON = 0.0001;

export function calculateJournalTotals(lines) {
  return lines.reduce(
    (totals, line) => ({
      debit: totals.debit + Number(line.debit || 0),
      credit: totals.credit + Number(line.credit || 0),
    }),
    { debit: 0, credit: 0 }
  );
}

export function validateJournalEntry({ lines }) {
  if (!Array.isArray(lines) || lines.length < 2) {
    return { valid: false, message: 'Jurnal minimal memiliki dua baris.' };
  }

  const hasInvalidLine = lines.some((line) => !line.accountId || (Number(line.debit || 0) <= 0 && Number(line.credit || 0) <= 0));
  if (hasInvalidLine) {
    return { valid: false, message: 'Setiap baris jurnal wajib memiliki akun dan nilai debit atau kredit.' };
  }

  const hasMixedDebitCredit = lines.some((line) => Number(line.debit || 0) > 0 && Number(line.credit || 0) > 0);
  if (hasMixedDebitCredit) {
    return { valid: false, message: 'Satu baris jurnal tidak boleh berisi debit dan kredit sekaligus.' };
  }

  const totals = calculateJournalTotals(lines);
  if (Math.abs(totals.debit - totals.credit) > EPSILON) {
    return { valid: false, message: 'Total debit dan kredit harus seimbang.', totals };
  }

  return { valid: true, message: 'Jurnal seimbang.', totals };
}
