import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';

vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => ({ peran: globalThis.__peran }) }));
vi.mock('../lib/data.js', () => ({
  useDaftar: () => ({ data: [{ id: '1', nama: 'Budi', telepon: '08', aktif: true }], isLoading: false }),
  useOpsi: () => ({ options: [], isLoading: false }),
  useRpc: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import TabelMaster from './TabelMaster.jsx';
import { KONFIG_MASTER } from '../halaman/master/konfigurasi.js';

function tampil(peran) {
  globalThis.__peran = peran;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <App><TabelMaster konfig={KONFIG_MASTER.supir} /></App>
    </QueryClientProvider>,
  );
}

describe('TabelMaster', () => {
  it('menampilkan data dan tombol tambah untuk peran berhak', () => {
    tampil('operasional');
    expect(screen.getByText('Budi')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tambah/i })).toBeInTheDocument();
  });
  it('menyembunyikan tombol tambah untuk viewer', () => {
    tampil('viewer');
    expect(screen.queryByRole('button', { name: /tambah/i })).toBeNull();
  });
});
