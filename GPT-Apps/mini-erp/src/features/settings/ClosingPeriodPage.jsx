import { useMemo, useState } from 'react';
import { CalendarDays, Lock, Unlock } from 'lucide-react';
import { TextArea } from '../../components/forms/TextArea.jsx';
import { TextField } from '../../components/forms/TextField.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatCard } from '../../components/ui/StatCard.jsx';
import { usePeriodLocks } from '../../hooks/usePeriodLocks.js';

const currentPeriod = new Date().toISOString().slice(0, 7);

function statusTone(status) {
  return status === 'Locked' ? 'red' : 'gray';
}

export function ClosingPeriodPage() {
  const { error, items, loading, lockPeriod, unlockPeriod } = usePeriodLocks();
  const [period, setPeriod] = useState(currentPeriod);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const activeLocks = useMemo(() => items.filter((item) => item.status === 'Locked' && item.isActive !== false), [items]);
  const columns = [
    { key: 'period', label: 'Periode' },
    { key: 'status', label: 'Status', render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge> },
    { key: 'lockedAt', label: 'Dikunci Pada', render: (row) => row.lockedAt?.slice(0, 10) || '-' },
    { key: 'note', label: 'Catatan', render: (row) => row.note || '-' },
    {
      key: 'action',
      label: 'Aksi',
      render: (row) =>
        row.status === 'Locked' ? (
          <Button icon={Unlock} onClick={() => handleUnlock(row.period)} size="sm" type="button" variant="secondary">
            Unlock
          </Button>
        ) : (
          <span className="text-xs text-ios-secondary">Terbuka</span>
        ),
    },
  ];

  async function handleLock(event) {
    event.preventDefault();
    if (!period) return;

    setSaving(true);
    try {
      await lockPeriod({ period, note: note.trim() });
      setNote('');
    } finally {
      setSaving(false);
    }
  }

  async function handleUnlock(nextPeriod) {
    const confirmed = window.confirm(`Buka kembali periode ${nextPeriod}?`);
    if (!confirmed) return;

    setSaving(true);
    try {
      await unlockPeriod(nextPeriod);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Accounting Control"
        title="Closing Period"
        description="Kunci periode untuk mencegah posting, void, dan reversal pada bulan yang sudah ditutup."
        actions={<Badge tone="red">Posting lock</Badge>}
      />

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard icon={CalendarDays} label="Periode terkunci" value={String(activeLocks.length)} helper="Bulan yang tidak menerima posting." tone="red" />
        <StatCard label="Periode aktif" value={period || '-'} helper="Pilihan bulan pada form." tone="blue" />
        <StatCard label="Mode" value="Soft lock" helper="Data tidak dihapus atau diubah massal." tone="green" />
      </section>

      <form className="mt-7 rounded-2xl border border-ios-separator bg-white p-5 shadow-ios-subtle" onSubmit={handleLock}>
        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)_auto] lg:items-end">
          <TextField label="Periode" onChange={(event) => setPeriod(event.target.value)} type="month" value={period} />
          <TextArea
            className="lg:col-span-1"
            label="Catatan Closing"
            onChange={(event) => setNote(event.target.value)}
            placeholder="Contoh: Closing bulan berjalan setelah review laporan"
            value={note}
          />
          <Button icon={Lock} type="submit" disabled={saving || !period}>
            {saving ? 'Menyimpan...' : 'Lock Period'}
          </Button>
        </div>
      </form>

      {error ? (
        <div className="mt-5 rounded-2xl border border-ios-red/20 bg-ios-red/10 px-4 py-3 text-sm text-ios-red">{error}</div>
      ) : null}

      <section className="mt-7">
        {loading ? (
          <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
            Memuat closing period...
          </div>
        ) : items.length ? (
          <DataTable columns={columns} rows={items} />
        ) : (
          <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
            Belum ada periode yang dikunci.
          </div>
        )}
      </section>
    </div>
  );
}
