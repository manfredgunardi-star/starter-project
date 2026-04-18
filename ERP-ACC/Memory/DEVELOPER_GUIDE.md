# ERP Pembukuan — Developer Quick Reference

## Getting Started

### Local Development
```bash
cd erp-app
npm install
npm run dev
# Navigate to http://localhost:5173
```

### Build for Production
```bash
npm run build
npm run preview  # test the build locally
```

### Deploy (Firebase/Supabase Hosting)
```bash
firebase deploy --only hosting
# or
supabase projects deploy
```

---

## Project Structure

```
src/
├── pages/           # Page components (one per route)
├── services/        # Business logic + API calls
├── hooks/           # Custom React hooks
├── components/
│   ├── layout/      # Sidebar, AppLayout, etc.
│   ├── shared/      # Reusable components (DocumentHeader, LineItemsTable)
│   └── ui/          # Generic UI components (Button, Input, Modal, etc.)
├── contexts/        # React Context (Auth, Toast)
├── utils/           # Pure helper functions
├── lib/             # External library initialization (Supabase)
└── App.jsx          # Root component with routing
```

---

## Naming Conventions

### Files
- **Pages**: `PascalCase.jsx` (e.g., `SalesOrdersPage.jsx`)
- **Components**: `PascalCase.jsx` (e.g., `DocumentHeader.jsx`)
- **Hooks**: `camelCase.js` (e.g., `useMasterData.js`)
- **Services**: `camelCase.js` (e.g., `salesService.js`)
- **Utils**: `camelCase.js` (e.g., `currency.js`)

### Variables
- **IDs**: `camelCase` (e.g., `product_id`, `customer_id`)
- **Booleans**: `is*` prefix (e.g., `is_active`, `isSubmitting`)
- **Tables**: `snake_case` (e.g., `sales_orders`, `invoice_items`)
- **Columns**: `snake_case` (e.g., `created_at`, `unit_price`)

### Indonesian Terms (in Code)
```
suratJalan (delivery note)
nomorSJ (SJ number)
pengiriman (delivery)
penerimaan (receipt)
penjualan (sales)
pembelian (purchase)
jurnal (journal)
biaya (expense)
pelanggan (customer)
supplier
satuan (unit)
stok (stock)
armada (fleet)
supir (driver)
rute (route)
```

---

## Adding a New Page

1. **Create the page** in `src/pages/[module]/NewPage.jsx`:
```jsx
export default function NewPage() {
  // Use hooks for data
  // Call services for operations
  // Render UI with components
  return <div>...</div>
}
```

2. **Register the route** in `src/App.jsx`:
```jsx
import NewPage from './pages/[module]/NewPage'
// ... in Routes ...
<Route path="module/path" element={<NewPage />} />
```

3. **Add to sidebar** (if needed) in `src/components/layout/Sidebar.jsx`:
```jsx
const menuGroups = [
  {
    label: 'Module Name',
    icon: IconComponent,
    items: [
      { label: 'Page Name', path: '/module/path' },
    ]
  }
]
```

---

## Using Forms

### Pattern 1: Simple Modal Form
```jsx
const [isOpen, setIsOpen] = useState(false)
const [formData, setFormData] = useState({ name: '' })
const [isSubmitting, setIsSubmitting] = useState(false)

const handleSubmit = async (e) => {
  e.preventDefault()
  setIsSubmitting(true)
  try {
    await saveService({ ...formData })
    toast.success('Berhasil disimpan')
  } catch (err) {
    toast.error(err.message)
  } finally {
    setIsSubmitting(false)
  }
}

return (
  <>
    <button onClick={() => setIsOpen(true)}>Tambah</button>
    {isOpen && (
      <Modal title="Tambah Item" onClose={() => setIsOpen(false)}>
        <form onSubmit={handleSubmit}>
          <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          <Button type="submit" loading={isSubmitting}>Simpan</Button>
        </form>
      </Modal>
    )}
  </>
)
```

