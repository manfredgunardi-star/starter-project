// src/components/SuratJalanCard.jsx
import React, { useState } from 'react';
import { CheckCircle, XCircle, Edit, Trash2, Eye, RefreshCw } from 'lucide-react';

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

  return (
    <div className="border-0 rounded-none overflow-hidden transition">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-3 mb-2">
              <h3 className="text-lg sm:text-xl font-bold text-gray-800 truncate">{suratJalan.nomorSJ}</h3>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center space-x-1 ${getStatusColor(suratJalan.status)}`}>
                {getStatusIcon(suratJalan.status)}
                <span className="capitalize">{suratJalan.status}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
              <div>
                <p className="text-gray-600">Tgl SJ:</p>
                <p className="font-semibold text-gray-800">{suratJalan.tanggalSJ ? new Date(suratJalan.tanggalSJ).toLocaleDateString('id-ID') : '-'}</p>
              </div>
              <div>
                <p className="text-gray-600">Nomor Polisi:</p>
                <p className="font-semibold text-gray-800">{suratJalan.nomorPolisi || '-'}</p>
              </div>
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
                <p className="text-gray-600">Uang Jalan:</p>
                <p className="font-bold text-blue-600">{formatCurrency(suratJalan.uangJalan || 0)}</p>
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
          </div>

          <div className="flex flex-wrap gap-2 sm:flex-col sm:gap-2 sm:ml-4">
            {canMarkTerkirim() && suratJalan.status === 'pending' && (
              <button
                onClick={() => onUpdate(suratJalan)}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Tandai Terkirim</span>
              </button>
            )}
            {canEdit() && (
              <button
                onClick={() => onEditTerkirim(suratJalan)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <Edit className="w-4 h-4" />
                <span>Edit</span>
              </button>
            )}
            {canMarkGagal() && suratJalan.status !== 'gagal' && (
              <button
                onClick={() => onMarkGagal(suratJalan.id)}
                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <XCircle className="w-4 h-4" />
                <span>Tandai Gagal</span>
              </button>
            )}
            {effectiveRole === 'superadmin' && suratJalan.status === 'terkirim' && (
              <button
                onClick={() => onMarkGagal(suratJalan.id)}
                className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <XCircle className="w-4 h-4" />
                <span>Batalkan (Gagal)</span>
              </button>
            )}
            {effectiveRole === 'superadmin' && suratJalan.status === 'gagal' && (
              <button
                onClick={() => onRestore(suratJalan.id)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Restore</span>
              </button>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm transition flex items-center space-x-1 whitespace-nowrap"
            >
              <Eye className="w-4 h-4" />
              <span>{expanded ? 'Tutup' : 'Detail'}</span>
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="mb-4">
              <h4 className="font-semibold text-gray-800 mb-2">Detail Lengkap:</h4>
              <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
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
    </div>
  );
};

export default React.memo(SuratJalanCard, (prev, next) => {
  return (
    prev.suratJalan?.id === next.suratJalan?.id &&
    prev.suratJalan?.updatedAt === next.suratJalan?.updatedAt &&
    prev.suratJalan?.status === next.suratJalan?.status
  );
});
