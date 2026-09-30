# Rencana: Task 10 yang bisa diambil alih Codex

## Kelayakan — apa yang sebenarnya bisa dan tidak bisa

Task 10 ditulis sebagai verifikasi manual di browser. Sebagian besar isinya ternyata **tidak memerlukan browser sama sekali**, dan justru lebih baik dikerjakan sebagai tes yang menetap. Sisanya tetap milik user.

Tiga fakta yang sudah diperiksa langsung, bukan dikira-kira:

1. **`apps/bul` tidak punya Playwright.** Dependensi `web` hanya `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `vitest`, `vite`, `@vitejs/plugin-react`. Playwright hanya ada di `apps/erp-acc/erp-app`, aplikasi lain.
2. **`File.text()` tersedia di jsdom yang terpasang.** Dijalankan dan lulus. Artinya `bacaBerkas` dan seluruh alur `pilihBerkas` bisa dijalankan tanpa browser, tanpa dependensi baru.
3. **`useRpc` bergantung pada `App.useApp()` dan `useQueryClient()`**, tetapi keduanya lenyap begitu modul `lib/data.js` di-mock utuh. Tidak perlu `QueryClientProvider`, tidak perlu pembungkus `App` antd.

Karena itu **Playwright tidak dipasang**. Menambah browser, login, dan `storageState` hanya untuk memeriksa state React adalah jalan mahal ketika perkakasnya sudah ada di kotak.

### Yang Codex ambil alih

| Butir Task 10 | Jadi apa |
|---|---|
| 7 — peringatan muncul, tombol mati | Tes komponen `ImporPage` |
| 8 — centang menghidupkan, batal mematikan | Tes komponen `ImporPage` |
| 9 — pengakuan tidak terbawa ke kiriman baru | Tes komponen `ImporPage` |
| 10 — tidak ada jurnal komisi | **Tes DB**, bukan tes browser |
| 11 — upah kosong dan tanpa pengurus | Tes komponen `ImporPage` |

### Yang tetap milik user

Butir 1–6: login sungguhan, impor sungguhan, lalu melihat hasilnya di `/sj`, `/kas`, dan `/buku-besar`.

Ini **bukan** karena Codex kurang mampu, melainkan karena butir-butir itu memeriksa hal yang tidak ada yang memikirkannya lebih dulu. Fase 1a melewatkan langkah ini dan menyesal; fase Bonus menjalankannya dan menemukan sesuatu yang tidak terlihat dari tes mana pun. Tes yang diotomatiskan hanya membuktikan apa yang sempat kita bayangkan; mata manusia menangkap yang tidak terbayangkan. Mengotomatiskan seluruh Task 10 justru membuang satu-satunya sifat yang membuatnya berharga.

## Baseline

**187 tes DB / 14 berkas** dan **80 tes web / 16 berkas** lulus, `npm run build` sukses.

---

### Task 10a-1: Klaim negatif komisi dibuktikan di database

**Files:**
- Modify: `apps/bul/db/tests/komisi-pengurus.test.mjs`

**Kenapa ini lebih dulu.** Peringatan di layar impor mengatakan surat jalan pada rute tanpa tipe rute **tidak akan menghasilkan komisi**. Seluruh tes komisi yang ada menyiapkan `tipe_rute` dan `aturan_komisi` lebih dulu — semuanya menguji jalur bahagia. **Tidak satu pun membuktikan klaim negatifnya.** Kalau kelak `selesaikan_sj` berubah dan mulai menghasilkan komisi tanpa tipe rute, peringatan di layar akan berbohong dan tak ada yang tahu.

- [ ] **Step 1: Tulis tes yang gagal**

Tambahkan di akhir `describe` komisi yang sudah ada:

```javascript
  it('rute tanpa tipe rute tidak menghasilkan jurnal komisi sama sekali', async () => {
    // Inilah yang dijanjikan peringatan di layar impor. Tanpa tes ini, janji itu tidak
    // pernah diperiksa, dan kalau suatu saat ia menjadi bohong tak ada yang akan tahu.
    const owner = 'owner';
    const rute = unik('RUTE-TANPA-TIPE-');
    await sebagai(owner,
      'select public.simpan_rute(p_id => null, p_nama => $1, p_asal => $2, p_tujuan => $3)',
      [rute, 'Bogor', 'Jakarta']);

    // Prasyarat SJ lainnya dibuat sah, supaya satu-satunya yang berbeda dari jalur bahagia
    // adalah ketiadaan tipe rute.
    const dasar = await masterUji({ rute });   // sesuaikan dengan penolong yang sudah ada di berkas ini
    const sj = await buatDanSelesaikanSj(dasar);

    const komisi = await sql(
      `select count(*)::int as n from public.jurnal_baris jb
         join public.jurnal j on j.id = jb.jurnal_id
        where j.sumber_id = $1 and jb.akun_kode = (
          select akun_kode from public.pengaturan_posting where kunci = 'hutang_komisi_pengurus')`,
      [sj]);
    expect(komisi[0].n).toBe(0);

    // Dan buktikan SJ-nya memang terposting, supaya nol di atas berarti "komisi tidak ada",
    // bukan "tidak ada apa-apa yang terjadi".
    const semua = await sql(
      'select count(*)::int as n from public.jurnal where sumber_id = $1', [sj]);
    expect(semua[0].n).toBeGreaterThan(0);
  });
