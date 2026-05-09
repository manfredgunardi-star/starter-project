# Uang Muka di Rute Masterdata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Uang Muka" (advance payment default amount) field to the Rute master data — both in the UI form/display and in the bulk CSV import/export template.

**Architecture:** This is a straightforward field addition to the existing Rute masterdata, following the same pattern as the existing "Ritasi" field. The new `uangMuka` field is stored as a number (Rp) on each Rute document in Firestore. The CSV template expands from 2 columns to 3 columns. No new collections or components needed.

**Tech Stack:** React (existing), Firebase Firestore (existing), Tailwind CSS (existing)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/App.jsx:4180-4182` | Add `uangMuka` to formData initialization |
| Modify | `src/App.jsx:4333-4342` | Add `uangMuka` to form submit data assembly |
| Modify | `src/App.jsx:5189-5201` | Add Uang Muka input field to Rute modal form |
| Modify | `src/App.jsx:3271-3283` | Add Uang Muka display in Rute card grid |
| Modify | `src/App.jsx:1343-1345` | Update CSV template to include Uang Muka column |
| Modify | `src/App.jsx:1415-1419` | Update CSV header validation for 3 columns |
| Modify | `src/App.jsx:1750-1777` | Parse Uang Muka from CSV import rows |

---

### Task 1: Add Uang Muka to Rute Form Data & Submit Logic

**Files:**
- Modify: `src/App.jsx:4180-4182` (formData initialization)
- Modify: `src/App.jsx:4333-4342` (form submit)

- [ ] **Step 1: Add `uangMuka` to formData initialization**

In `src/App.jsx`, find the formData initialization near line 4182 (after `ritasi`). Add `uangMuka`:

```javascript
    ritasi: selectedItem?.ritasi || '',
    uangMuka: selectedItem?.uangMuka || '',
```

- [ ] **Step 2: Add `uangMuka` to form submit data**

In `src/App.jsx`, find the Rute submit block near line 4338-4342. Change from:

```javascript
      onSubmit({
        rute: formData.rute,
        uangJalan: parseFloat(formData.uangJalan),
        ritasi: parseFloat(formData.ritasi) || 0
      });
```

To:

```javascript
      onSubmit({
        rute: formData.rute,
        uangJalan: parseFloat(formData.uangJalan),
        ritasi: parseFloat(formData.ritasi) || 0,
        uangMuka: parseFloat(formData.uangMuka) || 0
      });