### Pattern 2: Document Form (Header + Line Items)
Use `DocumentHeader` and `LineItemsTable` components:
```jsx
const [header, setHeader] = useState({ date: today(), customer_id: '' })
const [items, setItems] = useState([LineItemsTable.emptyRow()])

// LineItemsTable handles add/remove rows
// Pass priceField='sell_price' for sales, 'buy_price' for purchases
```

---

## Database Queries

### Direct Table Query
```jsx
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('field_name', value)
  .single()
```

### Nested Select (with Relations)
```jsx
const { data, error } = await supabase
  .from('orders')
  .select(`
    id, date, total,
    customer:customer_id(id, name),
    items:order_items(
      id, product_id, quantity, unit_price,
      product:products(id, name, sku)
    )
  `)
  .eq('id', id)
  .single()
```

### RPC (Stored Procedure)
```jsx
const { data, error } = await supabase.rpc('function_name', {
  param_1: value1,
  param_2: value2
})
```

### Common RPCs
- `generate_number({ p_prefix: 'SO' })` → 'SO-2026-00001'
- `post_goods_receipt({ p_gr_id })` → posts GR and updates inventory
- `post_sales_invoice({ p_invoice_id })` → posts invoice and creates journal
- `get_account_balances(p_start_date, p_end_date)` → returns account balances
- `get_ledger(p_coa_id, p_start_date, p_end_date)` → returns ledger entries

---

## Working with Currency & Dates

### Currency Formatting
```jsx
import { formatCurrency } from '../utils/currency'

formatCurrency(1000000)  // "Rp 1.000.000,00"
```

### Date Formatting
```jsx
import { formatDate, formatDateTime, today } from '../utils/date'

formatDate('2026-04-10')  // "10 Apr 2026"
formatDateTime('2026-04-10T15:30:00Z')  // "10 Apr 2026 15:30"
today()  // "2026-04-10"
```

---

## Authentication & Authorization

### Check Role
```jsx
import { useAuth } from '../contexts/AuthContext'

function MyComponent() {
  const { user, profile, canWrite, canManage } = useAuth()
  
  if (!canWrite) {
    return <p>Tidak ada akses untuk operasi ini</p>
  }
  
  return <div>...</div>
}
```

### Require Authentication
Use `<ProtectedRoute>` wrapper in App.jsx:
```jsx
<Route path="/protected" element={<ProtectedRoute><MyPage /></ProtectedRoute>} />
```

---

## Toast Notifications

```jsx
import { useToast } from '../components/ui/ToastContext'

function MyComponent() {
  const toast = useToast()
  
  const handleSave = async () => {
    try {
      await saveData()
      toast.success('Data berhasil disimpan')
    } catch (err) {
      toast.error('Gagal menyimpan: ' + err.message)
    }
  }
}
```

---

## Validation Patterns

### Field Validation
```jsx
const validate = () => {
  const errors = {}
  if (!formData.name?.trim()) errors.name = 'Nama wajib diisi'
  if (!formData.amount || Number(formData.amount) <= 0) errors.amount = 'Jumlah harus > 0'
  if (formData.customer_id && formData.supplier_id) errors.party = 'Pilih customer atau supplier, tidak keduanya'
  return errors
}

const handleSubmit = async (e) => {
  e.preventDefault()
  const errors = validate()
  if (Object.keys(errors).length > 0) {
    setFormErrors(errors)
    return
  }
  // proceed with save
}
```

### Common Validations
```jsx
// Required field
if (!value?.trim()) error = 'Wajib diisi'

// Numeric field
if (!value || isNaN(Number(value))) error = 'Harus angka'

// Positive amount
if (Number(value) <= 0) error = 'Harus lebih besar dari 0'

// Email
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) error = 'Format email tidak valid'

// Date range
if (startDate > endDate) error = 'Tanggal mulai harus sebelum tanggal akhir'

// Debit/Credit balance
if (totalDebit !== totalCredit) error = 'Debit dan kredit harus seimbang'
```

---

## Common UI Patterns

### Loading State
```jsx
if (loading) return <LoadingSpinner message="Memuat data..." />
if (error) return <div className="text-red-600">{error}</div>
```

