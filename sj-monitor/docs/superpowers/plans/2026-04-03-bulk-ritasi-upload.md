# Bulk Ritasi Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Superadmin to bulk upload Ritasi values for all routes via Excel template download/upload workflow.

**Architecture:** Create a new modal/panel in Master Data section with download template and upload file functionality. Template exports all routes with current Ritasi values in Excel format. On upload, parse Excel, validate data, and batch update Firestore. Only accessible to Superadmin role.

**Tech Stack:** React, XLSX (already installed), Firestore batch updates, Tailwind CSS

---

## Phase 1: Helper Functions

### Task 1: Create Ritasi Template Helpers

**Files:**
- Create: `src/utils/ritasiTemplateHelpers.js`

- [ ] **Step 1: Create helper functions**

```javascript
// src/utils/ritasiTemplateHelpers.js

/**
 * Generate Excel template with all routes
 * Returns array of arrays suitable for XLSX
 */
export function generateRitasiTemplate(ruteList) {
  const headers = ['ID Rute', 'Nama Rute', 'Asal', 'Tujuan', 'Uang Jalan', 'Ritasi Saat Ini', 'Ritasi Baru'];
  const data = ruteList.map(rute => [
    rute.id,
    rute.nama,
    rute.asal,
    rute.tujuan,
    rute.uangJalan || 0,
    rute.ritasi || 0,
    rute.ritasi || 0, // Default to current value
  ]);
  
  return [headers, ...data];
}

/**
 * Validate uploaded template
 * Checks: required columns, data types, values are non-negative
 * Returns: { isValid: boolean, errors: string[] }
 */
export function validateRitasiTemplate(data) {
  const errors = [];
  
  if (!data || data.length < 2) {
    errors.push('File kosong atau tidak memiliki data');
    return { isValid: false, errors };
  }

  const headers = data[0];
  const expectedHeaders = ['ID Rute', 'Nama Rute', 'Asal', 'Tujuan', 'Uang Jalan', 'Ritasi Saat Ini', 'Ritasi Baru'];
  
  // Check headers
  if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) {
    errors.push('Header kolom tidak sesuai. Pastikan menggunakan template yang benar.');
    return { isValid: false, errors };
  }

  // Validate rows
  data.slice(1).forEach((row, index) => {
    const rowNumber = index + 2; // +2 because data includes header and is 0-indexed

    // Check ID Rute exists
    if (!row[0] || row[0].toString().trim() === '') {
      errors.push(`Baris ${rowNumber}: ID Rute tidak boleh kosong`);
    }

    // Check Ritasi Baru is a valid number
    const ritasiValue = row[6];
    if (ritasiValue === null || ritasiValue === undefined || ritasiValue === '') {
      errors.push(`Baris ${rowNumber}: Ritasi Baru tidak boleh kosong`);
    } else if (isNaN(ritasiValue)) {
      errors.push(`Baris ${rowNumber}: Ritasi Baru harus berupa angka`);
    } else if (Number(ritasiValue) < 0) {
      errors.push(`Baris ${rowNumber}: Ritasi Baru tidak boleh negatif`);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Parse template data into update object
 * Returns object: { [ruteId]: newRitasiValue }
 */
export function parseRitasiUpdates(data) {
  const updates = {};
  
  // Skip header row (index 0)
  data.slice(1).forEach(row => {
    const ruteId = row[0].toString().trim();
    const ritasiValue = parseInt(row[6]) || 0;
    
    if (ruteId) {
      updates[ruteId] = ritasiValue;
    }
  });

  return updates;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/ritasiTemplateHelpers.js
git commit -m "feat: add ritasi template helper functions"
```

---

## Phase 2: Firestore Service

### Task 2: Create Ritasi Bulk Update Service

**Files:**
- Create: `src/services/ritasiBulkService.js`

- [ ] **Step 1: Create Firestore bulk update function**

