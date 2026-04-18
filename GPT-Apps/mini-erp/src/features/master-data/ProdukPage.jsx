import { useMemo, useState } from 'react';
import { ArchiveRestore, Plus, Trash2 } from 'lucide-react';
import { EmptyState } from '../../components/feedback/EmptyState.jsx';
import { SearchInput } from '../../components/forms/SearchInput.jsx';
import { SelectField } from '../../components/forms/SelectField.jsx';
import { TextArea } from '../../components/forms/TextArea.jsx';
import { TextField } from '../../components/forms/TextField.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Drawer } from '../../components/ui/Drawer.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { useMasterData } from '../../hooks/useMasterData.js';
import { formatCurrency } from '../../utils/currency.js';

const emptyForm = {
  id: '',
  kode: '',
  nama: '',
  tipe: 'Jasa',
  satuan: '',
  hargaJual: '',
  akunPendapatan: '',
  catatan: '',
  isActive: true,
};

const columns = [
  { key: 'kode', label: 'Kode' },
  { key: 'nama', label: 'Nama Produk/Jasa' },
  { key: 'tipe', label: 'Tipe', render: (row) => <Badge tone={row.tipe === 'Produk' ? 'blue' : 'orange'}>{row.tipe}</Badge> },
  { key: 'satuan', label: 'Satuan' },
  { key: 'hargaJual', label: 'Harga Jual', render: (row) => formatCurrency(row.hargaJual) },
  {
    key: 'isActive',
    label: 'Status',
    render: (row) => <Badge tone={row.isActive ? 'green' : 'gray'}>{row.isActive ? 'Aktif' : 'Nonaktif'}</Badge>,
  },
];

function ProdukForm({ data, onChange }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Kode"
          onChange={(event) => onChange({ kode: event.target.value.toUpperCase() })}
          placeholder="PRD-001"
          value={data.kode}
        />
        <TextField
          label="Nama"
          onChange={(event) => onChange({ nama: event.target.value })}
          placeholder="Nama produk atau jasa"
          required
          value={data.nama}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Tipe" onChange={(event) => onChange({ tipe: event.target.value })} value={data.tipe}>
          <option value="Produk">Produk</option>
          <option value="Jasa">Jasa</option>
        </SelectField>
        <TextField
          label="Satuan"
          onChange={(event) => onChange({ satuan: event.target.value })}
          placeholder="Pcs, Jam, Paket"
          value={data.satuan}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Harga Jual"
          min="0"
          onChange={(event) => onChange({ hargaJual: event.target.value })}
          placeholder="0"
          type="number"
          value={data.hargaJual}
        />
        <TextField
          label="Akun Pendapatan"
          onChange={(event) => onChange({ akunPendapatan: event.target.value })}
          placeholder="4-1000"
          value={data.akunPendapatan}
        />
      </div>

      <TextArea
        label="Catatan"
        onChange={(event) => onChange({ catatan: event.target.value })}
        placeholder="Catatan internal"
        value={data.catatan}
      />
    </div>
  );
}

export function ProdukPage() {
  const { items, loading, error, save, remove, restore } = useMasterData('produk', { prefix: 'prd' });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('aktif');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter((item) => {
      const matchStatus =
        statusFilter === 'semua' || (statusFilter === 'aktif' ? item.isActive !== false : item.isActive === false);
      const matchQuery =
        !normalizedQuery ||
        [item.kode, item.nama, item.tipe, item.satuan, item.akunPendapatan]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(normalizedQuery));

      return matchStatus && matchQuery;
    });
  }, [items, query, statusFilter]);

  function openCreateDrawer() {
    setForm(emptyForm);
    setDrawerOpen(true);
  }

  function openEditDrawer(row) {
    setForm({ ...emptyForm, ...row, hargaJual: String(row.hargaJual || '') });
    setDrawerOpen(true);
  }

  function updateForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!form.nama.trim()) return;

    setSaving(true);
    try {
      await save({
        ...form,
        kode: form.kode.trim() || `PRD-${String(items.length + 1).padStart(3, '0')}`,
        nama: form.nama.trim(),
        satuan: form.satuan.trim(),
        hargaJual: Number(form.hargaJual || 0),
        akunPendapatan: form.akunPendapatan.trim(),
        catatan: form.catatan.trim(),
      });
      setDrawerOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!form.id) return;
    const confirmed = window.confirm(`Nonaktifkan produk/jasa "${form.nama}"?`);
    if (!confirmed) return;

    setSaving(true);
    try {
      await remove(form.id);
      setDrawerOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore() {
    if (!form.id) return;

    setSaving(true);
    try {
      await restore(form.id);
      setDrawerOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Master Data"
        title="Produk / Jasa"
        description="Kelola item penjualan umum dengan satuan, harga jual, dan akun pendapatan default."
        actions={<Button icon={Plus} onClick={openCreateDrawer}>Tambah Produk/Jasa</Button>}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput onChange={setQuery} placeholder="Cari kode, nama, tipe, satuan, atau akun" value={query} />
        <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
          {[
            ['aktif', 'Aktif'],
            ['nonaktif', 'Nonaktif'],
            ['semua', 'Semua'],
          ].map(([value, label]) => (
            <button
              className={[
                'min-h-10 whitespace-nowrap rounded-full border px-4 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-ios-blue/30',
                statusFilter === value
                  ? 'border-ios-blue bg-ios-blue text-white'
                  : 'border-ios-separator bg-white text-ios-secondary hover:text-ios-label',
              ].join(' ')}
              key={value}
              onClick={() => setStatusFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-ios-red/20 bg-ios-red/10 px-4 py-3 text-sm text-ios-red">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
          Memuat data produk/jasa...
        </div>
      ) : filteredItems.length ? (
        <DataTable columns={columns} rows={filteredItems} onRowClick={openEditDrawer} />
      ) : (
        <EmptyState
          title="Belum ada produk atau jasa"
          description="Tambahkan item pertama untuk mulai membentuk katalog ERP."
          action={<Button icon={Plus} onClick={openCreateDrawer}>Tambah Produk/Jasa</Button>}
        />
      )}

      <Drawer
        description={form.id ? 'Edit detail produk/jasa dan simpan perubahan.' : 'Tambah produk atau jasa baru ke master data company aktif.'}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        title={form.id ? 'Edit Produk/Jasa' : 'Tambah Produk/Jasa'}
        footer={
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {form.id && form.isActive !== false ? (
                <Button icon={Trash2} onClick={handleDelete} variant="danger" disabled={saving}>Nonaktifkan</Button>
              ) : null}
              {form.id && form.isActive === false ? (
                <Button icon={ArchiveRestore} onClick={handleRestore} variant="secondary" disabled={saving}>Aktifkan</Button>
              ) : null}
            </div>
            <div className="flex gap-2 sm:justify-end">
              <Button onClick={() => setDrawerOpen(false)} type="button" variant="secondary" disabled={saving}>Batal</Button>
              <Button form="produk-form" type="submit" disabled={saving || !form.nama.trim()}>
                {saving ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </div>
        }
      >
        <form id="produk-form" onSubmit={handleSubmit}>
          <ProdukForm data={form} onChange={updateForm} />
        </form>
      </Drawer>
    </div>
  );
}
