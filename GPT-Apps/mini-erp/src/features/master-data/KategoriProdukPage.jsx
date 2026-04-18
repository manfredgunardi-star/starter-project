import { useMemo, useState } from 'react';
import { ArchiveRestore, Plus, Trash2 } from 'lucide-react';
import { EmptyState } from '../../components/feedback/EmptyState.jsx';
import { SearchInput } from '../../components/forms/SearchInput.jsx';
import { TextArea } from '../../components/forms/TextArea.jsx';
import { TextField } from '../../components/forms/TextField.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Drawer } from '../../components/ui/Drawer.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { useMasterData } from '../../hooks/useMasterData.js';

const emptyForm = {
  id: '',
  kode: '',
  nama: '',
  deskripsi: '',
  catatan: '',
  isActive: true,
};

const columns = [
  { key: 'kode', label: 'Kode' },
  { key: 'nama', label: 'Nama Kategori' },
  { key: 'deskripsi', label: 'Deskripsi' },
  {
    key: 'isActive',
    label: 'Status',
    render: (row) => <Badge tone={row.isActive ? 'green' : 'gray'}>{row.isActive ? 'Aktif' : 'Nonaktif'}</Badge>,
  },
];

function KategoriProdukForm({ data, onChange }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Kode"
          onChange={(event) => onChange({ kode: event.target.value.toUpperCase() })}
          placeholder="CAT-001"
          value={data.kode}
        />
        <TextField
          label="Nama"
          onChange={(event) => onChange({ nama: event.target.value })}
          placeholder="Nama kategori"
          required
          value={data.nama}
        />
      </div>
      <TextArea
        label="Deskripsi"
        onChange={(event) => onChange({ deskripsi: event.target.value })}
        placeholder="Deskripsi kategori"
        value={data.deskripsi}
      />
      <TextArea
        label="Catatan"
        onChange={(event) => onChange({ catatan: event.target.value })}
        placeholder="Catatan internal"
        value={data.catatan}
      />
    </div>
  );
}

export function KategoriProdukPage() {
  const { items, loading, error, save, remove, restore } = useMasterData('kategoriProduk', { prefix: 'kat' });
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
        [item.kode, item.nama, item.deskripsi]
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
    setForm({ ...emptyForm, ...row });
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
        kode: form.kode.trim() || `CAT-${String(items.length + 1).padStart(3, '0')}`,
        nama: form.nama.trim(),
        deskripsi: form.deskripsi.trim(),
        catatan: form.catatan.trim(),
      });
      setDrawerOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!form.id) return;
    const confirmed = window.confirm(`Nonaktifkan kategori "${form.nama}"?`);
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
        title="Kategori Produk"
        description="Kelola pengelompokan produk dan jasa untuk katalog ERP."
        actions={<Button icon={Plus} onClick={openCreateDrawer}>Tambah Kategori</Button>}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput onChange={setQuery} placeholder="Cari kode, nama, atau deskripsi" value={query} />
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
          Memuat data kategori produk...
        </div>
      ) : filteredItems.length ? (
        <DataTable columns={columns} rows={filteredItems} onRowClick={openEditDrawer} />
      ) : (
        <EmptyState
          title="Belum ada kategori"
          description="Tambahkan kategori pertama untuk merapikan katalog produk dan jasa."
          action={<Button icon={Plus} onClick={openCreateDrawer}>Tambah Kategori</Button>}
        />
      )}

      <Drawer
        description={form.id ? 'Edit detail kategori dan simpan perubahan.' : 'Tambah kategori produk baru ke company aktif.'}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        title={form.id ? 'Edit Kategori Produk' : 'Tambah Kategori Produk'}
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
              <Button form="kategori-produk-form" type="submit" disabled={saving || !form.nama.trim()}>
                {saving ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </div>
        }
      >
        <form id="kategori-produk-form" onSubmit={handleSubmit}>
          <KategoriProdukForm data={form} onChange={updateForm} />
        </form>
      </Drawer>
    </div>
  );
}
