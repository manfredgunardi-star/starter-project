# Search + Sort (Phase 1) & Hide 3 Menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two reusable hooks (`useSearchFilter`, `useSortableData`) and two reusable UI
components (`SearchInput`, `SortableHeader`) for sj-monitor, wire them into the Invoice
"Belum Terinvoice" table as the reference integration, and hide the UM/Laporan Truk/Gaji menu
entries from navigation.

**Architecture:** Client-side only — all 6 target menus already load their full dataset via
`onSnapshot` (bounded by a date-range Firestore query), so search/sort need no new queries. Two
generic hooks (`useMemo`-backed) are shared across every menu instead of duplicating filter/sort
logic per page. Two small presentational components (`SearchInput`, `SortableHeader`) give a
consistent UI. Menu hiding is a one-array edit (`DOCK_ITEMS`) with zero changes to the underlying
page components, listeners, or Uang Muka/Invoice calculations — fully reversible.

**Tech Stack:** React 18 (hooks, functional components), Vitest 4 + `@testing-library/react`
(pattern already used in `src/hooks/__tests__/useOnlineStatus.test.js` and
`src/components/__tests__/OfflineIndicator.test.jsx`), lucide-react icons (already a dependency),
Tailwind CSS utility classes (no new styling system).

**Scope of this plan (Phase 1):** Foundation hooks/components + hide-menu + one reference
integration (Invoice → "Belum Terinvoice" table). **Out of scope, follow-up plan needed:**
applying the same hooks/components to Keuangan (`KeuanganManagement`), Laporan Kas
(`LaporanKasPage.jsx`), Master Data's 4 sub-tabs (`MasterDataPage.jsx`), the Surat Jalan card list
(`App.jsx`, needs a sort-dropdown variant since it's cards not a table), and the Invoice
"Sudah Terinvoice" card list (same dropdown-sort need). These were scoped out of Phase 1 because
each has a materially different data shape (confirmed by reading the actual files — Keuangan and
Laporan Kas are two separate components with different data models; Invoice itself has two
different list *types* in one page) and cramming all of them into one plan risked inaccurate,
placeholder-y tasks. Phase 1 proves the pattern end-to-end on the busiest menu; Phase 2 repeats it
elsewhere with much less design risk.

---

### Task 1: `useSearchFilter` hook

**Files:**
- Create: `apps/sj-monitor/src/hooks/useSearchFilter.js`
- Test: `apps/sj-monitor/src/hooks/__tests__/useSearchFilter.test.js`

- [ ] **Step 1: Write the failing test**

```js
// apps/sj-monitor/src/hooks/__tests__/useSearchFilter.test.js
// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSearchFilter } from '../useSearchFilter.js';

const items = [
  { id: 1, nomorSJ: 'SJ-001', rute: 'Jakarta-Bandung' },
  { id: 2, nomorSJ: 'SJ-002', rute: 'Jakarta-Surabaya' },
  { id: 3, nomorSJ: 'SJ-003', rute: 'Bandung-Semarang' },
];

describe('useSearchFilter', () => {
  it('mengembalikan semua item saat searchTerm kosong', () => {
    const { result } = renderHook(() => useSearchFilter(items, '', ['nomorSJ', 'rute']));
    expect(result.current).toHaveLength(3);
  });

  it('mencocokkan field yang diberikan, case-insensitive', () => {
    const { result } = renderHook(() => useSearchFilter(items, 'bandung', ['nomorSJ', 'rute']));
    expect(result.current.map((i) => i.id)).toEqual([1, 3]);
  });

  it('mencocokkan nomorSJ secara terpisah dari rute', () => {
    const { result } = renderHook(() => useSearchFilter(items, 'sj-002', ['nomorSJ', 'rute']));
    expect(result.current.map((i) => i.id)).toEqual([2]);
  });

  it('aman saat list null/undefined', () => {
    const { result } = renderHook(() => useSearchFilter(null, 'apa saja', ['nomorSJ']));
    expect(result.current).toEqual([]);
  });

  it('aman saat field yang dicari tidak ada di item', () => {
    const { result } = renderHook(() => useSearchFilter(items, 'test', ['fieldTidakAda']));
    expect(result.current).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/sj-monitor/`): `npm test -- src/hooks/__tests__/useSearchFilter.test.js`
