import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';
import TombolAksi from './TombolAksi.jsx';

describe('TombolAksi', () => {
  it('menolak klik kedua selama aksi berjalan', async () => {
    let selesai;
    const aksi = vi.fn(() => new Promise((r) => { selesai = r; }));
    render(<App><TombolAksi onClick={aksi}>Simpan</TombolAksi></App>);
    const tombol = screen.getByRole('button', { name: /simpan/i });
    await userEvent.click(tombol);
    await userEvent.click(tombol);
    expect(aksi).toHaveBeenCalledTimes(1);
    selesai();
  });
});
