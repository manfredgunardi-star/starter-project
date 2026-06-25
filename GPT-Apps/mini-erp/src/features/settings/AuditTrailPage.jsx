import { useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { SearchInput } from '../../components/forms/SearchInput.jsx';
import { SelectField } from '../../components/forms/SelectField.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Drawer } from '../../components/ui/Drawer.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { StatCard } from '../../components/ui/StatCard.jsx';
import { useAuditLogs } from '../../hooks/useAuditLogs.js';

function actionTone(action) {
  if (!action) return 'gray';
  if (action.includes('void') || action.includes('unlock')) return 'red';
  if (action.includes('approve') || action.includes('post') || action.includes('lock')) return 'green';
  return 'blue';
}

const columns = [
  { key: 'createdAt', label: 'Waktu', render: (row) => row.createdAt?.replace('T', ' ').slice(0, 19) || '-' },
  { key: 'action', label: 'Aksi', render: (row) => <Badge tone={actionTone(row.action)}>{row.action}</Badge> },
  { key: 'collectionName', label: 'Collection' },
  { key: 'documentId', label: 'Dokumen' },
  { key: 'actorName', label: 'Actor', render: (row) => row.actorName || row.actorId || '-' },
];

function JsonBlock({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">{label}</p>
      <pre className="mt-2 max-h-72 overflow-auto rounded-2xl border border-ios-separator bg-white p-4 text-xs leading-5 text-ios-label shadow-ios-subtle">
        {value ? JSON.stringify(value, null, 2) : '-'}
      </pre>
    </div>
  );
}

export function AuditTrailPage() {
  const { error, items, loading } = useAuditLogs();
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState(null);

  const filterOptions = useMemo(() => {
    const modules = [...new Set(items.map((item) => item.collectionName).filter(Boolean))].sort();
    const actions = [...new Set(items.map((item) => item.action).filter(Boolean))].sort();
    const actors = [
      ...new Set(
        items
          .map((item) => item.actorName || item.actorId)
          .filter(Boolean)
      ),
    ].sort();

    return { actions, actors, modules };
  }, [items]);

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter((row) => {
      const actorLabel = row.actorName || row.actorId || '';
      const matchesModule = moduleFilter === 'all' || row.collectionName === moduleFilter;
      const matchesAction = actionFilter === 'all' || row.action === actionFilter;
      const matchesActor = actorFilter === 'all' || actorLabel === actorFilter;
      const matchesQuery =
        !normalizedQuery ||
        [row.action, row.collectionName, row.documentId, row.actorName, row.actorId]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));

      return matchesModule && matchesAction && matchesActor && matchesQuery;
    });
  }, [actionFilter, actorFilter, items, moduleFilter, query]);
  const postCount = rows.filter((item) => item.action?.includes('post')).length;
  const approveCount = rows.filter((item) => item.action?.includes('approve')).length;
  const voidCount = rows.filter((item) => item.action?.includes('void')).length;

  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Audit Trail"
        description="Riwayat aksi penting untuk posting, approval, void, reversal, dan closing period."
        actions={<Badge tone="blue">Read only</Badge>}
      />

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard icon={History} label="Total log" value={String(rows.length)} helper="Sesuai filter aktif." tone="blue" />
        <StatCard label="Approval" value={String(approveCount)} helper="Dokumen disetujui." tone="green" />
        <StatCard label="Posting" value={String(postCount)} helper="Dokumen masuk ledger." tone="orange" />
        <StatCard label="Void" value={String(voidCount)} helper="Reversal dibuat." tone="red" />
      </section>

      <div className="my-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_220px]">
        <SearchInput className="" onChange={setQuery} placeholder="Cari aksi, collection, dokumen, atau actor" value={query} />
        <SelectField
          aria-label="Filter Modul Audit"
          label="Modul"
          onChange={(event) => setModuleFilter(event.target.value)}
          value={moduleFilter}
        >
          <option value="all">Semua modul</option>
          {filterOptions.modules.map((module) => (
            <option key={module} value={module}>{module}</option>
          ))}
        </SelectField>
        <SelectField
          aria-label="Filter Aksi Audit"
          label="Aksi"
          onChange={(event) => setActionFilter(event.target.value)}
          value={actionFilter}
        >
          <option value="all">Semua aksi</option>
          {filterOptions.actions.map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </SelectField>
        <SelectField
          aria-label="Filter Actor Audit"
          label="Actor"
          onChange={(event) => setActorFilter(event.target.value)}
          value={actorFilter}
        >
          <option value="all">Semua actor</option>
          {filterOptions.actors.map((actor) => (
            <option key={actor} value={actor}>{actor}</option>
          ))}
        </SelectField>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-ios-red/20 bg-ios-red/10 px-4 py-3 text-sm text-ios-red">{error}</div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
          Memuat audit trail...
        </div>
      ) : rows.length ? (
        <DataTable columns={columns} rows={rows} onRowClick={setSelectedLog} />
      ) : (
        <div className="rounded-2xl border border-ios-separator bg-white p-8 text-sm text-ios-secondary shadow-ios-subtle">
          Belum ada audit trail untuk filter ini.
        </div>
      )}

      <Drawer
        description="Audit log bersifat read-only untuk menelusuri perubahan dokumen."
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setSelectedLog(null)} type="button" variant="secondary">Tutup</Button>
          </div>
        }
        onClose={() => setSelectedLog(null)}
        open={Boolean(selectedLog)}
        title="Detail Audit"
      >
        {selectedLog ? (
          <div className="space-y-5">
            <div className="rounded-2xl bg-ios-grouped p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Waktu</p>
                  <p className="mt-1 text-sm text-ios-label">{selectedLog.createdAt?.replace('T', ' ').slice(0, 19) || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Aksi</p>
                  <div className="mt-1"><Badge tone={actionTone(selectedLog.action)}>{selectedLog.action}</Badge></div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Collection</p>
                  <p className="mt-1 text-sm text-ios-label">{selectedLog.collectionName || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Dokumen</p>
                  <p className="mt-1 text-sm text-ios-label">{selectedLog.documentId || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Actor</p>
                  <p className="mt-1 text-sm text-ios-label">{selectedLog.actorName || selectedLog.actorId || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">Log ID</p>
                  <p className="mt-1 text-sm text-ios-label">{selectedLog.id || '-'}</p>
                </div>
              </div>
            </div>
            <JsonBlock label="Metadata" value={selectedLog.metadata} />
            <JsonBlock label="Before" value={selectedLog.before} />
            <JsonBlock label="After" value={selectedLog.after} />
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
