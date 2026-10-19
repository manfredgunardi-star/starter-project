import { describe, it, expect } from 'vitest';
import { splitInvoiceSJIds } from './invoiceSJPersist.js';

describe('splitInvoiceSJIds — invoice baru', () => {
  it('menstempel semua SJ tercentang dan tidak melepas apa pun', () => {
    expect(splitInvoiceSJIds([], ['sj-1', 'sj-2'])).toEqual({
      sjIdsToAttach: ['sj-1', 'sj-2'],
      sjIdsToDetach: [],
    });
  });

  it('aman saat kedua daftar kosong atau tidak diisi', () => {
    expect(splitInvoiceSJIds()).toEqual({ sjIdsToAttach: [], sjIdsToDetach: [] });
    expect(splitInvoiceSJIds(undefined, undefined)).toEqual({ sjIdsToAttach: [], sjIdsToDetach: [] });
  });
});

describe('splitInvoiceSJIds — edit invoice', () => {
  it('SJ yang dilepas centangnya masuk daftar detach, BUKAN daftar attach', () => {
    const { sjIdsToAttach, sjIdsToDetach } = splitInvoiceSJIds(
      ['sj-1', 'sj-2', 'sj-3'],
      ['sj-1', 'sj-3']
    );

    // Inilah akar bug SJ yatim: sj-2 dulu ikut tertulis 'terinvoice'
    // padahal id-nya sudah tidak ada di suratJalanIds invoice mana pun.
    expect(sjIdsToAttach).not.toContain('sj-2');
    expect(sjIdsToDetach).toEqual(['sj-2']);
    expect(sjIdsToAttach).toEqual(['sj-1', 'sj-3']);
  });

  it('melepas semua SJ saat seluruh centang dibuang', () => {
    expect(splitInvoiceSJIds(['sj-1', 'sj-2'], [])).toEqual({
      sjIdsToAttach: [],
      sjIdsToDetach: ['sj-1', 'sj-2'],
    });
  });

  it('SJ yang ditambah masuk attach, SJ yang tetap tercentang ikut distempel ulang', () => {
    expect(splitInvoiceSJIds(['sj-1'], ['sj-1', 'sj-9'])).toEqual({
      sjIdsToAttach: ['sj-1', 'sj-9'],
      sjIdsToDetach: [],
    });
  });

  it('tidak pernah menaruh id yang sama di attach dan detach sekaligus', () => {
    const { sjIdsToAttach, sjIdsToDetach } = splitInvoiceSJIds(
      ['sj-1', 'sj-2'],
      ['sj-2', 'sj-2', 'sj-3']
    );
    expect(sjIdsToAttach).toEqual(['sj-2', 'sj-3']);
    expect(sjIdsToDetach).toEqual(['sj-1']);
    expect(sjIdsToAttach.filter((id) => sjIdsToDetach.includes(id))).toEqual([]);
  });
});