Expected: FAIL — `Cannot find module '../useSearchFilter.js'` (or similar import error).

- [ ] **Step 3: Write minimal implementation**

```js
// apps/sj-monitor/src/hooks/useSearchFilter.js
import { useMemo } from 'react';

export function useSearchFilter(list, searchTerm, fields) {
  return useMemo(() => {
    const items = Array.isArray(list) ? list : [];
    const term = (searchTerm || '').trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) =>
      fields.some((field) => String(item?.[field] ?? '').toLowerCase().includes(term))
    );
  }, [list, searchTerm, fields]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/hooks/__tests__/useSearchFilter.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/sj-monitor/src/hooks/useSearchFilter.js apps/sj-monitor/src/hooks/__tests__/useSearchFilter.test.js
git commit -m "feat(sj-monitor): add useSearchFilter hook"
```

---

### Task 2: `useSortableData` hook

**Files:**
- Create: `apps/sj-monitor/src/hooks/useSortableData.js`
- Test: `apps/sj-monitor/src/hooks/__tests__/useSortableData.test.js`

- [ ] **Step 1: Write the failing test**

```js
// apps/sj-monitor/src/hooks/__tests__/useSortableData.test.js
// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSortableData } from '../useSortableData.js';

const items = [
  { id: 1, nomorSJ: 'SJ-003', qty: 5 },
  { id: 2, nomorSJ: 'SJ-001', qty: 20 },
  { id: 3, nomorSJ: 'SJ-002', qty: 10 },
];

describe('useSortableData', () => {
  it('mengembalikan list apa adanya saat belum ada sortConfig', () => {
    const { result } = renderHook(() => useSortableData(items));
    expect(result.current.sorted.map((i) => i.id)).toEqual([1, 2, 3]);
    expect(result.current.sortConfig).toBeNull();
  });

  it('mengurutkan ascending berdasarkan field string setelah toggleSort', () => {
    const { result } = renderHook(() => useSortableData(items));
    act(() => result.current.toggleSort('nomorSJ'));
    expect(result.current.sorted.map((i) => i.nomorSJ)).toEqual(['SJ-001', 'SJ-002', 'SJ-003']);
    expect(result.current.sortConfig).toEqual({ field: 'nomorSJ', direction: 'asc' });
  });

  it('toggle ke descending saat kolom yang sama diklik lagi', () => {
    const { result } = renderHook(() => useSortableData(items));
    act(() => result.current.toggleSort('nomorSJ'));
    act(() => result.current.toggleSort('nomorSJ'));
    expect(result.current.sorted.map((i) => i.nomorSJ)).toEqual(['SJ-003', 'SJ-002', 'SJ-001']);
    expect(result.current.sortConfig).toEqual({ field: 'nomorSJ', direction: 'desc' });
  });

  it('reset ke asc saat kolom berbeda diklik', () => {
    const { result } = renderHook(() => useSortableData(items));
    act(() => result.current.toggleSort('nomorSJ'));
    act(() => result.current.toggleSort('nomorSJ'));
    act(() => result.current.toggleSort('qty'));
    expect(result.current.sortConfig).toEqual({ field: 'qty', direction: 'asc' });
    expect(result.current.sorted.map((i) => i.qty)).toEqual([5, 10, 20]);
  });

  it('mengurutkan angka secara numerik, bukan leksikografis', () => {
    const numericItems = [{ id: 1, qty: 9 }, { id: 2, qty: 10 }, { id: 3, qty: 2 }];
    const { result } = renderHook(() => useSortableData(numericItems));
    act(() => result.current.toggleSort('qty'));
    expect(result.current.sorted.map((i) => i.qty)).toEqual([2, 9, 10]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/hooks/__tests__/useSortableData.test.js`
