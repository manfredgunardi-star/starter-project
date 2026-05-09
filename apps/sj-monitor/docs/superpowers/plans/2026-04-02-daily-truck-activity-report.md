# Daily Truck Activity Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a daily truck activity report accessible to admin_sj and superadmin roles that shows all trucks and their Surat Jalan activities for a selected date, requires explanations for inactive trucks, and supports mobile-responsive viewing plus PDF export.

**Architecture:** 
New page component (`LaporanTrukPage.jsx`) displays truck activity data grouped by date, with role-based access control in the navigation menu. Data flows from the existing `suratJalanList` state, organized by truck plate number and driver. Trucks without any SJ on the selected date require a mandatory explanation field. PDF export uses the browser's native print-to-PDF via window.print() with CSS media queries for print optimization, avoiding external dependencies.

**Tech Stack:** React (hooks), Tailwind CSS, Lucide icons, Firestore (existing), browser native print API

---

## File Structure

### Create:
- `src/pages/LaporanTrukPage.jsx` — Main report page component, handles date filtering, truck grouping, explanation form, and PDF export
- `src/utils/truckReportHelpers.js` — Utility functions for grouping SJ by truck/driver and identifying inactive trucks

### Modify:
- `src/App.jsx` — Add navigation tab, role-based visibility, and page routing for the new Reports feature

---

## Task 1: Create Truck Report Utility Helpers

**Files:**
- Create: `src/utils/truckReportHelpers.js`

- [ ] **Step 1: Write failing test outline in comments**

Create a stub file that documents the expected function signatures and behavior. This helps the implementation stay focused.

```javascript
// src/utils/truckReportHelpers.js
// NOTE: These are utility functions that do not require tests in the traditional sense
// since they are pure functions. Test them manually by calling them in the component.

/**
 * Groups Surat Jalan data by truck plate number and date
 * Input: array of SJ objects, ISO date string
 * Output: { [nomorPolisi]: { driver: string, sjList: array } }
 */
export const groupSJByTruck = (suratJalanList, isoDate) => {
  // Implementation goes here
};

/**
 * Gets all unique truck plate numbers from SJ list
 * Input: array of SJ objects
 * Output: array of unique nomorPolisi strings
 */
export const getUniqueTrucks = (suratJalanList) => {
  // Implementation goes here
};

/**
 * Identifies trucks with no SJ on a given date
 * Input: all trucks, SJ list, ISO date string
 * Output: array of { nomorPolisi, namaSupir (or 'Unknown') } objects
 */
export const getInactiveTrucks = (allTrucks, suratJalanList, isoDate) => {
  // Implementation goes here
};

/**
 * Formats a date string for display (ISO to locale)
 * Input: ISO date string
 * Output: formatted string like "01/04/2026"
 */
export const formatReportDate = (isoDateStr) => {
  // Implementation goes here
};
```

- [ ] **Step 2: Implement groupSJByTruck function**

```javascript
/**
 * Groups Surat Jalan by truck plate number for a specific date
 * Filters to only include SJ with matching tanggalSJ
 */
export const groupSJByTruck = (suratJalanList, isoDate) => {
  const grouped = {};
  
  (Array.isArray(suratJalanList) ? suratJalanList : []).forEach(sj => {
    // Skip deleted/inactive records
    if (sj?.isActive === false || sj?.deletedAt) return;
    
    // Filter by date (match tanggalSJ)
    const sjDate = sj?.tanggalSJ ? sj.tanggalSJ.split('T')[0] : null;
    if (sjDate !== isoDate) return;
    
    const plate = sj?.nomorPolisi || 'Unknown';
    const driver = sj?.namaSupir || 'Unknown';
    
    if (!grouped[plate]) {
      grouped[plate] = {
        nomorPolisi: plate,
        namaSupir: driver,
        sjList: []
      };
    }
    
    grouped[plate].sjList.push(sj);
  });
  
  return grouped;
};
```

- [ ] **Step 3: Implement getUniqueTrucks function**

```javascript
/**
 * Returns all unique trucks that have ever appeared in SJ list
 */
export const getUniqueTrucks = (suratJalanList) => {
  const trucksMap = new Map(); // key: nomorPolisi
  
  (Array.isArray(suratJalanList) ? suratJalanList : []).forEach(sj => {
    if (sj?.isActive === false || sj?.deletedAt) return;
    
    const plate = sj?.nomorPolisi || 'Unknown';
    if (!trucksMap.has(plate)) {
      trucksMap.set(plate, {
        nomorPolisi: plate,
        namaSupir: sj?.namaSupir || 'Unknown'
      });
    }
  });
  
  return Array.from(trucksMap.values()).sort((a, b) =>
    a.nomorPolisi.localeCompare(b.nomorPolisi)
  );
};
```