```

- [ ] **Step 3: Verify the app builds**

Run: `cd sj-monitor && npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add uangMuka field to Rute form data and submit logic"
```

---

### Task 2: Add Uang Muka Input Field to Rute Modal Form

**Files:**
- Modify: `src/App.jsx:5189-5201` (Rute form in modal)

- [ ] **Step 1: Add Uang Muka input field after the Ritasi field**

In `src/App.jsx`, find the Ritasi form field block (lines 5189-5201). After the closing `</div>` of the Ritasi field (line 5201), add a new Uang Muka field:

```jsx
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Uang Muka (Rp)</label>
                <input
                  type="number"
                  value={formData.uangMuka}
                  onChange={(e) => setFormData({ ...formData, uangMuka: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Jumlah uang muka default untuk rute ini"
                  min="0"
                  step="10000"
                />
                <small className="text-gray-500">Uang muka default per pengiriman untuk rute ini</small>
              </div>
```

This follows the exact same pattern as the Ritasi field.

- [ ] **Step 2: Verify the app builds**

Run: `cd sj-monitor && npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Uang Muka input field to Rute modal form"
```

---

### Task 3: Display Uang Muka in Rute Card

**Files:**
- Modify: `src/App.jsx:3271-3283` (Rute card display grid)

- [ ] **Step 1: Add Uang Muka to the Rute card grid**

In `src/App.jsx`, find the Rute display grid (lines 3271-3283). Currently shows Rute ID, Uang Jalan, and Ritasi in a `grid-cols-2` layout. Change to `grid-cols-2 sm:grid-cols-4` and add Uang Muka after Ritasi.

Change:
```jsx
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Rute ID:</p>
                          <p className="font-semibold text-gray-800">{rute.id}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Uang Jalan:</p>
                          <p className="font-semibold text-blue-600">{formatCurrency(rute.uangJalan)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Ritasi:</p>
                          <p className="font-semibold text-green-600">{formatCurrency(rute.ritasi || 0)}</p>
                        </div>
                      </div>
```

To:
```jsx
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Rute ID:</p>
                          <p className="font-semibold text-gray-800">{rute.id}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Uang Jalan:</p>
                          <p className="font-semibold text-blue-600">{formatCurrency(rute.uangJalan)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Ritasi:</p>
                          <p className="font-semibold text-green-600">{formatCurrency(rute.ritasi || 0)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Uang Muka:</p>
                          <p className="font-semibold text-orange-600">{formatCurrency(rute.uangMuka || 0)}</p>
                        </div>
                      </div>
```

- [ ] **Step 2: Verify the app builds**

Run: `cd sj-monitor && npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: display Uang Muka in Rute masterdata card"
```

---

### Task 4: Update Bulk CSV Template and Import for Rute

**Files:**
- Modify: `src/App.jsx:1343-1345` (CSV template download)
- Modify: `src/App.jsx:1415-1419` (CSV header validation)
- Modify: `src/App.jsx:1750-1777` (CSV import processing)

- [ ] **Step 1: Update CSV template to include Uang Muka**

In `src/App.jsx`, find the rute template download (line 1343-1345). Change from:

```javascript
    } else if (type === 'rute') {
      csvContent = 'Rute;Uang Jalan\nJakarta - Surabaya;500000\nBandung - Semarang;350000\nJakarta - Medan;1200000';
      filename = 'template_rute.csv';
```

To:

```javascript
    } else if (type === 'rute') {
      csvContent = 'Rute;Uang Jalan;Uang Muka\nJakarta - Surabaya;500000;100000\nBandung - Semarang;350000;75000\nJakarta - Medan;1200000;200000';
      filename = 'template_rute.csv';
```

- [ ] **Step 2: Update CSV header validation**

In `src/App.jsx`, find the rute header validation (lines 1415-1419). Change from:

```javascript
        } else if (type === 'rute') {
          expectedHeader = 'Rute;Uang Jalan';
          isValidHeader = headers.length === 2 && 
                         headersLower[0] === 'rute' &&
                         (headersLower[1].includes('uang') && headersLower[1].includes('jalan'));
```

To:

```javascript
        } else if (type === 'rute') {
          expectedHeader = 'Rute;Uang Jalan;Uang Muka';
          isValidHeader = headers.length >= 2 && headers.length <= 3 &&
                         headersLower[0] === 'rute' &&
                         (headersLower[1].includes('uang') && headersLower[1].includes('jalan'));
```

Note: We validate `headers.length >= 2 && headers.length <= 3` to accept both the old 2-column format (backward compatible) and the new 3-column format. The Uang Muka column is optional — if missing, it defaults to 0.

- [ ] **Step 3: Update CSV import processing to parse Uang Muka**

In `src/App.jsx`, find the rute import processing (lines 1750-1777). Change the row parsing from:

```javascript
} else if (type === 'rute') {
          for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(delimiter).map(v => v.trim());
            if (values.length >= 2 && values[0] && values[1]) {
              try {
                // Validasi bahwa kolom kedua adalah angka
                const uangJalan = parseFloat(values[1].replace(/\./g, '').replace(/,/g, ''));
                if (isNaN(uangJalan)) {
                  throw new Error('Uang Jalan harus berupa angka');
                }
                
                const newRute = {
                  id: 'RUT-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  rute: values[0],
                  uangJalan: uangJalan,
                  createdAt: new Date().toISOString(),
                  createdBy: currentUser.name
                };
                newItems.push(newRute);
                successCount++;
              } catch (error) {
                errorCount++;
                errorDetails.push(`Baris ${i + 2}: ${values[0]} - ${error.message}`);
              }
            } else {
              errorCount++;
              errorDetails.push(`Baris ${i + 2}: Data tidak lengkap (harus ada Rute dan Uang Jalan)`);
            }
          }
```

To:

```javascript
} else if (type === 'rute') {
          for (let i = 0; i < dataRows.length; i++) {
            const values = dataRows[i].split(delimiter).map(v => v.trim());
            if (values.length >= 2 && values[0] && values[1]) {
              try {
                // Validasi bahwa kolom kedua adalah angka
                const uangJalan = parseFloat(values[1].replace(/\./g, '').replace(/,/g, ''));
                if (isNaN(uangJalan)) {
                  throw new Error('Uang Jalan harus berupa angka');
                }

                // Parse Uang Muka (kolom ke-3, opsional)
                let uangMuka = 0;
                if (values.length >= 3 && values[2]) {
                  uangMuka = parseFloat(values[2].replace(/\./g, '').replace(/,/g, ''));
                  if (isNaN(uangMuka)) {
                    uangMuka = 0;
                  }
                }
                
                const newRute = {
                  id: 'RUT-' + Date.now() + '-' + i + '-' + Math.random().toString(36).substr(2, 9),
                  rute: values[0],
                  uangJalan: uangJalan,
                  uangMuka: uangMuka,
                  createdAt: new Date().toISOString(),
                  createdBy: currentUser.name
                };
                newItems.push(newRute);
                successCount++;
              } catch (error) {
                errorCount++;
                errorDetails.push(`Baris ${i + 2}: ${values[0]} - ${error.message}`);
              }
            } else {
              errorCount++;
              errorDetails.push(`Baris ${i + 2}: Data tidak lengkap (harus ada Rute dan Uang Jalan)`);
            }
          }
```

- [ ] **Step 4: Verify the app builds**

Run: `cd sj-monitor && npm run build 2>&1 | tail -5`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add Uang Muka column to Rute bulk CSV template and import"
```

---

## Summary of All Changes

| Location | Change |
|----------|--------|
| formData init (line ~4182) | Add `uangMuka: selectedItem?.uangMuka \|\| ''` |
| form submit (line ~4341) | Add `uangMuka: parseFloat(formData.uangMuka) \|\| 0` |
| Modal form (after line ~5201) | New Uang Muka number input field |
| Rute card (lines ~3271-3283) | Add Uang Muka display in orange, expand grid to 4 cols |
| CSV template (line ~1344) | Add `;Uang Muka` column with example values |
| CSV validation (lines ~1415-1419) | Accept 2 or 3 columns (backward compatible) |
| CSV import (lines ~1750-1777) | Parse optional 3rd column as `uangMuka` |

Total: 4 tasks, ~7 touch points in `src/App.jsx`, no new files needed.