Expected: FAIL — `Cannot find module '../useSortableData.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
// apps/sj-monitor/src/hooks/useSortableData.js
import { useMemo, useState, useCallback } from 'react';

export function useSortableData(list, initialSort = null) {
  const [sortConfig, setSortConfig] = useState(initialSort);

  const toggleSort = useCallback((field) => {
    setSortConfig((current) => {
      if (!current || current.field !== field) {
        return { field, direction: 'asc' };
      }
      return { field, direction: current.direction === 'asc' ? 'desc' : 'asc' };
    });
  }, []);

  const sorted = useMemo(() => {
    const items = Array.isArray(list) ? [...list] : [];
    if (!sortConfig) return items;
    const { field, direction } = sortConfig;
    items.sort((a, b) => {
      const valA = a?.[field];
      const valB = b?.[field];
      if (valA == null && valB == null) return 0;
      if (valA == null) return direction === 'asc' ? -1 : 1;
      if (valB == null) return direction === 'asc' ? 1 : -1;
      if (typeof valA === 'number' && typeof valB === 'number') {
        return direction === 'asc' ? valA - valB : valB - valA;
      }
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return direction === 'asc' ? -1 : 1;
      if (strA > strB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    return items;
  }, [list, sortConfig]);

  return { sorted, sortConfig, toggleSort };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/hooks/__tests__/useSortableData.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/sj-monitor/src/hooks/useSortableData.js apps/sj-monitor/src/hooks/__tests__/useSortableData.test.js
git commit -m "feat(sj-monitor): add useSortableData hook"
```

---

### Task 3: `SearchInput` component

**Files:**
- Create: `apps/sj-monitor/src/components/SearchInput.jsx`
- Test: `apps/sj-monitor/src/components/__tests__/SearchInput.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/sj-monitor/src/components/__tests__/SearchInput.test.jsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/__tests__/SearchInput.test.jsx`
Expected: FAIL — `Cannot find module '../SearchInput.jsx'`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// apps/sj-monitor/src/components/SearchInput.jsx
import { Search, XCircle } from 'lucide-react';