- [ ] **Step 4: Implement getInactiveTrucks function**

```javascript
/**
 * Finds trucks with no SJ activity on a given date
 */
export const getInactiveTrucks = (allTrucks, suratJalanList, isoDate) => {
  const activeTrucksOnDate = groupSJByTruck(suratJalanList, isoDate);
  
  const inactive = (Array.isArray(allTrucks) ? allTrucks : [])
    .filter(truck => !activeTrucksOnDate[truck.nomorPolisi])
    .map(truck => ({
      nomorPolisi: truck.nomorPolisi,
      namaSupir: truck.namaSupir || 'Unknown'
    }));
  
  return inactive.sort((a, b) =>
    a.nomorPolisi.localeCompare(b.nomorPolisi)
  );
};
```

- [ ] **Step 5: Implement formatReportDate function**

```javascript
/**
 * Converts ISO date to formatted string for display
 */
export const formatReportDate = (isoDateStr) => {
  if (!isoDateStr) return '—';
  try {
    return new Date(isoDateStr).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch {
    return '—';
  }
};
```

- [ ] **Step 6: Commit**

```bash
git add src/utils/truckReportHelpers.js
git commit -m "utils: add truck report grouping and filtering helpers"
```

---

## Task 2: Create Truck Report Page Component

**Files:**
- Create: `src/pages/LaporanTrukPage.jsx`

- [ ] **Step 1: Write component skeleton with role check**

Create the base component with proper role validation and import statements.

```javascript
// src/pages/LaporanTrukPage.jsx
import { useState } from 'react';
import { FileText, Truck, AlertCircle, Download, Printer } from 'lucide-react';
import { formatReportDate, groupSJByTruck, getUniqueTrucks, getInactiveTrucks } from '../utils/truckReportHelpers.js';

const LaporanTrukPage = ({
  suratJalanList = [],
  truckList = [],
  currentUser = {}
}) => {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [explanations, setExplanations] = useState({});
  const [showValidationError, setShowValidationError] = useState(false);

  // Role-based access: only admin_sj and superadmin can access
  const effectiveRole = currentUser?.role === 'owner' ? 'reader' : currentUser?.role;
  const canViewReport = effectiveRole === 'superadmin' || effectiveRole === 'admin_sj';

  if (!canViewReport) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
        <p className="text-lg font-semibold text-gray-700">Akses Ditolak</p>
        <p className="text-sm text-gray-600 mt-2">
          Hanya Admin Surat Jalan atau Super Admin yang dapat mengakses laporan ini.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <Truck className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">Laporan Aktivitas Kendaraan</h1>
        </div>
        <p className="text-sm text-gray-600">
          Lihat seluruh aktivitas kendaraan dan supir untuk tanggal yang dipilih
        </p>
      </div>

      {/* Date Picker */}
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Pilih Tanggal
        </label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value);
            setExplanations({});
            setShowValidationError(false);
          }}
          className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <p className="text-xs text-gray-500 mt-2">
          Tanggal yang dipilih: <span className="font-semibold">{formatReportDate(selectedDate)}</span>
        </p>
      </div>

      {/* Report Content */}
      <div className="bg-white rounded-lg shadow-md p-4 sm:p-6">
        {/* Placeholder for report content - will be added in next steps */}
        <p className="text-gray-500">Report content loading...</p>
      </div>
    </div>
  );
};

export default LaporanTrukPage;
```

- [ ] **Step 2: Implement truck activity display (active trucks)**

Add the main report table showing trucks with SJ activity.

```javascript
// Inside LaporanTrukPage, add this before the return statement:

// Get data for selected date
const groupedTrucks = groupSJByTruck(suratJalanList, selectedDate);
const allTrucks = getUniqueTrucks(suratJalanList);
const inactiveTrucks = getInactiveTrucks(allTrucks, suratJalanList, selectedDate);

// Helper to check SJ status
const getSJStatus = (sj) => {
  return String(sj?.status || 'pending').toLowerCase();
};

const getStatusColor = (status) => {
  const colors = {
    'pending': 'bg-slate-100 text-slate-700',
    'dalam perjalanan': 'bg-orange-100 text-orange-700',
    'terkirim': 'bg-green-100 text-green-700',
    'gagal': 'bg-red-100 text-red-700',
  };
  return colors[status] || colors['pending'];
};
```

