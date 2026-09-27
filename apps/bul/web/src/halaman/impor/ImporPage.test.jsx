import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { BERKAS } from './skema.js';

vi.mock('../../lib/data.js', () => ({
  useDaftar: (tabel) => globalThis.__daftar(tabel),
  useRpc: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('../../lib/csv.js', async (impor) => ({ ...(await impor()), unduhCsv: vi.fn() }));

import ImporPage from './ImporPage.jsx';
import { unduhCsv } from '../../lib/csv.js';

function tampil() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <App><ImporPage /></App>
    </QueryClientProvider>,
  );
}

describe('ImporPage: kunci pemilihan berkas selagi master belum termuat', () => {
  it('tombol nonaktif kalau salah satu query master masih isLoading', () => {
    globalThis.__daftar = (tabel) => (tabel === 'pelanggan' ? { data: undefined, isLoading: true } : { data: [], isLoading: false });
    tampil();
    expect(screen.getByRole('button', { name: /memuat master data/i })).toBeDisabled();
  });
  it('tombol aktif begitu semua query master selesai', () => {
    globalThis.__daftar = () => ({ data: [], isLoading: false });
    tampil();
    expect(screen.getByRole('button', { name: /pilih berkas csv/i })).toBeEnabled();
  });
});

describe('ImporPage: unduh templat diberi jeda antar berkas', () => {
  it('tidak menembak sebelas unduhan dalam tick yang sama — Chrome pernah diam-diam menjatuhkan salah satunya', () => {
    globalThis.__daftar = () => ({ data: [], isLoading: false });
    vi.useFakeTimers();
    try {
      tampil();
      fireEvent.click(screen.getByRole('button', { name: /unduh templat/i }));
      expect(unduhCsv).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(unduhCsv).toHaveBeenCalledTimes(BERKAS.length);
      expect(unduhCsv).toHaveBeenCalledWith('kas.csv', expect.any(String));
    } finally {
      vi.useRealTimers();
    }
  });
});
