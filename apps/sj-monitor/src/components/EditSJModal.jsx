import { useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, Loader2, Save, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { computeCascadePlan, executeCascadePlan } from '../services/sjCascadeService.js';
import { EDITABLE_SJ_FIELDS } from '../utils/sjCascadeHelpers.js';

const springTransition = { type: 'spring', stiffness: 150, damping: 20 };

const FIELD_CONFIG = {
  nomorSJ: { label: 'Nomor SJ', type: 'text' },
  tanggalSJ: { label: 'Tanggal SJ', type: 'date' },
  truckId: { label: 'Armada / Truk', type: 'select', listKey: 'truckList', optionLabel: 'nomorPolisi' },
  supirId: { label: 'Supir', type: 'select', listKey: 'supirList', optionLabel: 'namaSupir' },
  ruteId: { label: 'Rute', type: 'select', listKey: 'ruteList', optionLabel: 'rute' },
  materialId: { label: 'Material', type: 'select', listKey: 'materialList', optionLabel: 'material' },
  qtyIsi: { label: 'Qty Isi', type: 'number' },
  qtyBongkar: { label: 'Qty Bongkar', type: 'number' },
  status: { label: 'Status', type: 'status' },
  tglTerkirim: { label: 'Tanggal Terkirim', type: 'date' },
  quantityLoss: { label: 'Quantity Loss', type: 'number' },
  abolishPenalty: { label: 'Abaikan Penalti', type: 'checkbox' },
};

const inputClassName =
  'w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white shadow-inner outline-none backdrop-blur-xl focus:border-blue-300 focus:ring-2 focus:ring-blue-300/30';

const secondaryButtonClassName =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white shadow-lg backdrop-blur-xl hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50 disabled:cursor-not-allowed disabled:opacity-50';

const primaryButtonClassName =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-blue-300/40 bg-blue-500/80 px-6 py-3 text-sm font-semibold text-white shadow-xl backdrop-blur-xl hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300/70 disabled:cursor-not-allowed disabled:opacity-50';

const createInitialChanges = (sj) =>
  EDITABLE_SJ_FIELDS.reduce((result, field) => {
    result[field] = field === 'abolishPenalty' ? Boolean(sj?.[field]) : sj?.[field];
    return result;
  }, {});

const formatValue = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const dateInputValue = (value) => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

function ChangeList({ changes }) {
  if (!changes?.length) {
    return <p className="text-sm text-white/60">Tidak ada perubahan nilai untuk ditampilkan.</p>;
  }

  return (
    <div className="space-y-2">
      {changes.map((change, index) => (
        <div
          key={`${change.field}-${index}`}
          className="grid gap-1 rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm sm:grid-cols-[minmax(120px,0.8fr)_minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center"
        >
          <span className="font-semibold text-white">{FIELD_CONFIG[change.field]?.label || change.field}</span>
          <span className="break-words text-white/65">{formatValue(change.before)}</span>
          <span className="hidden text-white/40 sm:inline" aria-hidden="true">
            &rarr;
          </span>
          <span className="break-words font-medium text-white">{formatValue(change.after)}</span>
        </div>
      ))}
    </div>
  );
}

export default function EditSJModal({ sj, masters, ctx, currentUser, onClose, onDone }) {
  const [changes, setChanges] = useState(() => createInitialChanges(sj));
  const [plan, setPlan] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  if (!sj) return null;

  const handleFieldChange = (field, value) => {
    setChanges((current) => ({ ...current, [field]: value }));
    setError('');
  };

  const handlePreview = () => {
    setError('');

    try {
      setPlan(computeCascadePlan(sj, changes, ctx));
      setConfirmed(false);
    } catch (previewError) {
      setError(previewError?.message || 'Gagal menghitung dampak perubahan.');
    }
  };

  const handleBack = () => {
    setPlan(null);
    setConfirmed(false);
    setError('');
  };

  const handleSave = async () => {
    if (!plan || !confirmed || isSaving) return;

    setIsSaving(true);
    setError('');

    try {
      await executeCascadePlan(plan, { currentUser });
      onDone?.(plan.sjAfter);
      onClose?.();
    } catch (saveError) {
      setError(saveError?.message || 'Gagal menyimpan perubahan Surat Jalan.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderField = (field) => {
    const config = FIELD_CONFIG[field];
    const fieldId = `edit-sj-${field}`;

    if (config.type === 'select') {
      return (
        <select
          id={fieldId}
          value={changes[field] ?? ''}
          onChange={(event) => handleFieldChange(field, event.target.value)}
          className={inputClassName}
        >
          <option value="" className="bg-slate-900 text-white">
            Pilih {config.label}
          </option>
          {(masters?.[config.listKey] || []).map((item) => (
            <option key={item.id} value={item.id} className="bg-slate-900 text-white">
              {item[config.optionLabel] || item.id}
            </option>
          ))}
        </select>
      );
    }

    if (config.type === 'status') {
      return (
        <select
          id={fieldId}
          value={changes[field] ?? ''}
          onChange={(event) => handleFieldChange(field, event.target.value)}
          className={inputClassName}
        >
          {['pending', 'terkirim', 'gagal'].map((status) => (
            <option key={status} value={status} className="bg-slate-900 text-white">
              {status}
            </option>
          ))}
        </select>
      );
    }

    if (config.type === 'checkbox') {
      return (
        <label
          htmlFor={fieldId}
          className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white backdrop-blur-xl focus-within:ring-2 focus-within:ring-blue-300/50"
        >
          <input
            id={fieldId}
            type="checkbox"
            checked={Boolean(changes[field])}
            onChange={(event) => handleFieldChange(field, event.target.checked)}
            className="h-5 w-5 cursor-pointer rounded border-white/30 bg-white/10 text-blue-500 focus:ring-blue-300"
          />
          <span>Ya, penalti quantity loss diabaikan</span>
        </label>
      );
    }

    return (
      <input
        id={fieldId}
        type={config.type}
        value={config.type === 'date' ? dateInputValue(changes[field]) : changes[field] ?? ''}
        onChange={(event) =>
          handleFieldChange(field, config.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)
        }
        className={inputClassName}
      />
    );
  };

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={springTransition}
      role="presentation"
    >
      <motion.div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/20 bg-white/10 p-6 text-white shadow-2xl backdrop-blur-xl"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={springTransition}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-sj-modal-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/15 pb-5">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-200">
              Khusus Superadmin &middot; Tahap {plan ? '2 dari 2' : '1 dari 2'}
            </p>
            <h2
              id="edit-sj-modal-title"
              className="text-2xl font-bold tracking-tight sm:text-3xl"
              style={{ fontFamily: "'SF Pro Display', Inter, sans-serif" }}
            >
              {plan ? 'Preview Dampak Cascade' : 'Edit Surat Jalan'}
            </h2>
            <p className="mt-1 text-sm text-white/65">
              {sj.nomorSJ || sj.id} &middot; Periksa seluruh perubahan sebelum diterapkan.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-white/10 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/60 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Tutup modal edit Surat Jalan"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-5 pr-1">
          {error && (
            <div role="alert" className="mb-5 flex gap-3 rounded-2xl border border-red-300/40 bg-red-500/20 p-4 text-sm text-red-50">
              <AlertTriangle className="mt-0.5 shrink-0" size={20} aria-hidden="true" />
              <div>
                <p className="font-bold">Perubahan tidak dapat diproses</p>
                <p className="mt-1">{error}</p>
              </div>
            </div>
          )}

          {!plan ? (
            <div className="grid gap-4 md:grid-cols-2">
              {EDITABLE_SJ_FIELDS.map((field) => (
                <div key={field} className={field === 'abolishPenalty' ? 'md:col-span-2' : ''}>
                  <label htmlFor={`edit-sj-${field}`} className="mb-2 block text-sm font-semibold text-white/85">
                    {FIELD_CONFIG[field]?.label || field}
                  </label>
                  {renderField(field)}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {plan.warnings?.length > 0 && (
                <section className="rounded-3xl border-2 border-yellow-300/70 bg-yellow-300/20 p-5 shadow-xl">
                  <div className="flex gap-3">
                    <AlertTriangle className="mt-0.5 shrink-0 text-yellow-200" size={24} aria-hidden="true" />
                    <div>
                      <h3 className="font-bold text-yellow-50">Peringatan keras</h3>
                      <ul className="mt-2 space-y-2 text-sm font-bold text-yellow-50">
                        {plan.warnings.map((warning, index) => (
                          <li key={`${warning}-${index}`}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </section>
              )}

              <section>
                <h3
                  className="mb-3 text-lg font-bold tracking-tight"
                  style={{ fontFamily: "'SF Pro Display', Inter, sans-serif" }}
                >
                  Perubahan Surat Jalan
                </h3>
                <ChangeList changes={plan.fieldChanges} />
              </section>

              <section>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3
                    className="text-lg font-bold tracking-tight"
                    style={{ fontFamily: "'SF Pro Display', Inter, sans-serif" }}
                  >
                    Dampak ke Data Terkait
                  </h3>
                  <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white/70">
                    {plan.impacts?.length || 0} data terdampak
                  </span>
                </div>

                {plan.impacts?.length ? (
                  <div className="space-y-4">
                    {plan.impacts.map((impact) => {
                      const isFinance = impact.severity === 'finance';
                      return (
                        <article
                          key={`${impact.collection}-${impact.docId}`}
                          className={`rounded-3xl border p-5 shadow-xl backdrop-blur-xl ${
                            isFinance ? 'border-red-300/60 bg-red-500/20' : 'border-white/20 bg-white/10'
                          }`}
                        >
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className={`font-bold ${isFinance ? 'text-red-50' : 'text-white'}`}>{impact.label}</p>
                              <p className="mt-1 text-xs text-white/55">
                                {impact.collection} &middot; {impact.docId}
                              </p>
                            </div>
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${
                                isFinance
                                  ? 'border-red-200/60 bg-red-500/30 text-red-50'
                                  : 'border-blue-200/50 bg-blue-500/20 text-blue-50'
                              }`}
                            >
                              {impact.op}
                            </span>
                          </div>
                          <ChangeList changes={impact.changes} />
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-3xl border border-emerald-300/30 bg-emerald-500/15 p-5 text-sm text-emerald-50">
                    <CheckCircle2 className="shrink-0" size={22} aria-hidden="true" />
                    Tidak ada data terkait yang perlu diubah.
                  </div>
                )}
              </section>

              <label className="flex cursor-pointer items-start gap-3 rounded-3xl border border-red-300/40 bg-red-500/15 p-5 text-sm font-semibold text-red-50 focus-within:ring-2 focus-within:ring-red-200/70">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  disabled={isSaving}
                  className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-red-200/50 bg-white/10 text-red-500 focus:ring-red-200 disabled:cursor-not-allowed"
                />
                <span>Saya paham perubahan ini juga mengubah data keuangan terkait.</span>
              </label>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-white/15 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onClose} disabled={isSaving} className={secondaryButtonClassName}>
            Batal
          </button>
          <div className="flex flex-col-reverse gap-3 sm:flex-row">
            {plan && (
              <button type="button" onClick={handleBack} disabled={isSaving} className={secondaryButtonClassName}>
                <ArrowLeft size={18} aria-hidden="true" />
                Kembali
              </button>
            )}
            {!plan ? (
              <button type="button" onClick={handlePreview} className={primaryButtonClassName}>
                <Eye size={18} aria-hidden="true" />
                Lihat Dampak
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSave}
                disabled={!confirmed || isSaving}
                className={primaryButtonClassName}
              >
                {isSaving ? (
                  <Loader2 size={18} aria-hidden="true" />
                ) : (
                  <Save size={18} aria-hidden="true" />
                )}
                {isSaving ? 'Menyimpan...' : 'Simpan & Terapkan'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