```javascript
// src/services/ritasiBulkService.js

import { db } from "../firebase-config";
import { collection, getDocs, writeBatch, doc } from "firebase/firestore";

/**
 * Fetch all routes from Firestore
 */
export async function fetchAllRutes() {
  const snapshot = await getDocs(collection(db, "rute"));
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * Bulk update Ritasi values in Firestore
 * updates = { [ruteId]: newRitasiValue }
 * Returns: { success: boolean, message: string, updated: number }
 */
export async function bulkUpdateRitasi(updates) {
  const batch = writeBatch(db);
  let updateCount = 0;

  try {
    Object.entries(updates).forEach(([ruteId, ritasiValue]) => {
      const ruteRef = doc(db, "rute", ruteId);
      batch.update(ruteRef, {
        ritasi: ritasiValue,
      });
      updateCount++;
    });

    await batch.commit();

    return {
      success: true,
      message: `Berhasil update ${updateCount} rute dengan nilai Ritasi baru`,
      updated: updateCount,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error saat update: ${error.message}`,
      updated: 0,
    };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/services/ritasiBulkService.js
git commit -m "feat: add ritasi bulk update Firestore service"
```

---

## Phase 3: UI Component

### Task 3: Create Ritasi Bulk Upload Component

**Files:**
- Create: `src/components/RitasiBulkUpload.jsx`

- [ ] **Step 1: Create component**

```javascript
// src/components/RitasiBulkUpload.jsx

import React, { useState } from "react";
import * as XLSX from "xlsx";
import { generateRitasiTemplate, validateRitasiTemplate, parseRitasiUpdates } from "../utils/ritasiTemplateHelpers";
import { fetchAllRutes, bulkUpdateRitasi } from "../services/ritasiBulkService";

