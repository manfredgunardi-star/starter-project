const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];

function bawahSeribu(n) {
  if (n < 12) return SATUAN[n];
  if (n < 20) return `${SATUAN[n - 10]} belas`;
  if (n < 100) return `${SATUAN[Math.floor(n / 10)]} puluh ${SATUAN[n % 10]}`.trim();
  const ratus = Math.floor(n / 100) === 1 ? 'seratus' : `${SATUAN[Math.floor(n / 100)]} ratus`;
  return `${ratus} ${bawahSeribu(n % 100)}`.trim();
}

const SKALA = [[1000000000000n, 'triliun'], [1000000000n, 'miliar'], [1000000n, 'juta'], [1000n, 'ribu']];

export function terbilang(v) {
  let n = BigInt(String(v).split('.')[0]);
  if (n === 0n) return 'nol rupiah';
  const bagian = [];
  for (const [nilai, nama] of SKALA) {
    if (n >= nilai) {
      const k = Number(n / nilai);
      bagian.push(nama === 'ribu' && k === 1 ? 'seribu' : `${bawahSeribu(k)} ${nama}`);
      n %= nilai;
    }
  }
  if (n > 0n) bagian.push(bawahSeribu(Number(n)));
  return `${bagian.join(' ')} rupiah`;
}