Then replace the placeholder report content with:

```javascript
{/* Active Trucks Section */}
{Object.keys(groupedTrucks).length > 0 ? (
  <div className="space-y-4">
    <div className="flex items-center gap-2 mb-4">
      <Truck className="w-5 h-5 text-blue-600" />
      <h2 className="text-lg font-bold text-gray-800">
        Kendaraan Aktif ({Object.keys(groupedTrucks).length})
      </h2>
    </div>
    
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-3 py-3 text-left font-semibold text-gray-700">No. Polisi</th>
            <th className="px-3 py-3 text-left font-semibold text-gray-700">Nama Supir</th>
            <th className="px-3 py-3 text-left font-semibold text-gray-700">Rute</th>
            <th className="px-3 py-3 text-left font-semibold text-gray-700">Material</th>
            <th className="px-3 py-3 text-left font-semibold text-gray-700">Status</th>
            <th className="px-3 py-3 text-right font-semibold text-gray-700">Qty</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {Object.entries(groupedTrucks).map(([plate, truckData]) =>
            truckData.sjList.map((sj, idx) => (
              <tr key={sj.id} className="hover:bg-gray-50">
                {idx === 0 && (
                  <>
                    <td rowSpan={truckData.sjList.length} className="px-3 py-3 font-bold text-blue-600">
                      {plate}
                    </td>
                    <td rowSpan={truckData.sjList.length} className="px-3 py-3 text-gray-900">
                      {truckData.namaSupir}
                    </td>
                  </>
                )}
                <td className="px-3 py-3 text-gray-900">{sj.rute || '—'}</td>
                <td className="px-3 py-3 text-gray-900">{sj.material || '—'}</td>
                <td className="px-3 py-3">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${getStatusColor(getSJStatus(sj))}`}>
                    {getSJStatus(sj)}
                  </span>
                </td>
                <td className="px-3 py-3 text-right text-gray-900 font-semibold">
                  {sj.qtyBongkar || 0} {sj.satuan || ''}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
) : (
  <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded">
    <p className="text-sm text-amber-800">
      Tidak ada aktivitas kendaraan pada tanggal ini.
    </p>
  </div>
)}
```

- [ ] **Step 3: Implement inactive trucks section with explanation form**

Add explanation handling for trucks without activity.

```javascript
// Add this JSX after the active trucks section, still inside the report card:

