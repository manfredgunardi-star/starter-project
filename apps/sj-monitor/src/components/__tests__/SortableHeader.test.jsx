// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import SortableHeader from '../SortableHeader.jsx';

describe('SortableHeader', () => {
  it('merender label dan memanggil onToggle dengan nama field saat diklik', async () => {
    const onToggle = vi.fn();
    render(
      <table><thead><tr>
        <SortableHeader field="nomorSJ" label="Nomor SJ" sortConfig={null} onToggle={onToggle} />
      </tr></thead></table>
    );
    await userEvent.click(screen.getByRole('button', { name: /nomor sj/i }));
    expect(onToggle).toHaveBeenCalledWith('nomorSJ');
  });

  it('set aria-sort="none" saat kolom ini bukan kolom aktif', () => {
    render(
      <table><thead><tr>
        <SortableHeader field="nomorSJ" label="Nomor SJ" sortConfig={{ field: 'rute', direction: 'asc' }} onToggle={() => {}} />
      </tr></thead></table>
    );
    expect(screen.getByRole('button', { name: /nomor sj/i })).toHaveAttribute('aria-sort', 'none');
  });

  it('set aria-sort="ascending" saat kolom ini aktif dengan direction asc', () => {
    render(
      <table><thead><tr>
        <SortableHeader field="nomorSJ" label="Nomor SJ" sortConfig={{ field: 'nomorSJ', direction: 'asc' }} onToggle={() => {}} />
      </tr></thead></table>
    );
    expect(screen.getByRole('button', { name: /nomor sj/i })).toHaveAttribute('aria-sort', 'ascending');
  });

  it('set aria-sort="descending" saat kolom ini aktif dengan direction desc', () => {
    render(
      <table><thead><tr>
        <SortableHeader field="nomorSJ" label="Nomor SJ" sortConfig={{ field: 'nomorSJ', direction: 'desc' }} onToggle={() => {}} />
      </tr></thead></table>
    );
    expect(screen.getByRole('button', { name: /nomor sj/i })).toHaveAttribute('aria-sort', 'descending');
  });
});
