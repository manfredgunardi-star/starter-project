import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// antd memakai matchMedia
if (!window.matchMedia) {
  window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
}

// jsdom tidak punya ResizeObserver; antd 6 memakainya lewat @rc-component/resize-observer saat merender Table.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Vitest berjalan tanpa globals, sehingga auto-cleanup Testing Library tidak terpasang.
// Tanpa baris ini DOM tes sebelumnya bocor ke tes berikutnya.
afterEach(cleanup);