{/* Inactive Trucks Section */}
{inactiveTrucks.length > 0 && (
  <div className="mt-8 pt-8 border-t border-gray-200">
    <div className="flex items-center gap-2 mb-4">
      <AlertCircle className="w-5 h-5 text-amber-600" />
      <h2 className="text-lg font-bold text-gray-800">
        Kendaraan Tidak Aktif ({inactiveTrucks.length})
      </h2>
    </div>
    
    <p className="text-sm text-gray-600 mb-4">
      Kendaraan berikut tidak memiliki Surat Jalan pada tanggal ini. Anda harus memberikan penjelasan untuk setiap kendaraan.
    </p>

    <div className="space-y-4">
      {inactiveTrucks.map((truck) => (
        <div key={truck.nomorPolisi} className="bg-amber-50 p-4 rounded-lg border border-amber-200">
          <div className="flex items-center gap-3 mb-3">
            <Truck className="w-5 h-5 text-amber-600" />
            <div>
              <p className="font-semibold text-gray-800">{truck.nomorPolisi}</p>
              <p className="text-sm text-gray-600">{truck.namaSupir}</p>
            </div>
          </div>
          
          <textarea
            value={explanations[truck.nomorPolisi] || ''}
            onChange={(e) => setExplanations({
              ...explanations,
              [truck.nomorPolisi]: e.target.value
            })}
            placeholder="Tulis penjelasan mengapa kendaraan ini tidak aktif (misal: sedang perbaikan, hari libur, dll)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows="2"
          />
          
          {showValidationError && !explanations[truck.nomorPolisi]?.trim() && (
            <p className="text-xs text-red-600 mt-1">Penjelasan wajib diisi</p>
          )}
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Add PDF export and print buttons**

Add export functionality to the header section.

```javascript
// Add this helper function before the return statement:

const handleValidateAndPrepare = () => {
  if (inactiveTrucks.length > 0) {
    const allFilled = inactiveTrucks.every(truck =>
      explanations[truck.nomorPolisi]?.trim()
    );
    if (!allFilled) {
      setShowValidationError(true);
      return false;
    }
  }
  setShowValidationError(false);
  return true;
};

const handlePrintToPDF = () => {
  if (!handleValidateAndPrepare()) return;
  
  // Add a small delay to ensure UI is ready
  setTimeout(() => {
    window.print();
  }, 100);
};

const handleDownloadAsFile = () => {
  if (!handleValidateAndPrepare()) return;
  
  // Create a temporary container with printable content
  const printWindow = window.open('', '_blank');
  const content = document.getElementById('reportContent');
  
  if (content && printWindow) {
    printWindow.document.write(content.outerHTML);
    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  }
};
```

Then add buttons to the header. Replace the paragraph in the header section with:

```javascript
<div className="flex items-center gap-3 mb-4">
  <Truck className="w-6 h-6 text-blue-600" />
  <h1 className="text-2xl font-bold text-gray-800">Laporan Aktivitas Kendaraan</h1>
</div>
<p className="text-sm text-gray-600 mb-4">
  Lihat seluruh aktivitas kendaraan dan supir untuk tanggal yang dipilih
</p>

<div className="flex flex-wrap gap-2">
  <button
    onClick={handlePrintToPDF}
    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition text-sm"
  >
    <Printer className="w-4 h-4" />
    Print / PDF
  </button>
  <button
    onClick={handleDownloadAsFile}
    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition text-sm"
  >
    <Download className="w-4 h-4" />
    Download
  </button>
</div>
```

- [ ] **Step 5: Wrap report content in printable container with styles**

Add ID to report content and print styles. Replace the entire report card div with:

```javascript
{/* Report Content */}
<div id="reportContent" className="bg-white rounded-lg shadow-md p-4 sm:p-6 print:shadow-none print:rounded-none print:p-0">
  {/* Active Trucks and Inactive Trucks sections go here */}
  {/* ... (copy the content from steps 2-3) ... */}
</div>

{/* CSS for printing - add as a style tag in return or use Tailwind's print utilities */}
<style>{`
  @media print {
    body {
      margin: 0;
      padding: 0;
    }
    #reportContent {
      page-break-after: auto;
    }
    table {
      page-break-inside: avoid;
    }
    tr {
      page-break-inside: avoid;
    }
    .no-print {
      display: none !important;
    }
    h1, h2 {
      page-break-after: avoid;
      page-break-inside: avoid;
    }
  }
`}</style>
```

- [ ] **Step 6: Complete component and test locally**

Ensure the component exports correctly and all state management works.

```javascript
// Final export at end of file:
export default LaporanTrukPage;
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/LaporanTrukPage.jsx
git commit -m "feat: create truck activity report page with PDF export"
```

---

## Task 3: Integrate Report Menu into App Navigation

**Files:**
- Modify: `src/App.jsx` (lines where tabs are defined and rendered)

- [ ] **Step 1: Import the new page component**

Find the imports section near line 17 and add:

```javascript
import LaporanTrukPage from './pages/LaporanTrukPage.jsx';
```

Insert this right after the existing `import LaporanKasPage from './pages/LaporanKasPage.jsx';` line.

- [ ] **Step 2: Add Reports tab to the tab configuration**

Find the tab labels object (around line 2011). It looks like:

```javascript
const tabLabels = {
  'laporan-kas': 'Laporan Kas',
  // ... other tabs
};
```

Add a new entry:

```javascript
const tabLabels = {
  'laporan-kas': 'Laporan Kas',
  'laporan-truk': 'Laporan Truk',  // ADD THIS LINE
  // ... other tabs
};
```

- [ ] **Step 3: Add Reports tab to navigation items**

Find the navigation tabs array (around line 2021). It contains items with `{ tab: 'xxx', icon: xxx, label: 'xxx', roles: [...] }`.

Add this new item after the 'laporan-kas' tab entry:

```javascript
{ tab: 'laporan-truk', icon: Truck,  label: 'Laporan Truk', roles: ['superadmin', 'admin_sj'] },
```

(Note: Truck icon is already imported from lucide-react)

- [ ] **Step 4: Add conditional rendering for the new page**

Find the large conditional block around line 2048 that handles tab rendering. It uses `activeTab === 'xxx' ?` patterns.

Add this before the final `: null` at the end of the ternary chain (around line 2143, before the invoicing tab or after laporan-kas):

```javascript
) : activeTab === 'laporan-truk' && (effectiveRole === 'superadmin' || effectiveRole === 'admin_sj') ? (
  <LaporanTrukPage
    suratJalanList={suratJalanList}
    truckList={truckList}
    currentUser={currentUser}
  />
```

Note: Make sure to maintain the ternary chain structure. This should be added as another condition in the existing chain.

- [ ] **Step 5: Verify tab switching works**

Check that the tab configuration is complete:
- Tab is defined in `tabLabels` ✓
- Tab is in navigation items array with correct roles ✓
- Tab is handled in the rendering conditional ✓
- Props are passed correctly to the component ✓

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Reports menu with truck activity report tab"
```

---

## Task 4: Add Mobile Responsiveness and Print Styles

**Files:**
- Modify: `src/pages/LaporanTrukPage.jsx`

- [ ] **Step 1: Improve table responsiveness for mobile**

In the table section, wrap it with responsive styling. Replace the `<div className="overflow-x-auto">` with:

```javascript
<div className="overflow-x-auto">
  <table className="w-full text-xs sm:text-sm">
    {/* thead and tbody remain the same, but adjust column visibility on mobile */}
```

Add this Tailwind class to columns that can be hidden on very small screens:

- No. Polisi: always show
- Nama Supir: always show
- Rute: `hidden sm:table-cell` on very small screens (optional, depends on UX)
- Material: always show
- Status: always show
- Qty: always show

Keep table compact on mobile by reducing padding: `px-2 py-2 sm:px-4 sm:py-3`

- [ ] **Step 2: Improve inactive trucks card layout for mobile**

Make sure the truck info and textarea stack nicely:

```javascript
<div className="bg-amber-50 p-3 sm:p-4 rounded-lg border border-amber-200">
  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mb-3">
    <Truck className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
    <div className="flex-1">
      <p className="font-semibold text-sm sm:text-base text-gray-800">{truck.nomorPolisi}</p>
      <p className="text-xs sm:text-sm text-gray-600">{truck.namaSupir}</p>
    </div>
  </div>
  
  <textarea
    // ... existing textarea props
    className="w-full px-2 sm:px-3 py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    rows="2"
  />
</div>
```

- [ ] **Step 3: Improve button layout on mobile**

Replace the button container to stack on mobile:

```javascript
<div className="flex flex-col sm:flex-row flex-wrap gap-2">
  <button
    onClick={handlePrintToPDF}
    className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-4 py-2 rounded-lg transition text-xs sm:text-sm w-full sm:w-auto"
  >
    <Printer className="w-4 h-4" />
    <span>Print / PDF</span>
  </button>
  <button
    onClick={handleDownloadAsFile}
    className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-3 sm:px-4 py-2 rounded-lg transition text-xs sm:text-sm w-full sm:w-auto"
  >
    <Download className="w-4 h-4" />
    <span>Download</span>
  </button>
</div>
```

- [ ] **Step 4: Add print-specific CSS for better PDF output**

Update the print styles section to include page breaks and font sizing:

```javascript
<style>{`
  @media print {
    body {
      margin: 0;
      padding: 0;
      font-size: 12px;
    }
    #reportContent {
      page-break-after: auto;
      background: white;
    }
    .no-print,
    .print\\:hidden {
      display: none !important;
    }
    table {
      page-break-inside: avoid;
      width: 100%;
      border-collapse: collapse;
    }
    tr {
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 6px;
      text-align: left;
    }
    th {
      background-color: #f3f4f6;
      font-weight: bold;
    }
    h1, h2 {
      page-break-after: avoid;
      page-break-inside: avoid;
      margin: 10px 0 5px 0;
    }
    .bg-amber-50 {
      border: 1px solid #ddd;
      padding: 6px;
      margin-bottom: 8px;
    }
    textarea {
      display: block;
      width: 100%;
      margin-top: 4px;
    }
  }
`}</style>
```

- [ ] **Step 5: Test print output**

Open the report, fill in explanation if needed, and click "Print / PDF". Verify:
- All content is visible in print preview
- Tables don't break awkwardly across pages
- Explanation text is readable
- No buttons or navigation elements appear in print

- [ ] **Step 6: Commit**

```bash
git add src/pages/LaporanTrukPage.jsx
git commit -m "style: improve mobile responsiveness and print styles for truck report"
```

---

## Task 5: Verify Role-Based Access and Security

**Files:**
- Review: `src/App.jsx` (tab visibility)
- Review: `src/pages/LaporanTrukPage.jsx` (access check)

- [ ] **Step 1: Verify role access in App.jsx**

Check that the navigation tab only appears for admin_sj and superadmin:

```javascript
{ tab: 'laporan-truk', icon: Truck, label: 'Laporan Truk', roles: ['superadmin', 'admin_sj'] },
```

Verify this matches the conditional rendering check.

- [ ] **Step 2: Verify role access in LaporanTrukPage.jsx**

Confirm the component checks role before showing content:

```javascript
const canViewReport = effectiveRole === 'superadmin' || effectiveRole === 'admin_sj';

if (!canViewReport) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 text-center">
      {/* Access Denied message */}
    </div>
  );
}
```

- [ ] **Step 3: Test with different roles**

Manually test (or note for QA):
- Login as superadmin → should see Reports menu and access report ✓
- Login as admin_sj → should see Reports menu and access report ✓
- Login as admin_keuangan → should NOT see Reports menu or access report ✓
- Login as reader → should NOT see Reports menu or access report ✓

- [ ] **Step 4: Commit (if changes needed)**

If any fixes were made during verification:

```bash
git add src/App.jsx src/pages/LaporanTrukPage.jsx
git commit -m "security: verify role-based access for truck report"
```

Otherwise, no commit needed for this verification task.

---

## Task 6: Final Integration Test and Documentation

**Files:**
- Review: all modified/created files

- [ ] **Step 1: Run dev server and test basic flow**

```bash
npm run dev
```

Load the app and:
- Navigate to Reports > Laporan Truk ✓
- Select a date with truck activity ✓
- Verify active trucks display with correct data ✓
- Select a date with no activity or with inactive trucks ✓
- Fill in explanations for inactive trucks ✓
- Click Print/PDF button ✓

- [ ] **Step 2: Test print output in browser**

When Print button is clicked:
- Browser print dialog opens ✓
- Preview shows formatted report ✓
- "Save as PDF" option is available ✓
- All text and tables are readable ✓

- [ ] **Step 3: Test date filtering**

- Change date input → data should update immediately ✓
- Select past date with SJ → should show trucks from that day ✓
- Select future date with no SJ → should show all trucks as inactive ✓

- [ ] **Step 4: Test explanation validation**

With inactive trucks present:
- Try clicking Print without filling explanations → validation error shows ✓
- Fill in one explanation, leave others blank → error for blank ones ✓
- Fill all explanations → Print proceeds ✓

- [ ] **Step 5: Verify data accuracy**

Check that displayed data matches the suratJalanList state:
- Truck plate numbers match nomorPolisi ✓
- Driver names match namaSupir ✓
- Routes, materials, statuses are correct ✓
- Quantities match qtyBongkar and satuan ✓

- [ ] **Step 6: Final commit summary**

All tasks complete. Verify all files are committed:

```bash
git log --oneline | head -10
```

Should show commits for:
1. truckReportHelpers.js creation
2. LaporanTrukPage.jsx creation
3. App.jsx integration
4. Mobile responsiveness update
5. (Optional security verification commit)

---

## Testing Checklist

Before claiming completion, verify:

- [ ] All files created and committed
- [ ] Navigation menu shows "Laporan Truk" for admin_sj and superadmin
- [ ] Page displays with correct role check
- [ ] Trucks with SJ display in table with all data visible
- [ ] Trucks without SJ show in inactive section
- [ ] Explanation fields are mandatory (validation works)
- [ ] Print button opens print dialog with formatted content
- [ ] Report is readable on both mobile (responsive) and desktop
- [ ] No console errors
- [ ] Data matches source suratJalanList
- [ ] Date filter works correctly
- [ ] Role-based access is enforced

---

## Summary

This plan implements a complete daily truck activity report feature with:
- **Role-based access:** admin_sj and superadmin only
- **Data organization:** Trucks grouped by plate number with all SJ on selected date
- **Mandatory explanations:** Required for inactive trucks
- **Mobile responsive:** Works on phones and desktops
- **PDF export:** Browser native print-to-PDF, no external libraries
- **Existing architecture:** Uses current state management and styling patterns
