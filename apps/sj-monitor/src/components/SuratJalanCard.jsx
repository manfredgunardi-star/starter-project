// src/components/SuratJalanCard.jsx
import React, { useState } from 'react';
import { CheckCircle, XCircle, Edit, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import SwipeableRow from './SwipeableRow.jsx';

const SuratJalanCard = ({
  suratJalan,
  biayaList,
  totalBiaya,
  currentUser,
  onUpdate,
  onMarkGagal,
  onRestore,
  onEditTerkirim,
  onDeleteBiaya,
  formatCurrency,
  getStatusColor,
  getStatusIcon
}) => {
  const [expanded, setExpanded] = useState(false);

  const effectiveRole = (currentUser?.role === 'owner' ? 'reader' : currentUser?.role) || 'reader';

  const canMarkTerkirim = () => {
    if (effectiveRole === 'superadmin') return true;
    if (effectiveRole === 'admin_sj' && suratJalan.status === 'pending') return true;
    return false;
  };

  const canMarkGagal = () => {
    if (effectiveRole === 'superadmin') return true;
    if (effectiveRole === 'admin_sj' && (suratJalan.status === 'pending')) return true;
    return false;
  };

  const canEdit = () => {
    return effectiveRole === 'superadmin' && suratJalan.status === 'terkirim';
  };

  const swipeActions = [];

  if (canEdit()) {
    swipeActions.push({
      label: 'Edit',
      icon: <Edit className="h-5 w-5" />,
      color: '#2563eb',
      onClick: () => onEditTerkirim(suratJalan),
    });
  }

  if (canMarkGagal() && suratJalan.status !== 'gagal') {
    swipeActions.push({
      label: suratJalan.status === 'terkirim' ? 'Batalkan' : 'Tandai Gagal',
      icon: <XCircle className="h-5 w-5" />,
      color: suratJalan.status === 'terkirim' ? '#ea580c' : '#dc2626',
      onClick: () => onMarkGagal(suratJalan.id),
    });
  }

  if (effectiveRole === 'superadmin' && suratJalan.status === 'gagal') {
    swipeActions.push({
      label: 'Restore',
      icon: <RefreshCw className="h-5 w-5" />,
      color: '#16a34a',
      onClick: () => onRestore(suratJalan.id),
    });
  }

  const tanggalSJ = suratJalan.tanggalSJ
    ? new Date(suratJalan.tanggalSJ).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
    : '-';

  const tanggalTerkirim = suratJalan.tglTerkirim
    ? new Date(suratJalan.tglTerkirim).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
    : null;

  const toggleExpanded = () => {
    setExpanded((current) => !current);
  };

  return (
    <SwipeableRow actions={swipeActions}>
      <div
        className="border-0 rounded-none bg-white px-3 py-3 transition sm:px-5 sm:py-4"
        onClick={toggleExpanded}
        aria-expanded={expanded}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex min-w-0 items-center gap-2">
              <h3 className="truncate text-base font-bold tracking-normal text-gray-900 sm:text-lg">
                {suratJalan.nomorSJ}
              </h3>
              <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize sm:text-xs ${getStatusColor(suratJalan.status)}`}>
                {getStatusIcon(suratJalan.status)}
                <span>{suratJalan.status}</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              <span>{tanggalSJ}</span>
              <span className="font-medium text-gray-700">{suratJalan.nomorPolisi || '-'}</span>
              <span className="truncate">{suratJalan.pt || '-'}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {canMarkTerkirim() && suratJalan.status === 'pending' && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdate(suratJalan);
                }}
                className="flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-1 text-[11px] font-semibold tracking-normal text-white transition hover:bg-green-700 sm:px-3 sm:py-1.5 sm:text-xs"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                <span>Terkirim</span>
              </button>
            )}
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </div>
        </div>

        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-800">{suratJalan.rute || '-'}</p>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {suratJalan.namaSupir || '-'} / {suratJalan.material || '-'} ({suratJalan.qtyIsi || 0} {suratJalan.satuan || ''})
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-normal text-gray-400">Uang Jalan</p>
            <p className="text-sm font-bold text-blue-600">{formatCurrency(suratJalan.uangJalan || 0)}</p>
          </div>
        </div>

        {suratJalan.status === 'terkirim' && (
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs">
            <div>
              <p className="text-green-700/70">Tgl Terkirim</p>
              <p className="font-semibold text-green-800">{tanggalTerkirim || '-'}</p>
            </div>
            <div>
              <p className="text-green-700/70">Qty Bongkar</p>
              <p className="font-semibold text-green-800">{suratJalan.qtyBongkar || 0} {suratJalan.satuan || ''}</p>
            </div>
          </div>
        )}

        {expanded && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <div className="grid grid-cols-2 gap-2 text-xs sm:gap-3 sm:text-sm">
              <div>
                <p className="text-gray-600">Supir / PT:</p>
                <p className="font-semibold text-gray-800">{suratJalan.namaSupir || '-'} / {suratJalan.pt || '-'}</p>
              </div>
              <div>
                <p className="text-gray-600">Rute:</p>
                <p className="font-semibold text-gray-800">{suratJalan.rute || '-'}</p>
              </div>
              <div>
                <p className="text-gray-600">Material / Qty Isi:</p>
                <p className="font-semibold text-gray-800">{suratJalan.material || '-'} ({suratJalan.qtyIsi || 0} {suratJalan.satuan || ''})</p>
              </div>
              <div>
                <p className="text-gray-600">Nomor Polisi:</p>
                <p className="font-semibold text-gray-800">{suratJalan.nomorPolisi || '-'}</p>
              </div>
              {suratJalan.status === 'terkirim' && (
                <>
                  <div>
                    <p className="text-gray-600">Tgl Terkirim:</p>
                    <p className="font-semibold text-green-700">{suratJalan.tglTerkirim ? new Date(suratJalan.tglTerkirim).toLocaleDateString('id-ID') : '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Qty Bongkar:</p>
                    <p className="font-semibold text-green-700">{suratJalan.qtyBongkar || 0} {suratJalan.satuan || ''}</p>
                  </div>
                </>
              )}
            </div>

            <div className="mt-4">
              <h4 className="mb-2 font-semibold text-gray-800">Detail Lengkap:</h4>
              <div className="grid grid-cols-2 gap-2 text-xs sm:gap-3 sm:text-sm">
                <div>
                  <p className="text-gray-600">Dibuat oleh:</p>
                  <p className="font-semibold text-gray-800">{suratJalan.createdBy}</p>
                </div>
                <div>
                  <p className="text-gray-600">Tanggal Dibuat:</p>
                  <p className="font-semibold text-gray-800">{new Date(suratJalan.createdAt).toLocaleString('id-ID')}</p>
                </div>
                {suratJalan.updatedAt && (
                  <>
                    <div>
                      <p className="text-gray-600">Diupdate oleh:</p>
                      <p className="font-semibold text-gray-800">{suratJalan.updatedBy || '-'}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Tanggal Update:</p>
                      <p className="font-semibold text-gray-800">{new Date(suratJalan.updatedAt).toLocaleString('id-ID')}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </SwipeableRow>
  );
};

export default React.memo(SuratJalanCard, (prev, next) => {
  return (
    prev.suratJalan?.id === next.suratJalan?.id &&
    prev.suratJalan?.updatedAt === next.suratJalan?.updatedAt &&
    prev.suratJalan?.status === next.suratJalan?.status &&
    prev.totalBiaya === next.totalBiaya
  );
});
