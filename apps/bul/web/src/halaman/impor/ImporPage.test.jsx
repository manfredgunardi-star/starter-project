import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('../../lib/data.js', () => ({
  useDaftar: (tabel) => globalThis.__daftar(tabel),
  useRpc: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import ImporPage from './ImporPage.jsx';

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
