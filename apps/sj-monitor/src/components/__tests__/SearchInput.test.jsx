// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import SearchInput from '../SearchInput.jsx';

describe('SearchInput', () => {
  it('merender placeholder dan memanggil onChange saat mengetik', async () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} placeholder="Cari nomor SJ..." />);
    const input = screen.getByPlaceholderText('Cari nomor SJ...');
    await userEvent.type(input, 'a');
    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('tidak menampilkan tombol clear saat value kosong', () => {
    render(<SearchInput value="" onChange={() => {}} />);
    expect(screen.queryByLabelText('Hapus pencarian')).toBeNull();
  });

  it('menampilkan tombol clear dan memanggil onChange("") saat diklik', async () => {
    const onChange = vi.fn();
    render(<SearchInput value="SJ-001" onChange={onChange} />);
    const clearBtn = screen.getByLabelText('Hapus pencarian');
    await userEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith('');
  });
});