### Data Table with Actions
```jsx
<table className="w-full border-collapse">
  <thead className="bg-gray-50 border-b">
    <tr>
      <th className="px-4 py-2 text-left text-xs font-medium">Nama</th>
      <th className="px-4 py-2 text-left text-xs font-medium">Aksi</th>
    </tr>
  </thead>
  <tbody>
    {data.map(item => (
      <tr key={item.id} className="border-b hover:bg-gray-50">
        <td className="px-4 py-2 text-sm">{item.name}</td>
        <td className="px-4 py-2">
          <button onClick={() => onEdit(item)}>Edit</button>
          <button onClick={() => onDelete(item.id)}>Hapus</button>
        </td>
      </tr>
    ))}
  </tbody>
</table>
```

### Status Badge
```jsx
const STATUS_BADGE = {
  draft: 'bg-gray-100 text-gray-700',
  posted: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
}

<span className={`text-xs px-2 py-1 rounded ${STATUS_BADGE[status]}`}>
  {status}
</span>
```

---

## Debugging Tips

### Console Logging
```jsx
console.log('Component mounted', { user, profile })
```

### Network Inspector
Open DevTools > Network tab to inspect all Supabase API calls

### React DevTools
Install React DevTools extension to inspect component state/props

### Supabase Dashboard
Visit your Supabase dashboard to:
- View/edit database directly
- Check RLS policies
- Monitor real-time subscriptions
- View function logs

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| **"Unauthorized" error** | Check RLS policy; ensure user role matches policy conditions |
| **"Duplicate key" error** | Check for unique constraints; might need to generate new ID |
| **Form not submitting** | Check validation errors; ensure all required fields filled |
| **Balances don't match** | Verify debit=credit for all journal entries; check running balance calculation |
| **Slow list page load** | Add indexes on filter fields; use pagination for large datasets |
| **Inventory qty negative** | Check for over-delivery before GR posting |

---

## Performance Optimization

### Code Splitting
Currently using a single main bundle. To optimize:
```jsx
// Lazy load heavy pages
const HeavyPage = React.lazy(() => import('./pages/HeavyPage'))

<Suspense fallback={<LoadingSpinner />}>
  <HeavyPage />
</Suspense>
```

### Memoization
```jsx
const memoizedValue = useMemo(() => expensiveCalculation(data), [data])
const memoizedCallback = useCallback((x) => handleClick(x), [deps])
```

---

## Adding New Features Checklist

- [ ] Add service function(s) in `src/services/`
- [ ] Add hook(s) in `src/hooks/` if needed
- [ ] Create page(s) in `src/pages/[module]/`
- [ ] Register route(s) in `src/App.jsx`
- [ ] Add to sidebar menu (if applicable)
- [ ] Write tests (when test framework added)
- [ ] Update IMPLEMENTATION_SUMMARY.md
- [ ] Run `npm run build` to verify no errors
- [ ] Test in browser (manual smoke test)

---

## Useful Commands

```bash
# Development
npm run dev          # Start dev server
npm run build        # Build for production
npm run preview      # Preview prod build locally

# Linting (when added)
npm run lint        # Lint JavaScript
npm run format      # Format code

# Database
supabase db push    # Push local changes to Supabase
supabase db pull    # Pull remote changes locally
supabase functions deploy  # Deploy edge functions (if used)

# Git
git log --oneline   # View commit history
git diff HEAD~1     # See recent changes
```

---

## Resources

- **React Docs**: https://react.dev
- **Supabase Docs**: https://supabase.com/docs
- **Tailwind CSS**: https://tailwindcss.com
- **date-fns**: https://date-fns.org
- **Lucide Icons**: https://lucide.dev

---

## Contact & Support

For questions or issues:
1. Check IMPLEMENTATION_SUMMARY.md for feature details
2. Review this DEVELOPER_GUIDE for patterns
3. Check SMOKE_TEST_CHECKLIST.md for test procedures
4. Inspect database schema in `/supabase/migrations/`

---

**Last Updated**: 2026-04-10  
**Current Version**: 1.0