export default function SearchInput({ value, onChange, placeholder = 'Cari...' }) {
  return (
    <div className="relative">
      <input
        type="text"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
      />
      <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Hapus pencarian"
          className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
        >
          <XCircle className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/__tests__/SearchInput.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/sj-monitor/src/components/SearchInput.jsx apps/sj-monitor/src/components/__tests__/SearchInput.test.jsx
git commit -m "feat(sj-monitor): add reusable SearchInput component"
```

---

### Task 4: `SortableHeader` component

**Files:**
- Create: `apps/sj-monitor/src/components/SortableHeader.jsx`
- Test: `apps/sj-monitor/src/components/__tests__/SortableHeader.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
// apps/sj-monitor/src/components/__tests__/SortableHeader.test.jsx
// @vitest-environment jsdom
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/__tests__/SortableHeader.test.jsx`
Expected: FAIL — `Cannot find module '../SortableHeader.jsx'`.

- [ ] **Step 3: Write minimal implementation**

```jsx
// apps/sj-monitor/src/components/SortableHeader.jsx
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export default function SortableHeader({ field, label, sortConfig, onToggle, align = 'left', className = '' }) {
  const isActive = sortConfig?.field === field;
  const Icon = isActive ? (sortConfig.direction === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  const alignClass = align === 'right' ? 'text-right justify-end' : 'text-left justify-start';

  return (
    <th className={`px-2 py-2 sm:px-6 sm:py-3 text-xs font-medium text-gray-500 uppercase ${alignClass} ${className}`}>
      <button
        type="button"
        onClick={() => onToggle(field)}
        aria-sort={isActive ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`inline-flex items-center gap-1 hover:text-gray-700 w-full ${alignClass}`}
      >
        <span>{label}</span>
        <Icon className="w-3.5 h-3.5 shrink-0" />
      </button>
    </th>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/__tests__/SortableHeader.test.jsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/sj-monitor/src/components/SortableHeader.jsx apps/sj-monitor/src/components/__tests__/SortableHeader.test.jsx
git commit -m "feat(sj-monitor): add reusable SortableHeader component"
```

---

### Task 5: Hide "UM", "Laporan Truk", "Gaji" from navigation

**Files:**
- Modify: `apps/sj-monitor/src/App.jsx:41` (imports)
- Modify: `apps/sj-monitor/src/App.jsx:1901-1912` (`DOCK_ITEMS`)

No test — this is a declarative array edit with no new branching logic. Verified by manual/E2E
check in Task 7 (nav no longer shows the 3 items, for every role).

- [ ] **Step 1: Remove the unused `Truck` icon import**

In `apps/sj-monitor/src/App.jsx:41`, change:

```js
import { AlertCircle, Package, Truck, FileText, DollarSign, Users, Settings, Database, LogOut, Plus, Edit, Trash2, Eye, CheckCircle, XCircle, Clock, Search, RefreshCw } from 'lucide-react';
```

to:

```js
import { AlertCircle, Package, FileText, DollarSign, Users, Settings, Database, LogOut, Plus, Edit, Trash2, Eye, CheckCircle, XCircle, Clock, Search, RefreshCw } from 'lucide-react';
```

- [ ] **Step 2: Remove the 3 entries from `DOCK_ITEMS`**

In `apps/sj-monitor/src/App.jsx:1901-1912`, change:

```js
  const DOCK_ITEMS = [
    { tab: 'surat-jalan', icon: Package,     label: 'SJ',       roles: ['superadmin','admin_sj','admin_keuangan','admin_invoice','reader'] },
    { tab: 'keuangan',    icon: DollarSign,  label: 'Keuangan', roles: ['superadmin','admin_keuangan','reader'] },
    { tab: 'laporan-kas', icon: FileText,    label: 'Laporan',  roles: ['superadmin','admin_keuangan','admin_invoice','admin_sj','reader'] },
    { tab: 'laporan-truk', icon: Truck,     label: 'Laporan Truk', roles: ['superadmin', 'admin_sj'] },
    { tab: 'payslip',     icon: DollarSign,  label: 'Gaji',     roles: ['superadmin', 'admin_keuangan', 'reader'] },
    { tab: 'invoicing',   icon: FileText,    label: 'Invoice',  roles: ['superadmin','admin_invoice','reader'] },
    { tab: 'uang-muka',   icon: DollarSign,  label: 'UM',       roles: ['superadmin','admin_invoice','reader'] },
    { tab: 'master-data', icon: Database,    label: 'Data',     roles: ['superadmin'] },
    { tab: 'users',       icon: Users,       label: 'Users',    roles: ['superadmin'] },
    { tab: 'settings',    icon: Settings,    label: 'Settings', roles: ['superadmin'] },
  ].filter(item => item.roles.includes(effectiveRole ?? ''));
```

to:

```js
  const DOCK_ITEMS = [
    { tab: 'surat-jalan', icon: Package,     label: 'SJ',       roles: ['superadmin','admin_sj','admin_keuangan','admin_invoice','reader'] },
    { tab: 'keuangan',    icon: DollarSign,  label: 'Keuangan', roles: ['superadmin','admin_keuangan','reader'] },
    { tab: 'laporan-kas', icon: FileText,    label: 'Laporan',  roles: ['superadmin','admin_keuangan','admin_invoice','admin_sj','reader'] },
    { tab: 'invoicing',   icon: FileText,    label: 'Invoice',  roles: ['superadmin','admin_invoice','reader'] },
    { tab: 'master-data', icon: Database,    label: 'Data',     roles: ['superadmin'] },
    { tab: 'users',       icon: Users,       label: 'Users',    roles: ['superadmin'] },
    { tab: 'settings',    icon: Settings,    label: 'Settings', roles: ['superadmin'] },
  ].filter(item => item.roles.includes(effectiveRole ?? ''));
```

**Do NOT touch:** the `activeTab === 'laporan-truk' | 'payslip' | 'uang-muka'` view-switch
branches (`App.jsx:2051-2079`), `LaporanTrukPage.jsx`, `PayslipReport.jsx`, `UangMukaPage.jsx`,
the `unsubUangMuka` listener, or `computeInvoiceTotals(..., uangMukaList)` at `App.jsx:543`. They
stay fully intact and reachable only in code, not via UI — this is what makes the change
reversible in one commit.

- [ ] **Step 3: Commit**

```bash
git add apps/sj-monitor/src/App.jsx
git commit -m "feat(sj-monitor): hide UM, Laporan Truk, Gaji from navigation"
```

---

### Task 6: Wire search + sort into Invoice "Belum Terinvoice" table

**Files:**
- Modify: `apps/sj-monitor/src/pages/InvoicePage.jsx`

This is the reference integration — no new hook/component logic, just wiring. No new unit test
file (page-level wiring is verified manually + smoke test in Task 7, consistent with this repo's
existing test scope: hooks/utils/services/small components, not full page components).

- [ ] **Step 1: Add the new imports**

In `apps/sj-monitor/src/pages/InvoicePage.jsx:1-7`, change:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, FileText, Package, Plus, XCircle } from 'lucide-react';
import { exportLabaKotorToExcel } from '../utils/excel.js';
import { isSJBelumInvoice, isSJTerinvoice } from '../utils/sjHelpers.js';
import Pagination, { PAGE_SIZE, clampPage } from '../components/Pagination.jsx';
import StatSummary from '../components/StatSummary.jsx';
```

to:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Clock, FileText, Package, Plus, XCircle } from 'lucide-react';
import { exportLabaKotorToExcel } from '../utils/excel.js';
import { isSJBelumInvoice, isSJTerinvoice } from '../utils/sjHelpers.js';
import Pagination, { PAGE_SIZE, clampPage } from '../components/Pagination.jsx';
import StatSummary from '../components/StatSummary.jsx';
import { useSearchFilter } from '../hooks/useSearchFilter.js';
import { useSortableData } from '../hooks/useSortableData.js';
import SearchInput from '../components/SearchInput.jsx';
import SortableHeader from '../components/SortableHeader.jsx';
```

- [ ] **Step 2: Add search + sort state, apply before pagination**

In `apps/sj-monitor/src/pages/InvoicePage.jsx:70-77`, change:

```jsx
  const filteredSJ = activeFilter === 'belum-terinvoice' ? sjBelumTerinvoice : sjTerinvoice;
  const [invPage, setInvPage] = useState(1);
  const [invoicePage, setInvoicePage] = useState(1);
  useEffect(() => { setInvPage(1); setInvoicePage(1); }, [activeFilter]);
  const safeInvPage = clampPage(invPage, filteredSJ.length);
  const safeInvoicePage = clampPage(invoicePage, invoiceList.length);
  const pagedSJ = filteredSJ.slice((safeInvPage - 1) * PAGE_SIZE, safeInvPage * PAGE_SIZE);
  const pagedInvoices = invoiceList.slice((safeInvoicePage - 1) * PAGE_SIZE, safeInvoicePage * PAGE_SIZE);
```

to:

```jsx
  const filteredSJ = activeFilter === 'belum-terinvoice' ? sjBelumTerinvoice : sjTerinvoice;
  const [searchSJ, setSearchSJ] = useState('');
  const searchedSJ = useSearchFilter(filteredSJ, searchSJ, ['nomorSJ', 'nomorPolisi', 'rute', 'material']);
  const { sorted: sortedSJ, sortConfig, toggleSort } = useSortableData(searchedSJ);
  const [invPage, setInvPage] = useState(1);
  const [invoicePage, setInvoicePage] = useState(1);
  useEffect(() => { setInvPage(1); setInvoicePage(1); }, [activeFilter, searchSJ]);
  const safeInvPage = clampPage(invPage, sortedSJ.length);
  const safeInvoicePage = clampPage(invoicePage, invoiceList.length);
  const pagedSJ = sortedSJ.slice((safeInvPage - 1) * PAGE_SIZE, safeInvPage * PAGE_SIZE);
  const pagedInvoices = invoiceList.slice((safeInvoicePage - 1) * PAGE_SIZE, safeInvoicePage * PAGE_SIZE);
```

- [ ] **Step 3: Add `SearchInput`, empty-search state, and `SortableHeader` columns to the table**

In `apps/sj-monitor/src/pages/InvoicePage.jsx:234-290`, change:

```jsx
      {activeFilter === 'belum-terinvoice' ? (
        <div className="bg-white rounded-lg shadow-md p-3 sm:p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-600" />
            Surat Jalan Terkirim - Belum Terinvoice
          </h3>
          {filteredSJ.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 mx-auto text-green-400 mb-4" />
              <p className="text-lg font-semibold text-gray-600 mb-2">Semua Surat Jalan Sudah Terinvoice! 🎉</p>
              <p className="text-sm text-gray-500">Tidak ada Surat Jalan yang perlu di-invoice</p>
            </div>
          ) : (
            <>
              <div className="mb-4 bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                <p className="text-sm text-blue-800">
                  <strong>📋 Info:</strong> Pilih surat jalan di bawah untuk membuat invoice. Klik tombol "Buat Invoice Baru" di atas untuk memulai.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Nomor SJ</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Tgl SJ</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Tgl Terkirim</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Nomor Polisi</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Rute</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-left text-xs font-medium text-gray-500 uppercase">Material</th>
                      <th className="px-2 py-2 sm:px-6 sm:py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty Bongkar</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pagedSJ.map(sj => (
                      <tr key={sj.id} className="hover:bg-orange-50 transition">
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium text-blue-600">{sj.nomorSJ}</td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                          {new Date(sj.tanggalSJ).toLocaleDateString('id-ID')}
                        </td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-green-700 font-semibold">
                          {sj.tglTerkirim ? new Date(sj.tglTerkirim).toLocaleDateString('id-ID') : '-'}
                        </td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">{sj.nomorPolisi}</td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">{sj.rute}</td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">{sj.material}</td>
                        <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900 text-right font-semibold">
                          {sj.qtyBongkar || 0} {sj.satuan}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination total={filteredSJ.length} page={safeInvPage} onChange={setInvPage} />
            </>
          )}
        </div>
      ) : (
```

to:

```jsx
      {activeFilter === 'belum-terinvoice' ? (
        <div className="bg-white rounded-lg shadow-md p-3 sm:p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-orange-600" />
            Surat Jalan Terkirim - Belum Terinvoice
          </h3>
          {filteredSJ.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 mx-auto text-green-400 mb-4" />
              <p className="text-lg font-semibold text-gray-600 mb-2">Semua Surat Jalan Sudah Terinvoice! 🎉</p>
              <p className="text-sm text-gray-500">Tidak ada Surat Jalan yang perlu di-invoice</p>
            </div>
          ) : (
            <>
              <div className="mb-4 bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                <p className="text-sm text-blue-800">
                  <strong>📋 Info:</strong> Pilih surat jalan di bawah untuk membuat invoice. Klik tombol "Buat Invoice Baru" di atas untuk memulai.
                </p>
              </div>
              <div className="mb-4">
                <SearchInput
                  value={searchSJ}
                  onChange={setSearchSJ}
                  placeholder="Cari nomor SJ, nomor polisi, rute, atau material..."
                />
              </div>
              {sortedSJ.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">Tidak ada Surat Jalan yang cocok dengan pencarian.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <SortableHeader field="nomorSJ" label="Nomor SJ" sortConfig={sortConfig} onToggle={toggleSort} />
                          <SortableHeader field="tanggalSJ" label="Tgl SJ" sortConfig={sortConfig} onToggle={toggleSort} />
                          <SortableHeader field="tglTerkirim" label="Tgl Terkirim" sortConfig={sortConfig} onToggle={toggleSort} />
                          <SortableHeader field="nomorPolisi" label="Nomor Polisi" sortConfig={sortConfig} onToggle={toggleSort} />
                          <SortableHeader field="rute" label="Rute" sortConfig={sortConfig} onToggle={toggleSort} />
                          <SortableHeader field="material" label="Material" sortConfig={sortConfig} onToggle={toggleSort} />
                          <SortableHeader field="qtyBongkar" label="Qty Bongkar" sortConfig={sortConfig} onToggle={toggleSort} align="right" />
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {pagedSJ.map(sj => (
                          <tr key={sj.id} className="hover:bg-orange-50 transition">
                            <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm font-medium text-blue-600">{sj.nomorSJ}</td>
                            <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                              {new Date(sj.tanggalSJ).toLocaleDateString('id-ID')}
                            </td>
                            <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-green-700 font-semibold">
                              {sj.tglTerkirim ? new Date(sj.tglTerkirim).toLocaleDateString('id-ID') : '-'}
                            </td>
                            <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">{sj.nomorPolisi}</td>
                            <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">{sj.rute}</td>
                            <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">{sj.material}</td>
                            <td className="px-2 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900 text-right font-semibold">
                              {sj.qtyBongkar || 0} {sj.satuan}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination total={sortedSJ.length} page={safeInvPage} onChange={setInvPage} />
                </>
              )}
            </>
          )}
        </div>
      ) : (
```

- [ ] **Step 4: Manual verification (dev server)**

Run: `npm run dev` in `apps/sj-monitor/`, log in, go to Invoice → "Belum Terinvoice" tab.
Expected:
- Search box filters rows live by nomor SJ / nomor polisi / rute / material.
- Clicking a column header sorts ascending (arrow up), clicking again sorts descending (arrow
  down), clicking a different column resets to ascending on the new column.
- Typing a search term that matches nothing shows "Tidak ada Surat Jalan yang cocok dengan
  pencarian." (not the "Semua Surat Jalan Sudah Terinvoice!" empty state — that one must only
  appear when there are zero un-invoiced SJ at all, unrelated to search).
- Pagination count updates to match the filtered+sorted result count.

- [ ] **Step 5: Commit**

```bash
git add apps/sj-monitor/src/pages/InvoicePage.jsx
git commit -m "feat(sj-monitor): add search and sort to Invoice Belum Terinvoice table"
```

---

### Task 7: Full validation + staging smoke test

**Files:** none (validation only)

- [ ] **Step 1: Run full test suite**

Run (from `apps/sj-monitor/`): `npm test`
Expected: all tests PASS, including the 4 new test files from Tasks 1–4 and pre-existing tests
(no regressions).

- [ ] **Step 2: Spot-check lint rules on the new files**

`npm run lint` only covers `src/utils/` and `src/services/` per this project's `package.json`, so
it won't touch the new hooks/components. Run the same rules manually to catch unused vars / hooks
rule violations before they reach review:

Run: `npx eslint src/hooks/useSearchFilter.js src/hooks/useSortableData.js src/components/SearchInput.jsx src/components/SortableHeader.jsx`
Expected: no errors (warnings for `react/prop-types` are acceptable — this repo does not use
PropTypes anywhere else either).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 4: Manual regression check — Invoice totals unaffected**

In the running dev server (or build preview), open an existing invoice that has Uang Muka
allocated and confirm `Total`, `Uang Muka`, and `Nett (setelah UM)` shown in the invoice card and
in "Export Excel" match exactly what they were before this change (Task 5 did not touch
`computeInvoiceTotals` or `uangMukaList`, so this should be a no-op check, but it is the single
highest-risk regression given the finance guardrail — worth 2 minutes to confirm directly rather
than assume).

- [ ] **Step 5: Manual regression check — hidden menus**

Log in as each role that used to see UM/Laporan Truk/Gaji (`superadmin`, `admin_sj`,
`admin_invoice`, `admin_keuangan`, `reader`) and confirm none of the 3 labels ("UM", "Laporan
Truk", "Gaji") appear in the bottom nav for any of them.

- [ ] **Step 6: Deploy to staging**

Run: `npm run smoketest`
Expected: build + deploy succeeds, prints `https://sj-monitor-staging.web.app`. Repeat Steps 4–5
against the staging URL.

- [ ] **Step 7: Commit any fixes found during validation, then stop**

If Steps 1–6 all pass with no fixes needed, there is nothing to commit here — the feature branch
is ready for `superpowers:requesting-code-review` and then a PR (opened for human review, **not**
merged automatically — see the design spec's Deploy & Ops section for why).

```bash
git status
```

Expected: clean (all prior task commits already made); if any fix was needed, commit it with a
message describing what regression it fixes.