```

**Sesuaikan nama penolong** (`masterUji`, `buatDanSelesaikanSj`, kolom `sumber_id`) dengan yang benar-benar dipakai berkas itu dan skema `jurnal`. Jangan menambah baris `import` untuk simbol yang sudah diimpor.

**Assertion kedua wajib ada.** Tanpanya, tes ini lulus bahkan jika SJ-nya gagal dibuat dan tidak ada jurnal apa pun — tautologi yang sudah empat kali muncul di proyek ini.

- [ ] **Step 2: Jalankan**

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul && npm run test:db
```

Diharapkan: **187 + 1 = 188 tes / 14 berkas** lulus.

---

### Task 10a-2: Gerbang peringatan diuji sebagai komponen

**Files:**
- Create: `apps/bul/web/src/halaman/impor/ImporPage.test.jsx`

**Interfaces:**
- Mock utuh `../../lib/data.js`. Itu menghapus kebutuhan `QueryClientProvider` maupun pembungkus `App` antd, karena `useRpc` yang memakai `App.useApp()` ikut tergantikan.
- `unduhCsv` dari `../../lib/csv.js` menyentuh DOM untuk mengunduh; mock juga supaya tombol templat tidak berisik.

- [ ] **Step 1: Tulis tes yang gagal**

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Modul data di-mock UTUH. Dengan begitu useRpc yang memanggil App.useApp() ikut hilang,
// sehingga komponen bisa dirender tanpa QueryClientProvider dan tanpa pembungkus App antd.
vi.mock('../../lib/data.js', () => ({
  useDaftar: (tabel) => ({ data: DATA[tabel] ?? [] }),
  useRpc: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('../../lib/csv.js', async (asli) => ({ ...(await asli()), unduhCsv: vi.fn() }));

import ImporPage from './ImporPage.jsx';

// Master tiruan. `rute` sengaja punya satu rute lama TANPA tipe rute, supaya peringatan
// bisa dipicu tanpa menyentuh berkas yang diunggah.
const DATA = {
  kunci_periode: [], pelanggan: [{ nama: 'PT A' }], truk: [{ nopol: 'B 1 AA' }],
  supir: [{ nama: 'Budi' }], pengurus: [{ nama: 'Andi' }],
  material: [{ lini_kode: 'SJP', nama: 'Pasir' }], lini: [{ kode: 'SJP' }],
  akun: [{ kode: '1111' }], tipe_rute: [], aturan_komisi: [],
  rute: [{ nama: 'Bogor-Jakarta', tipe_rute_id: null }],
};

const csv = (...baris) => `\ufeff${baris.join('\r\n')}\r\n`;
const berkas = (nama, teks) => new File([teks], nama, { type: 'text/csv' });

// rute.csv tanpa kolom tipe_rute: memicu peringatan pertama tanpa galat bentuk apa pun.
const RUTE_TANPA_TIPE = berkas('rute.csv', csv(
  'nama;asal;tujuan;tipe_rute',
  'Bogor-Jakarta;Bogor;Jakarta;',
));

const masukkan = async (...f) => {
  const input = document.querySelector('input[type="file"]');
  await userEvent.upload(input, f);
};
const tombolImpor = () => screen.getByRole('button', { name: /Impor sekarang/i });

describe('gerbang peringatan di layar Impor', () => {
  beforeEach(() => { render(<ImporPage />); });

  it('peringatan muncul dan tombol Impor mati sampai diakui', async () => {
    await masukkan(RUTE_TANPA_TIPE);
    expect(await screen.findByText(/tidak punya tipe rute/i)).toBeInTheDocument();
    expect(tombolImpor()).toBeDisabled();
  });

  it('centang pengakuan menghidupkan tombol, dan membatalkannya mematikan lagi', async () => {
    await masukkan(RUTE_TANPA_TIPE);
    const centang = await screen.findByRole('checkbox');

    await userEvent.click(centang);
    expect(tombolImpor()).toBeEnabled();

    // Arah sebaliknya ikut diuji. Gerbang yang hanya bisa dibuka tetapi tidak bisa ditutup
    // lagi tetap lulus kalau hanya arah pertamanya yang diperiksa.
    await userEvent.click(centang);
    expect(tombolImpor()).toBeDisabled();
  });

  it('pengakuan tidak terbawa ketika berkas dipilih ulang', async () => {
    await masukkan(RUTE_TANPA_TIPE);
    await userEvent.click(await screen.findByRole('checkbox'));
    expect(tombolImpor()).toBeEnabled();

    // Kiriman berbeda, risiko berbeda. Pengakuan atas kiriman sebelumnya tidak boleh
    // diam-diam berlaku untuk yang baru.
    await masukkan(berkas('rute.csv', csv('nama;asal;tujuan;tipe_rute', 'Bogor-Depok;Bogor;Depok;')));
    expect(await screen.findByRole('checkbox')).not.toBeChecked();
    expect(tombolImpor()).toBeDisabled();
  });

  it('upah kosong pada SJ yang sudah selesai, dan SJ tanpa pengurus, masing-masing berbunyi', async () => {
    await masukkan(berkas('surat-jalan.csv', csv(
      'lini;nomor;tanggal;pelanggan;rute;rute_asal;rute_tujuan;material;nopol;supir;pengurus;qty_muat;uang_jalan;qty_bongkar;tanggal_selesai;upah',
      'SJP;SJ-1;2026-03-01;PT A;Bogor-Jakarta;Bogor;Jakarta;Pasir;B 1 AA;Budi;;10;400000;9,5;2026-03-03;',
    )));
    expect(await screen.findByText(/upahnya kosong/i)).toBeInTheDocument();
    expect(await screen.findByText(/tidak menyebut pengurus/i)).toBeInTheDocument();
  });
});
```

**Kalau sebuah assertion tidak bisa dibuat lulus, BERHENTI dan laporkan.** Jangan melonggarkan pemilih menjadi sesuatu yang selalu cocok, dan jangan mengganti `toBeDisabled()` dengan sekadar memastikan tombolnya ada. Tes yang lulus tanpa menguji apa pun lebih buruk daripada tes yang gagal, karena ia memadamkan alarm.

- [ ] **Step 2: Jalankan**

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul/web && npx vitest run
```

Diharapkan: **80 + 4 = 84 tes / 17 berkas** lulus.

```bash
cd C:/Project/.worktrees/bul/impor/apps/bul/web && npm run build
```

- [ ] **Step 3: Buktikan tesnya tidak tautologis**

Balikkan gerbangnya untuk sementara di `ImporPage.jsx` — buang `|| (peringatan.length > 0 && !akui)` dari `disabled` — lalu jalankan lagi. **Minimal dua tes harus GAGAL.** Kembalikan barisnya, jalankan lagi, pastikan hijau.

Laporkan tes mana yang gagal saat gerbang dibalik. Kalau tak ada yang gagal, tesnya tidak menguji gerbangnya, dan itu temuan yang harus dilaporkan, bukan ditambal diam-diam.

---

### Task 10b: Yang tetap milik user

Sesudah Codex selesai, sisa daftar periksa di `2026-09-25-impor-web.md` §Task 10 butir 1–6 dijalankan user di browser: login owner, impor kecil sungguhan, lalu periksa `/sj`, `/kas`, dan `/buku-besar`.

Butir 7–11 sudah tertutup tes dan tidak perlu diulang dengan tangan.
