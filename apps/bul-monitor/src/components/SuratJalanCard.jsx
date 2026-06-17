import { useState } from 'react';
import { CheckCircle, Edit, XCircle, RefreshCw, Send, Lock, Eye } from 'lucide-react';

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
  onKirimKeAccounting,
  formatCurrency,
  getStatusColor,
  getStatusIcon,
  isSelected = false,
  isSelectable = false,
  onToggleSelect,
  isBatalSelectable = false,
  isBatalSelected = false,
  onToggleBatalSelect,
}) => {
  const [expanded, setExpanded] = useState(false);

  const effectiveRole = (currentUser?.role === 'owner' ? 'reader' : currentUser?.role) || 'reader';


  const isLocked = ['menunggu_review', 'terkunci'].includes(suratJalan.status);

  const canMarkTerkirim = () => {
    if (isLocked) return false;
    if (effectiveRole === 'superadmin') return true;
    if (effectiveRole === 'admin_sj' && suratJalan.status === 'pending') return true;
    return false;
  };

  const canMarkGagal = () => {
    if (isLocked) return false;
    if (effectiveRole === 'superadmin') return true;
    if (effectiveRole === 'admin_sj' && (suratJalan.status === 'pending')) return true;
    return false;
  };

  const canEdit = () => {
    if (isLocked) return false;
    return effectiveRole === 'superadmin' && suratJalan.status === 'terkirim';
  };

  return (
    <div className={`bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition ${isSelected ? 'ring-2 ring-blue-500' : isBatalSelected ? 'ring-2 ring-red-400 bg-red-50' : ''}`}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              {isSelectable && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={onToggleSelect}
                  className="w-4 h-4 accent-blue-600 flex-shrink-0 cursor-pointer"
                  onClick={e => e.stopPropagation()}
                />
              )}
              {isBatalSelectable && (
                <input
                  type="checkbox"
                  checked={isBatalSelected}
                  onChange={onToggleBatalSelect}
                  className="w-4 h-4 accent-red-600 flex-shrink-0 cursor-pointer"
                  onClick={e => e.stopPropagation()}
                />
              )}
              <h3 className="text-xl font-bold text-gray-800">{suratJalan.nomorSJ}</h3>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold flex items-center space-x-1 ${getStatusColor(suratJalan.status)}`}>
                {getStatusIcon(suratJalan.status)}
                <span className="capitalize">{suratJalan.status}</span>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
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
                <p className="font-bold text-green-600">{formatCurrency(suratJalan.uangJalan || 0)}</p>
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
          
          <div className="flex flex-col space-y-2 ml-4">
            {canMarkTerkirim() && suratJalan.status === 'pending' && (
              <button
                onClick={() => onUpdate(suratJalan)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Tandai Terkirim</span>
              </button>
            )}
            {canEdit() && (
              <button
                onClick={() => onEditTerkirim(suratJalan)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <Edit className="w-4 h-4" />
                <span>Edit</span>
              </button>
            )}
            {canMarkGagal() && suratJalan.status !== 'gagal' && (
              <button
                onClick={() => onMarkGagal(suratJalan.id)}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <XCircle className="w-4 h-4" />
                <span>Tandai Gagal</span>
              </button>
            )}
            {effectiveRole === 'superadmin' && suratJalan.status === 'terkirim' && (
              <button
                onClick={() => onMarkGagal(suratJalan.id)}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <XCircle className="w-4 h-4" />
                <span>Batalkan (Gagal)</span>
              </button>
            )}
            {effectiveRole === 'superadmin' && suratJalan.status === 'gagal' && (
              <button
                onClick={() => onRestore(suratJalan.id)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Restore</span>
              </button>
            )}
            {effectiveRole === 'superadmin' &&
             suratJalan.status === 'terkirim' &&
             Number(suratJalan.uangJalan || 0) > 0 && (
              <button
                onClick={() => onKirimKeAccounting(suratJalan)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
              >
                <Send className="w-4 h-4" />
                <span>Kirim ke Accounting</span>
              </button>
            )}
            {suratJalan.status === 'menunggu_review' && (
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-3 py-2 rounded-lg text-xs text-center">
                <Send className="w-3 h-3 inline mr-1" />
                Menunggu review akuntan
              </div>
            )}
            {suratJalan.status === 'terkunci' && (
              <div className="bg-gray-100 border border-gray-300 text-gray-600 px-3 py-2 rounded-lg text-xs text-center">
                <Lock className="w-3 h-3 inline mr-1" />
                Sudah masuk Accounting
              </div>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm transition flex items-center space-x-1 whitespace-nowrap"
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
              <div className="grid grid-cols-2 gap-3 text-sm">
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
                      <p className="font-semibold text-gray-800">{suratJalan.updatedBy}</p>
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

export default SuratJalanCard;
