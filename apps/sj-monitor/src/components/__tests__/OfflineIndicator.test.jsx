// @vitest-environment jsdom
import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import OfflineIndicator from '../OfflineIndicator.jsx';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OfflineIndicator', () => {
  it('tidak merender apapun saat online', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<OfflineIndicator />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('merender banner offline saat navigator.onLine false', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineIndicator />);
    const banner = screen.getByRole('alert');
    expect(banner).toBeTruthy();
    expect(banner.textContent).toMatch(/offline/i);
  });

  it('banner muncul saat event "offline" diterima', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(<OfflineIndicator />);
    expect(screen.queryByRole('alert')).toBeNull();

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('banner hilang saat event "online" diterima', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineIndicator />);
    expect(screen.getByRole('alert')).toBeTruthy();

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('banner memuat teks info sync', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineIndicator />);
    expect(screen.getByText(/sync/i)).toBeTruthy();
  });
});
