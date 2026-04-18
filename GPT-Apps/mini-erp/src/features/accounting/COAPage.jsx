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

const emptyForm = {
  id: '',
  kode: '',
  nama: '',
  tipe: 'Asset',
  saldoNormal: 'Debit',
  catatan: '',
  isActive: true,
};

const accountTypes = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
const normalBalanceByType = {
  Asset: 'Debit',
  Expense: 'Debit',
  Liability: 'Credit',
  Equity: 'Credit',
  Revenue: 'Credit',
};

const columns = [
  { key: 'kode', label: 'Kode' },
  { key: 'nama', label: 'Nama Akun' },
  { key: 'tipe', label: 'Tipe' },
  { key: 'saldoNormal', label: 'Saldo Normal' },
  {
    key: 'isActive',
    label: 'Status',
    render: (row) => <Badge tone={row.isActive ? 'green' : 'gray'}>{row.isActive ? 'Aktif' : 'Nonaktif'}</Badge>,
  },
];

function COAForm({ data, onChange }) {
  function handleTypeChange(tipe) {
    onChange({ tipe, saldoNormal: normalBalanceByType[tipe] || data.saldoNormal });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Kode"
          onChange={(event) => onChange({ kode: event.target.value.toUpperCase() })}
          placeholder="1-1000"
          required
          value={data.kode}
        />
        <TextField
          label="Nama Akun"
          onChange={(event) => onChange({ nama: event.target.value })}
          placeholder="Nama akun"
          required
          value={data.nama}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Tipe Akun" onChange={(event) => handleTypeChange(event.target.value)} value={data.tipe}>
          {accountTypes.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </SelectField>
        <SelectField label="Saldo Normal" onChange={(event) => onChange({ saldoNormal: event.target.value })} value={data.saldoNormal}>
          <option value="Debit">Debit</option>
          <option value="Credit">Credit</option>
        </SelectField>
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

export function COAPage() {
  const { items, loading, error, save, remove, restore } = useMasterData('coaAccounts', { prefix: 'coa' });
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
        [item.kode, item.nama, item.tipe, item.saldoNormal]
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

    if (!form.kode.trim() || !form.nama.trim()) return;

    setSaving(true);
    try {
      await save({
        ...form,
        kode: form.kode.trim(),
        nama: form.nama.trim(),
        catatan: form.catatan.trim(),
      });
      setDrawerOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!form.id) return;
    const confirmed = window.confirm(`Nonaktifkan akun "${form.nama}"?`);
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
        eyebrow="Accounting setup"
        title="Chart of Accounts"
        description="Kelola COA sederhana untuk MVP. Perubahan akun memakai soft delete dan belum memengaruhi posting jurnal historis."
        actions={<Button icon={Plus} onClick={openCreateDrawer}>Tambah Akun</Button>}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput onChange={setQuery} placeholder="Cari kode, nama, tipe, atau saldo normal" value={query} />
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
          Memuat chart of accounts...
        </div>
      ) : filteredItems.length ? (
        <DataTable columns={columns} rows={filteredItems} onRowClick={openEditDrawer} />
      ) : (
        <EmptyState
          title="Belum ada akun"
          description="Tambahkan akun pertama untuk mulai membentuk struktur accounting."
          action={<Button icon={Plus} onClick={openCreateDrawer}>Tambah Akun</Button>}
        />
      )}

      <Drawer
        description={form.id ? 'Edit detail akun dan simpan perubahan.' : 'Tambah akun baru ke COA company aktif.'}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        title={form.id ? 'Edit Akun' : 'Tambah Akun'}
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
              <Button form="coa-form" type="submit" disabled={saving || !form.kode.trim() || !form.nama.trim()}>
                {saving ? 'Menyimpan...' : 'Simpan'}
              </Button>
            </div>
          </div>
        }
      >
        <form id="coa-form" onSubmit={handleSubmit}>
          <COAForm data={form} onChange={updateForm} />
        </form>
      </Drawer>
    </div>
  );
}