export default function RitasiBulkUpload({ ruteList = [], onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState(null); // 'success' or 'error'
  const [step, setStep] = useState("menu"); // menu, downloading, uploading, processing

  const handleDownloadTemplate = async () => {
    try {
      setLoading(true);
      setStep("downloading");
      setMessage("Mengunduh template...");

      // Fetch latest rute data
      const routes = await fetchAllRutes();
      
      // Generate template data
      const templateData = generateRitasiTemplate(routes);

      // Create workbook
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(templateData);
      
      // Set column widths
      worksheet["!cols"] = [
        { wch: 12 }, // ID Rute
        { wch: 25 }, // Nama Rute
        { wch: 15 }, // Asal
        { wch: 15 }, // Tujuan
        { wch: 12 }, // Uang Jalan
        { wch: 12 }, // Ritasi Saat Ini
        { wch: 12 }, // Ritasi Baru
      ];

      // Style header row
      const headerStyle = {
        fill: { fgColor: { rgb: "FFCCCC00" } }, // Yellow background
        font: { bold: true },
        alignment: { horizontal: "center", vertical: "center" },
      };

      for (let i = 0; i < 7; i++) {
        const cellRef = XLSX.utils.encode_col(i) + "1";
        if (worksheet[cellRef]) {
          worksheet[cellRef].s = headerStyle;
        }
      }

      XLSX.utils.book_append_sheet(workbook, worksheet, "Ritasi");

      // Download file
      const filename = `Template_Ritasi_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(workbook, filename);

      setMessage("✓ Template berhasil diunduh");
      setMessageType("success");
      setStep("menu");
      setTimeout(() => setMessage(null), 2000);
    } catch (error) {
      setMessage(`✗ Error: ${error.message}`);
      setMessageType("error");
      setStep("menu");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setLoading(true);
      setStep("uploading");
      setMessage("Membaca file...");

      // Read Excel file
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target.result;
          const workbook = XLSX.read(data, { type: "binary" });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 0, defval: "" });

          // Convert to array format (headers + rows)
          const headers = Object.keys(jsonData[0] || {});
          const arrayData = [
            headers,
            ...jsonData.map(row => headers.map(h => row[h] || "")),
          ];

          // Validate template
          setMessage("Validasi data...");
          const validation = validateRitasiTemplate(arrayData);

          if (!validation.isValid) {
            const errorList = validation.errors.join("\n");
            setMessage(`✗ Error validasi:\n${errorList}`);
            setMessageType("error");
            setStep("menu");
            setLoading(false);
            return;
          }

          // Parse updates
          const updates = parseRitasiUpdates(arrayData);
          const updateCount = Object.keys(updates).length;

          if (updateCount === 0) {
            setMessage("✗ Tidak ada data untuk di-update");
            setMessageType("error");
            setStep("menu");
            setLoading(false);
            return;
          }

          // Confirm before update
          setStep("processing");
          setMessage(`Siap update ${updateCount} rute. Memproses...`);

          const result = await bulkUpdateRitasi(updates);

          if (result.success) {
            setMessage(`✓ ${result.message}`);
            setMessageType("success");
            if (onSuccess) onSuccess();
          } else {
            setMessage(`✗ ${result.message}`);
            setMessageType("error");
          }

          setStep("menu");
          setTimeout(() => setMessage(null), 3000);
        } catch (error) {
          setMessage(`✗ Error: ${error.message}`);
          setMessageType("error");
          setStep("menu");
        } finally {
          setLoading(false);
        }
      };

      reader.readAsBinaryString(file);
    } catch (error) {
      setMessage(`✗ Error: ${error.message}`);
      setMessageType("error");
      setStep("menu");
      setLoading(false);
    }

    // Reset file input
    event.target.value = "";
  };

  return (
    <div className="bg-white p-6 rounded border border-gray-300">
      <h2 className="text-xl font-bold mb-4">Bulk Upload Ritasi</h2>

      {message && (
        <div
          className={`p-4 rounded mb-4 ${
            messageType === "success"
              ? "bg-green-50 text-green-700 border border-green-200"
              : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          <pre className="whitespace-pre-wrap font-mono text-sm">{message}</pre>
        </div>
      )}

      <div className="space-y-3">
        <div className="bg-blue-50 border border-blue-200 p-4 rounded">
          <p className="text-sm text-gray-700 mb-3">
            <strong>Cara penggunaan:</strong>
          </p>
          <ol className="text-sm text-gray-700 space-y-1 ml-4 list-decimal">
            <li>Klik "Download Template" untuk mendapatkan file template</li>
            <li>Buka file dan isi kolom "Ritasi Baru" untuk setiap rute</li>
            <li>Simpan file dan klik "Upload File" untuk update semua rute</li>
          </ol>
        </div>

        <button
          onClick={handleDownloadTemplate}
          disabled={loading}
          className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
        >
          {loading && step === "downloading" ? "Mengunduh..." : "📥 Download Template"}
        </button>

        <div className="relative">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            disabled={loading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
          <button
            disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
          >
            {loading && step === "uploading" ? "Membaca file..." : loading && step === "processing" ? "Memproses..." : "📤 Upload File"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RitasiBulkUpload.jsx
git commit -m "feat: create RitasiBulkUpload component"
```

---

## Phase 4: Integration into Master Data

### Task 4: Add Bulk Upload to Master Data Section

**Files:**
- Modify: `src/App.jsx` (find Master Data / Rute section)

- [ ] **Step 1: Import the component**

At top of App.jsx, add:
```javascript
import RitasiBulkUpload from "./components/RitasiBulkUpload";
```

- [ ] **Step 2: Add state for bulk upload modal**

In App.jsx, find the state management section and add:
```javascript
const [showRitasiBulkUpload, setShowRitasiBulkUpload] = useState(false);
```

- [ ] **Step 3: Add button to show bulk upload modal**

In the Master Data Rute section (where you see the Rute list), add this button before or after the "Tambah Rute" button:

```javascript
{currentUser?.role?.toLowerCase() === 'superadmin' && (
  <button
    onClick={() => setShowRitasiBulkUpload(true)}
    className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
  >
    📊 Bulk Upload Ritasi
  </button>
)}
```

- [ ] **Step 4: Add modal/panel to display component**

Find where other modals are rendered in App.jsx and add:

```javascript
{showRitasiBulkUpload && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
      <div className="p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Bulk Upload Ritasi</h2>
          <button
            onClick={() => setShowRitasiBulkUpload(false)}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>
        <RitasiBulkUpload
          ruteList={masterRute}
          onSuccess={() => {
            setShowRitasiBulkUpload(false);
            // Trigger refresh of rute list
            loadRuteData();
          }}
        />
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Add loadRuteData function (if not exists)**

If the function doesn't exist, add:
```javascript
const loadRuteData = async () => {
  try {
    const snapshot = await getDocs(collection(db, "rute"));
    const routes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    setMasterRute(routes);
  } catch (error) {
    console.error("Error loading rute data:", error);
  }
};
```

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: integrate RitasiBulkUpload into Master Data section"
```

---

## Phase 5: Testing & Verification

### Task 5: Manual Testing

**Files:**
- Test: Functionality verification

- [ ] **Step 1: Build and test**

```bash
npm run build
npm run dev
```

Verify no build errors.

- [ ] **Step 2: Test as Superadmin**

1. Log in as Superadmin
2. Go to Master Data → Rute section
3. Look for "📊 Bulk Upload Ritasi" button - should be visible
4. Click button - modal should appear with download and upload options
5. Click "Download Template":
   - File should download as Excel (.xlsx)
   - File should contain all routes with ID, Nama, Asal, Tujuan, Uang Jalan, Ritasi Saat Ini, Ritasi Baru columns
   - Header should be highlighted in yellow
   - Column widths should be appropriate

- [ ] **Step 3: Test upload functionality**

1. Open downloaded template
2. Edit "Ritasi Baru" column for a few routes:
   - Route 1: Change to 150000
   - Route 2: Change to 200000
3. Save file
4. In app, click "Upload File"
5. Select the edited template
6. Verify: "Siap update X rute. Memproses..." message appears
7. Wait for success message: "✓ Berhasil update X rute dengan nilai Ritasi baru"
8. Close modal
9. Go to Master Data → Rute and verify Ritasi values were updated

- [ ] **Step 4: Test as non-Superadmin**

1. Log in as Admin Keuangan, Reader, or Driver
2. Go to Master Data → Rute section
3. Verify "Bulk Upload Ritasi" button is NOT visible - ✓

- [ ] **Step 5: Test error handling**

**Test 1: Invalid file format**
1. Create text file or wrong format
2. Try to upload
3. Verify error message appears

**Test 2: Corrupted Excel**
1. Open template, delete header row
2. Try to upload
3. Verify error: "Header kolom tidak sesuai"

**Test 3: Invalid Ritasi value**
1. Open template, set Ritasi Baru to "abc" or negative number
2. Try to upload
3. Verify error message with row number

**Test 4: Empty Ritasi**
1. Open template, leave Ritasi Baru empty for one row
2. Try to upload
3. Verify error message

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test: verify bulk ritasi upload functionality"
```

---

## Phase 6: Final Build & Deploy

### Task 6: Final Build and Deployment

**Files:**
- Deploy: Production build

- [ ] **Step 1: Final build**

```bash
npm run build
```

Verify: Success, 0 errors

- [ ] **Step 2: Deploy to Firebase**

```bash
firebase deploy --only hosting
```

- [ ] **Step 3: Test on live**

1. Open https://surat-jalan-monitor.web.app
2. Log in as Superadmin
3. Navigate to Master Data → Rute
4. Verify "Bulk Upload Ritasi" button appears
5. Test download and upload flow
6. Verify changes persist

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: bulk ritasi upload feature complete and deployed"
```

---

## Files Summary

| File | Status | Purpose |
|------|--------|---------|
| `src/utils/ritasiTemplateHelpers.js` | NEW | Template generation, validation, parsing |
| `src/services/ritasiBulkService.js` | NEW | Firestore bulk update operations |
| `src/components/RitasiBulkUpload.jsx` | NEW | UI for download/upload workflow |
| `src/App.jsx` | MODIFY | Integration: button, modal, state |

---

## Access Control

✅ Only Superadmin can see "Bulk Upload Ritasi" button
✅ Only Superadmin can download template
✅ Only Superadmin can upload file
✅ Other roles: Feature is hidden

---

## Verification Checklist

- [ ] Build succeeds with 0 errors
- [ ] Download template generates Excel file with all routes
- [ ] Upload parses Excel correctly
- [ ] Validation catches errors (headers, data types, negatives)
- [ ] Firestore bulk update works correctly
- [ ] UI shows proper success/error messages
- [ ] Access control enforced (only Superadmin)
- [ ] Responsive design works on mobile/desktop
- [ ] All tests pass
- [ ] Deployed to production successfully
