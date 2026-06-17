import React, { useState, useEffect } from 'react';
import { Package, CheckCircle, XCircle, Search } from 'lucide-react';
import SearchableSelect from './SearchableSelect.jsx';

const Modal = ({ type, selectedItem, currentUser, setAlertMessage, truckList = [], supirList = [], ruteList = [], materialList = [], suratJalanList = [], pelangganList = [], onClose, onSubmit }) => {
  const [searchInvoiceSJ, setSearchInvoiceSJ] = useState('');
  const initializedRef = React.useRef(false);
  const [biayaTambahanItems, setBiayaTambahanItems] = useState([]);
  const [biayaInput, setBiayaInput] = useState({ jenisBiaya: '', nominal: '', keteranganBiaya: '' });
  const [formData, setFormData] = useState({
    nomorSJ: '',
    tanggalSJ: new Date().toISOString().split('T')[0],
    truckId: '',
    supirId: '',
    ruteId: '',
    materialId: '',
    qtyIsi: '',
    tglTerkirim: selectedItem?.tglTerkirim || new Date().toISOString().split('T')[0],
    qtyBongkar: selectedItem?.qtyBongkar || '',
    noInvoice: '',
    tglInvoice: new Date().toISOString().split('T')[0],
    selectedSJIds: [],
    jenisBiaya: '',
    nominal: '',
    keteranganBiaya: '',
    username: selectedItem?.username || '',
    password: '',
    name: selectedItem?.name || '',
    role: selectedItem?.role || '',
    tipe: '',
    tanggal: new Date().toISOString().split('T')[0],
    keteranganTransaksi: '',
    nomorPolisi: selectedItem?.nomorPolisi || '',
    isActive: selectedItem?.isActive !== undefined ? selectedItem.isActive : true,
    namaSupir: selectedItem?.namaSupir || '',
    pt: selectedItem?.pt || '',
    rute: selectedItem?.rute || '',
    uangJalan: selectedItem?.uangJalan || '',
    material: selectedItem?.material || '',
    satuan: selectedItem?.satuan || '',
    hargaSatuan: '',
    hargaPerGroup: {},
    pelangganId: ''
  });

  // Initialize selectedSJIds untuk editInvoice
  useEffect(() => {
    if (type === 'editInvoice' && selectedItem && !initializedRef.current) {
      const hargaPerGroupObj = {};
      (selectedItem.hargaPerGroup || []).forEach(g => {
        hargaPerGroupObj[`${g.material}|${g.rute}`] = String(g.hargaSatuan);
      });
      setFormData(prev => ({
        ...prev,
        noInvoice: selectedItem.noInvoice || '',
        tglInvoice: selectedItem.tglInvoice || new Date().toISOString().split('T')[0],
        selectedSJIds: selectedItem.suratJalanIds || [],
        hargaSatuan: selectedItem.hargaSatuan != null ? String(selectedItem.hargaSatuan) : '',
        hargaPerGroup: hargaPerGroupObj,
        pelangganId: selectedItem.pelangganId || ''
      }));
      initializedRef.current = true;
    }
    
    // Reset ref saat modal dibuka untuk type lain
    if (type !== 'editInvoice') {
      initializedRef.current = false;
    }
  }, [type, selectedItem]);

  const handleSubmit = () => {
    if (type === 'addSJ') {
      // Validasi semua 9 field wajib diisi
      if (!formData.nomorSJ || !formData.tanggalSJ || !formData.truckId || 
          !formData.supirId || !formData.ruteId || !formData.materialId || !formData.qtyIsi) {
        setAlertMessage('Semua field wajib diisi!\n\nPastikan Anda sudah mengisi:\n1. Nomor SJ\n2. Tanggal SJ\n3. Nomor Polisi (Truck)\n4. Nama Supir\n5. Rute\n6. Material\n7. Qty Isi');
        return;
      }
      
      if (parseFloat(formData.qtyIsi) <= 0) {
        setAlertMessage('Qty Isi harus lebih besar dari 0!');
        return;
      }
      
      onSubmit(formData);
    } else if (type === 'markTerkirim' || type === 'editTerkirim') {
      // Validasi field wajib
      if (!formData.tglTerkirim || !formData.qtyBongkar) {
        setAlertMessage('Tgl Terkirim dan Qty Bongkar wajib diisi!');
        return;
      }
      
      // Validasi Tgl Terkirim tidak boleh lebih awal dari Tgl SJ
      const tglSJ = new Date(selectedItem.tanggalSJ);
      const tglTerkirim = new Date(formData.tglTerkirim);
      if (tglTerkirim < tglSJ) {
        setAlertMessage('Tgl Terkirim tidak boleh lebih awal dari Tgl SJ!\n\nTgl SJ: ' + new Date(selectedItem.tanggalSJ).toLocaleDateString('id-ID'));
        return;
      }
      
      // Validasi Qty Bongkar tidak boleh lebih besar dari Qty Isi
      const qtyBongkar = parseFloat(formData.qtyBongkar);
      const qtyIsi = parseFloat(selectedItem.qtyIsi);
      if (qtyBongkar > qtyIsi) {
        setAlertMessage('Qty Bongkar tidak boleh lebih besar dari Qty Isi!\n\nQty Isi: ' + qtyIsi + ' ' + selectedItem.satuan);
        return;
      }
      
      if (qtyBongkar <= 0) {
        setAlertMessage('Qty Bongkar harus lebih besar dari 0!');
        return;
      }

      onSubmit({ ...formData, biayaTambahan: biayaTambahanItems });
    } else if (type === 'addInvoice' || type === 'editInvoice') {
      if (!formData.noInvoice || !formData.tglInvoice) {
        setAlertMessage('No Invoice dan Tgl Invoice wajib diisi!');
        return;
      }
      if (!formData.pelangganId) {
        setAlertMessage('Pelanggan wajib dipilih!');
        return;
      }
      if (formData.selectedSJIds.length === 0) {
        setAlertMessage('Pilih minimal 1 Surat Jalan untuk invoice!');
        return;
      }
      const selectedSJs = suratJalanList.filter(sj => formData.selectedSJIds.includes(sj.id));
      const groups = [...new Set(selectedSJs.map(sj => `${sj.material}|${sj.rute}`))];
      if (groups.length > 1) {
        const missingGroup = groups.find(g => {
          const h = parseFloat(formData.hargaPerGroup?.[g]);
          return !h || h <= 0;
        });
        if (missingGroup) {
          const [mat, rut] = missingGroup.split('|');
          setAlertMessage(`Harga Jual untuk material "${mat}" rute "${rut}" wajib diisi dan harus lebih besar dari 0!`);
          return;
        }
        const hargaPerGroupArr = groups.map(g => {
          const [material, rute] = g.split('|');
          return { material, rute, hargaSatuan: parseFloat(formData.hargaPerGroup[g]) };
        });
        onSubmit({ ...formData, hargaSatuan: null, hargaPerGroup: hargaPerGroupArr });
      } else {
        const harga = parseFloat(formData.hargaSatuan);
        if (!formData.hargaSatuan || isNaN(harga) || harga <= 0) {
          setAlertMessage('Harga Jual per Satuan wajib diisi dan harus lebih besar dari 0!');
          return;
        }
        onSubmit({ ...formData, hargaSatuan: harga, hargaPerGroup: null });
      }
    } else if (type === 'addTransaksi') {
      if (!formData.tipe || !formData.pt || !formData.nominal || !formData.keteranganTransaksi) {
        setAlertMessage('Tipe, PT, Nominal, dan Keterangan harus diisi!');
        return;
      }
      onSubmit({
        tipe: formData.tipe,
        pt: formData.pt,
        nominal: parseFloat(formData.nominal),
        keterangan: formData.keteranganTransaksi,
        tanggal: formData.tanggal
      });
    } else if (type === 'addUser' || type === 'editUser') {
      if (!formData.username || !formData.name || !formData.role) {
        setAlertMessage('Username, Nama Lengkap, dan Role harus diisi!');
        return;
      }
      if (type === 'addUser' && !formData.password) {
        setAlertMessage('Password harus diisi!');
        return;
      }
      
      const userData = {
        username: formData.username,
        name: formData.name,
        role: formData.role
      };
      
      if (formData.password) {
        userData.password = formData.password;
      }
      
      onSubmit(userData);
    } else if (type === 'addTruck' || type === 'editTruck') {
      if (!formData.nomorPolisi) {
        setAlertMessage('Nomor Polisi harus diisi!');
        return;
      }
      onSubmit({
        nomorPolisi: formData.nomorPolisi,
        isActive: formData.isActive
      });
    } else if (type === 'addSupir' || type === 'editSupir') {
      if (!formData.namaSupir || !formData.pt) {
        setAlertMessage('Nama Supir dan PT harus diisi!');
        return;
      }
      onSubmit({
        namaSupir: formData.namaSupir,
        pt: formData.pt,
        isActive: formData.isActive
      });
    } else if (type === 'addRute' || type === 'editRute') {
      if (!formData.rute || !formData.uangJalan) {
        setAlertMessage('Rute dan Uang Jalan harus diisi!');
        return;
      }
      onSubmit({
        rute: formData.rute,
        uangJalan: parseFloat(formData.uangJalan)
      });
    } else if (type === 'addMaterial' || type === 'editMaterial') {
      if (!formData.material || !formData.satuan) {
        setAlertMessage('Material dan Satuan harus diisi!');
        return;
      }
      onSubmit({
        material: formData.material,
        satuan: formData.satuan
      });
    } else if (type === 'addPelanggan' || type === 'editPelanggan') {
      if (!formData.name?.trim()) {
        setAlertMessage('Nama pelanggan wajib diisi!');
        return;
      }
      onSubmit({
        name: formData.name.trim(),
        address: formData.address || '',
        npwp: formData.npwp || '',
      });
    }
  };

  const getModalTitle = () => {
    if (type === 'addSJ') return 'Tambah Surat Jalan Baru';
    if (type === 'markTerkirim') return 'Tandai Surat Jalan Terkirim';
    if (type === 'editTerkirim') return 'Edit Data Pengiriman';
    if (type === 'addInvoice') return 'Buat Invoice Baru';
    if (type === 'editInvoice') return 'Edit Invoice';
    if (type === 'addTransaksi') return 'Tambah Transaksi Kas';
    if (type === 'addUser') return 'Tambah User Baru';
    if (type === 'editUser') return 'Edit User';
    if (type === 'addTruck') return 'Tambah Truck Baru';
    if (type === 'editTruck') return 'Edit Truck';
    if (type === 'addSupir') return 'Tambah Supir Baru';
    if (type === 'editSupir') return 'Edit Supir';
    if (type === 'addRute') return 'Tambah Rute Baru';
    if (type === 'editRute') return 'Edit Rute';
    if (type === 'addMaterial') return 'Tambah Material Baru';
    if (type === 'editMaterial') return 'Edit Material';
    if (type === 'addPelanggan') return 'Tambah Pelanggan Baru';
    if (type === 'editPelanggan') return 'Edit Pelanggan';
    return 'Form';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className={`bg-white rounded-lg shadow-xl ${(type === 'addSJ' || type === 'markTerkirim' || type === 'editTerkirim' || type === 'addInvoice') ? 'max-w-2xl' : 'max-w-md'} w-full p-6 max-h-[90vh] overflow-y-auto`}>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          {getModalTitle()}
        </h2>
        
        <div className="space-y-4">
          {type === 'addSJ' ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">1. Nomor SJ *</label>
                  <input
                    type="text"
                    value={formData.nomorSJ}
                    onChange={(e) => setFormData({ ...formData, nomorSJ: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="Contoh: SJ/2024/001"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">2. Tanggal SJ *</label>
                  <input
                    type="date"
                    value={formData.tanggalSJ}
                    onChange={(e) => setFormData({ ...formData, tanggalSJ: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>
              
              <SearchableSelect
                options={truckList.filter(t => t.isActive)}
                value={formData.truckId}
                onChange={(value) => setFormData({ ...formData, truckId: value })}
                placeholder="Pilih Nomor Polisi"
                label="3. Nomor Polisi"
                displayKey="nomorPolisi"
                valueKey="id"
              />
              
              <SearchableSelect
                options={supirList.filter(s => s.isActive)}
                value={formData.supirId}
                onChange={(value) => setFormData({ ...formData, supirId: value })}
                placeholder="Pilih Nama Supir"
                label="4. Nama Supir"
                displayKey="namaSupir"
                valueKey="id"
              />
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">5. PT (Auto-fill)</label>
                <input
                  type="text"
                  value={supirList.find(s => s.id === formData.supirId)?.pt || '-'}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                />
              </div>
              
              <SearchableSelect
                options={ruteList.map(r => ({
                  ...r,
                  displayName: `${r.rute} - Rp ${new Intl.NumberFormat('id-ID').format(r.uangJalan)}`
                }))}
                value={formData.ruteId}
                onChange={(value) => setFormData({ ...formData, ruteId: value })}
                placeholder="Pilih Rute"
                label="6. Rute"
                displayKey="displayName"
                valueKey="id"
              />
              
              <SearchableSelect
                options={materialList}
                value={formData.materialId}
                onChange={(value) => setFormData({ ...formData, materialId: value })}
                placeholder="Pilih Material"
                label="7. Material"
                displayKey="material"
                valueKey="id"
              />
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">8. Satuan (Auto-fill)</label>
                  <input
                    type="text"
                    value={materialList.find(m => m.id === formData.materialId)?.satuan || '-'}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">9. Qty Isi *</label>
                  <input
                    type="number"
                    value={formData.qtyIsi}
                    onChange={(e) => setFormData({ ...formData, qtyIsi: e.target.value })}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="Contoh: 100"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg mt-2">
                <p className="text-sm text-green-800 font-semibold mb-2">📝 Informasi:</p>
                <ul className="text-xs text-green-700 space-y-1">
                  <li>• Semua field bertanda (*) wajib diisi</li>
                  <li>• Uang Jalan akan otomatis dicatat sebagai pengeluaran</li>
                  <li>• Status awal akan menjadi "Pending"</li>
                  <li>• Gunakan fitur search untuk mencari data lebih cepat</li>
                </ul>
              </div>
            </>
          ) : type === 'markTerkirim' || type === 'editTerkirim' ? (
            <>
              {/* Info Surat Jalan */}
              <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg mb-4">
                <h3 className="font-semibold text-green-900 mb-3">📋 Informasi Surat Jalan</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-green-700 font-medium">Nomor SJ:</p>
                    <p className="text-green-900 font-bold">{selectedItem?.nomorSJ}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-medium">Tgl SJ:</p>
                    <p className="text-green-900 font-bold">{selectedItem?.tanggalSJ ? new Date(selectedItem.tanggalSJ).toLocaleDateString('id-ID') : '-'}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-medium">Nomor Polisi:</p>
                    <p className="text-green-900 font-bold">{selectedItem?.nomorPolisi}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-medium">Rute:</p>
                    <p className="text-green-900 font-bold">{selectedItem?.rute}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-medium">Material:</p>
                    <p className="text-green-900 font-bold">{selectedItem?.material}</p>
                  </div>
                  <div>
                    <p className="text-green-700 font-medium">Satuan:</p>
                    <p className="text-green-900 font-bold">{selectedItem?.satuan}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-green-700 font-medium">Qty Isi:</p>
                    <p className="text-green-900 font-bold text-lg">{selectedItem?.qtyIsi} {selectedItem?.satuan}</p>
                  </div>
                </div>
              </div>

              {/* Form Input */}
              <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded-lg">
                <h3 className="font-semibold text-green-900 mb-3">✍️ Data Pengiriman</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tgl Terkirim *
                      <span className="text-xs text-gray-500 ml-2">(tidak boleh lebih awal dari Tgl SJ)</span>
                    </label>
                    <input
                      type="date"
                      value={formData.tglTerkirim}
                      onChange={(e) => setFormData({ ...formData, tglTerkirim: e.target.value })}
                      min={selectedItem?.tanggalSJ}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Qty Bongkar *
                      <span className="text-xs text-gray-500 ml-2">(max: {selectedItem?.qtyIsi} {selectedItem?.satuan})</span>
                    </label>
                    <input
                      type="number"
                      value={formData.qtyBongkar}
                      onChange={(e) => setFormData({ ...formData, qtyBongkar: e.target.value })}
                      onWheel={(e) => e.currentTarget.blur()}
                      max={selectedItem?.qtyIsi}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                      placeholder={`Contoh: ${selectedItem?.qtyIsi}`}
                    />
                  </div>
                </div>
              </div>

              {/* Biaya Tambahan — hanya saat markTerkirim */}
              {type === 'markTerkirim' && (
                <div className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                  <h3 className="font-semibold text-orange-900 mb-3 text-sm">Biaya Tambahan <span className="font-normal text-orange-600">(opsional)</span></h3>
                  {biayaTambahanItems.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {biayaTambahanItems.map(b => (
                        <div key={b.tempId} className="flex items-center justify-between bg-white rounded p-2 border border-orange-200 text-sm">
                          <div>
                            <span className="font-semibold">{b.jenisBiaya}</span>
                            {b.keteranganBiaya && <span className="text-gray-500 ml-1">— {b.keteranganBiaya}</span>}
                            <span className="ml-2 text-orange-700 font-bold">Rp {Number(b.nominal).toLocaleString('id-ID')}</span>
                          </div>
                          <button
                            onClick={() => setBiayaTambahanItems(prev => prev.filter(x => x.tempId !== b.tempId))}
                            className="text-red-500 hover:text-red-700 ml-2 text-xs"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Jenis Biaya (mis: Solar, Tol, Bonus Ritasi)"
                      value={biayaInput.jenisBiaya}
                      onChange={(e) => setBiayaInput({ ...biayaInput, jenisBiaya: e.target.value })}
                      className="w-full px-3 py-2 border border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        placeholder="Nominal (Rp)"
                        value={biayaInput.nominal}
                        onChange={(e) => setBiayaInput({ ...biayaInput, nominal: e.target.value })}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="flex-1 px-3 py-2 border border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400"
                      />
                      <input
                        type="text"
                        placeholder="Keterangan (opsional)"
                        value={biayaInput.keteranganBiaya}
                        onChange={(e) => setBiayaInput({ ...biayaInput, keteranganBiaya: e.target.value })}
                        className="flex-1 px-3 py-2 border border-orange-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-400"
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (!biayaInput.jenisBiaya || !biayaInput.nominal || parseFloat(biayaInput.nominal) <= 0) return;
                        setBiayaTambahanItems(prev => [...prev, {
                          ...biayaInput,
                          tempId: Date.now(),
                          nominal: parseFloat(biayaInput.nominal)
                        }]);
                        setBiayaInput({ jenisBiaya: '', nominal: '', keteranganBiaya: '' });
                      }}
                      className="w-full py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm transition"
                    >
                      + Tambah Biaya
                    </button>
                  </div>
                </div>
              )}

              {/* Warning Info */}
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ <strong>Perhatian:</strong> Pastikan data yang diisi sudah benar. Setelah disimpan, Admin SJ tidak bisa mengubah data ini lagi (hanya Super Admin yang bisa edit).
                </p>
              </div>
            </>
          ) : (type === 'addInvoice' || type === 'editInvoice') ? (
            <>
              {/* Form Invoice */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">No Invoice *</label>
                  <input
                    type="text"
                    value={formData.noInvoice}
                    onChange={(e) => setFormData({ ...formData, noInvoice: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    placeholder="Contoh: INV/2024/001"
                    disabled={type === 'editInvoice'}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tgl Invoice *</label>
                  <input
                    type="date"
                    value={formData.tglInvoice}
                    onChange={(e) => setFormData({ ...formData, tglInvoice: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    disabled={type === 'editInvoice'}
                  />
                </div>
              </div>

              {/* Pelanggan */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Pelanggan *</label>
                <select
                  value={formData.pelangganId}
                  onChange={(e) => setFormData({ ...formData, pelangganId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="">-- Pilih Pelanggan --</option>
                  {pelangganList.filter(p => p.isActive !== false && !p.deletedAt).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {pelangganList.filter(p => p.isActive !== false && !p.deletedAt).length === 0 && (
                  <p className="text-xs text-orange-600 mt-1">Belum ada data pelanggan. Tambahkan di menu Master Data → Pelanggan.</p>
                )}
              </div>

              {/* Pilih Surat Jalan */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pilih Surat Jalan * <span className="text-xs text-gray-500">
                    {type === 'editInvoice' ? '(tambah atau hapus SJ dari invoice)' : '(yang sudah terkirim)'}
                  </span>
                </label>
                
                {/* Search Bar */}
                <div className="mb-3">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Cari Nomor SJ, Rute, Material, atau Nomor Polisi..."
                      value={searchInvoiceSJ}
                      onChange={(e) => setSearchInvoiceSJ(e.target.value)}
                      className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                    <Search className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" />
                    {searchInvoiceSJ && (
                      <button
                        onClick={() => setSearchInvoiceSJ('')}
                        className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="border border-gray-300 rounded-lg p-4 max-h-80 overflow-y-auto bg-gray-50">
                  {suratJalanList
                    .filter(sj => {
                      const isBelumInvoice = (sj.statusInvoice == null || sj.statusInvoice === '' || sj.statusInvoice === 'belum');
                      const baseEligible = ((sj.status === 'terkirim' || sj.status === 'terkunci') && sj.isActive !== false);

                      // Untuk edit: tampilkan SJ yang sudah di invoice INI atau yang available
                      if (type === 'editInvoice') {
                        return baseEligible && (isBelumInvoice || sj.invoiceId === selectedItem?.id);
                      }
                      // Untuk add: hanya tampilkan yang available
                      return baseEligible && isBelumInvoice;
                    })
                    .filter(sj => {
                      if (!searchInvoiceSJ) return true;
                      const search = searchInvoiceSJ.toLowerCase();
                      return (
                        sj.nomorSJ.toLowerCase().includes(search) ||
                        sj.rute.toLowerCase().includes(search) ||
                        sj.material.toLowerCase().includes(search) ||
                        sj.nomorPolisi.toLowerCase().includes(search)
                      );
                    }).length === 0 ? (
                    <div className="text-center py-8">
                      <Package className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                      <p className="text-gray-500 font-medium">
                        {searchInvoiceSJ ? 'Tidak ada SJ yang cocok dengan pencarian' : 'Tidak ada Surat Jalan yang bisa di-invoice'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {searchInvoiceSJ ? 'Coba kata kunci lain' : 'Semua SJ terkirim sudah terinvoice'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {suratJalanList
                        .filter(sj => {
                          const isBelumInvoice = (sj.statusInvoice == null || sj.statusInvoice === '' || sj.statusInvoice === 'belum');
                          const baseEligible = ((sj.status === 'terkirim' || sj.status === 'terkunci') && sj.isActive !== false);

                          if (type === 'editInvoice') {
                            return baseEligible && (isBelumInvoice || sj.invoiceId === selectedItem?.id);
                          }
                          return baseEligible && isBelumInvoice;
                        })
                        .filter(sj => {
                          if (!searchInvoiceSJ) return true;
                          const search = searchInvoiceSJ.toLowerCase();
                          return (
                            sj.nomorSJ.toLowerCase().includes(search) ||
                            sj.rute.toLowerCase().includes(search) ||
                            sj.material.toLowerCase().includes(search) ||
                            sj.nomorPolisi.toLowerCase().includes(search)
                          );
                        })
                        .map(sj => (
                          <label 
                            key={sj.id} 
                            className={`flex items-start space-x-3 p-3 rounded-lg cursor-pointer border-2 transition ${
                              formData.selectedSJIds.includes(sj.id)
                                ? 'bg-green-50 border-green-500'
                                : 'bg-white border-gray-200 hover:border-green-300 hover:bg-green-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={formData.selectedSJIds.includes(sj.id)}
                              onChange={(e) => {
                                console.log('Checkbox changed:', sj.nomorSJ, 'checked:', e.target.checked);
                                console.log('Current selectedSJIds:', formData.selectedSJIds);
                                if (e.target.checked) {
                                  const newIds = [...formData.selectedSJIds, sj.id];
                                  console.log('Adding SJ, new IDs:', newIds);
                                  setFormData({ ...formData, selectedSJIds: newIds });
                                } else {
                                  const newIds = formData.selectedSJIds.filter(id => id !== sj.id);
                                  console.log('Removing SJ, new IDs:', newIds);
                                  setFormData({ ...formData, selectedSJIds: newIds });
                                }
                              }}
                              className="mt-1 w-4 h-4 text-green-600 focus:ring-green-500"
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <p className="font-bold text-gray-800">{sj.nomorSJ}</p>
                                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                                  Terkirim
                                </span>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                <div>
                                  <p className="text-gray-600">Rute:</p>
                                  <p className="font-semibold text-gray-800">{sj.rute}</p>
                                </div>
                                <div>
                                  <p className="text-gray-600">Material:</p>
                                  <p className="font-semibold text-gray-800">{sj.material}</p>
                                </div>
                                <div>
                                  <p className="text-gray-600">Qty Bongkar:</p>
                                  <p className="font-semibold text-green-600">{sj.qtyBongkar} {sj.satuan}</p>
                                </div>
                                <div>
                                  <p className="text-gray-600">Tgl Terkirim:</p>
                                  <p className="font-semibold text-gray-800">
                                    {sj.tglTerkirim ? new Date(sj.tglTerkirim).toLocaleDateString('id-ID') : '-'}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </label>
                        ))}
                    </div>
                  )}
                </div>
                {formData.selectedSJIds.length > 0 && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800 font-semibold flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      {formData.selectedSJIds.length} Surat Jalan dipilih untuk invoice
                    </p>
                  </div>
                )}
              </div>

              {/* Harga Jual per Satuan — ditampilkan setelah SJ dipilih */}
              {(() => {
                const selectedSJs = suratJalanList.filter(sj => formData.selectedSJIds.includes(sj.id));
                const groups = [...new Set(selectedSJs.map(sj => `${sj.material}|${sj.rute}`))];
                const isMultiGroup = groups.length > 1;

                if (!isMultiGroup) {
                  const satuan = selectedSJs[0]?.satuan || 'satuan';
                  const totalQty = selectedSJs.reduce((s, sj) => s + (Number(sj.qtyBongkar) || 0), 0);
                  const harga = parseFloat(formData.hargaSatuan) || 0;
                  const totalNilai = totalQty * harga;
                  return (
                    <div className="mb-4 p-4 border border-blue-200 rounded-lg bg-blue-50">
                      <label className="block text-sm font-semibold text-blue-800 mb-2">
                        Harga Jual per Satuan (Rp/{satuan}) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={formData.hargaSatuan}
                        onChange={(e) => setFormData({ ...formData, hargaSatuan: e.target.value })}
                        onWheel={(e) => e.currentTarget.blur()}
                        className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Contoh: 150000"
                      />
                      {formData.selectedSJIds.length > 0 && harga > 0 && (
                        <div className="mt-2 flex justify-between text-sm text-blue-700">
                          <span>Total Qty: <strong>{totalQty.toFixed(2)} {satuan}</strong></span>
                          <span>Nilai Invoice: <strong>Rp {totalNilai.toLocaleString('id-ID')}</strong></span>
                        </div>
                      )}
                    </div>
                  );
                }

                // Multi-group: per-group harga inputs
                let totalNilaiAll = 0;
                const groupRows = groups.map(groupKey => {
                  const [mat, rut] = groupKey.split('|');
                  const groupSJs = selectedSJs.filter(sj => sj.material === mat && sj.rute === rut);
                  const satuan = groupSJs[0]?.satuan || 'satuan';
                  const totalQty = groupSJs.reduce((s, sj) => s + (Number(sj.qtyBongkar) || 0), 0);
                  const harga = parseFloat(formData.hargaPerGroup?.[groupKey]) || 0;
                  const nilai = totalQty * harga;
                  totalNilaiAll += nilai;
                  return { groupKey, mat, rut, satuan, totalQty, harga, nilai };
                });
                return (
                  <div className="mb-4 p-4 border border-blue-200 rounded-lg bg-blue-50 space-y-3">
                    <p className="text-sm font-semibold text-blue-800">
                      Harga Jual per Satuan *
                      <span className="ml-2 text-xs font-normal text-blue-600">(Material/rute berbeda — isi per grup)</span>
                    </p>
                    {groupRows.map(({ groupKey, mat, rut, satuan, totalQty, harga, nilai }) => (
                      <div key={groupKey} className="bg-white rounded-lg p-3 border border-blue-200">
                        <p className="text-xs font-semibold text-gray-700 mb-1">
                          {mat} — {rut}
                          <span className="ml-2 text-gray-500 font-normal">({totalQty.toFixed(2)} {satuan})</span>
                        </p>
                        <input
                          type="number"
                          min="1"
                          value={formData.hargaPerGroup?.[groupKey] || ''}
                          onChange={(e) => setFormData({
                            ...formData,
                            hargaPerGroup: { ...formData.hargaPerGroup, [groupKey]: e.target.value }
                          })}
                          onWheel={(e) => e.currentTarget.blur()}
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder={`Rp/satuan untuk ${mat}`}
                        />
                        {harga > 0 && (
                          <p className="text-xs text-blue-700 mt-1">
                            Nilai: <strong>Rp {nilai.toLocaleString('id-ID')}</strong>
                          </p>
                        )}
                      </div>
                    ))}
                    {totalNilaiAll > 0 && (
                      <div className="flex justify-end text-sm text-blue-700 font-semibold border-t border-blue-200 pt-2">
                        Total Nilai Invoice: Rp {totalNilaiAll.toLocaleString('id-ID')}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Info */}
              <div className="bg-green-50 border-l-4 border-green-500 p-3 rounded-lg">
                <p className="text-sm text-green-800">
                  💡 <strong>Info:</strong> Pilih satu atau lebih Surat Jalan yang sudah terkirim untuk dibuatkan invoice. Setelah invoice dibuat, Surat Jalan akan berstatus "Terinvoice".
                </p>
              </div>
            </>
          ) : type === 'addTransaksi' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipe Transaksi *</label>
                <select
                  value={formData.tipe}
                  onChange={(e) => setFormData({ ...formData, tipe: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Pilih Tipe</option>
                  <option value="pemasukan">Pemasukan</option>
                  <option value="pengeluaran">Pengeluaran</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PT *</label>
                <select
                  value={formData.pt}
                  onChange={(e) => setFormData({ ...formData, pt: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Pilih PT</option>
                  {[...new Set(supirList.map(s => s.pt).filter(Boolean))].sort().map(pt => (
                    <option key={pt} value={pt}>{pt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal *</label>
                <input
                  type="date"
                  value={formData.tanggal}
                  onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nominal (Rp) *</label>
                <input
                  type="number"
                  value={formData.nominal}
                  onChange={(e) => setFormData({ ...formData, nominal: e.target.value })}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Contoh: 500000"
                  min="0"
                  step="1000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan *</label>
                <textarea
                  value={formData.keteranganTransaksi}
                  onChange={(e) => setFormData({ ...formData, keteranganTransaksi: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  rows="2"
                  placeholder="Deskripsi transaksi"
                />
              </div>
            </>
          ) : (type === 'addUser' || type === 'editUser') ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Username untuk login"
                  disabled={type === 'editUser'}
                />
                {type === 'editUser' && (
                  <p className="text-xs text-gray-500 mt-1">Username tidak dapat diubah</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password {type === 'editUser' ? '(Kosongkan jika tidak ingin mengubah)' : '*'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder={type === 'editUser' ? 'Masukkan password baru' : 'Masukkan password'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Nama lengkap user"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Pilih Role</option>
                  <option value="admin_sj">Admin Surat Jalan</option>
                  <option value="admin_keuangan">Admin Keuangan</option>
                  <option value="admin_invoice">Admin Invoice</option>
                  <option value="reader">Reader</option>
                </select>
              </div>
            </>
          ) : null}

          {/* Truck Form */}
          {(type === 'addTruck' || type === 'editTruck') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Polisi *</label>
                <input
                  type="text"
                  value={formData.nomorPolisi}
                  onChange={(e) => setFormData({ ...formData, nomorPolisi: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Contoh: B 1234 XYZ"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                <select
                  value={formData.isActive ? 'true' : 'false'}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="true">Aktif</option>
                  <option value="false">Nonaktif</option>
                </select>
              </div>
            </>
          )}

          {/* Supir Form */}
          {(type === 'addSupir' || type === 'editSupir') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Supir *</label>
                <input
                  type="text"
                  value={formData.namaSupir}
                  onChange={(e) => setFormData({ ...formData, namaSupir: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Nama lengkap supir"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PT *</label>
                <input
                  type="text"
                  value={formData.pt}
                  onChange={(e) => setFormData({ ...formData, pt: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Nama perusahaan"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                <select
                  value={formData.isActive ? 'true' : 'false'}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.value === 'true' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="true">Aktif</option>
                  <option value="false">Nonaktif</option>
                </select>
              </div>
            </>
          )}

          {/* Pelanggan Form */}
          {(type === 'addPelanggan' || type === 'editPelanggan') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Pelanggan / PT *</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="PT. Nama Perusahaan"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
                <textarea
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  rows={2}
                  placeholder="Alamat lengkap..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NPWP</label>
                <input
                  type="text"
                  value={formData.npwp || ''}
                  onChange={(e) => setFormData({ ...formData, npwp: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono focus:ring-2 focus:ring-green-500"
                  placeholder="00.000.000.0-000.000"
                />
              </div>
            </>
          )}

          {/* Rute Form */}
          {(type === 'addRute' || type === 'editRute') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rute *</label>
                <input
                  type="text"
                  value={formData.rute}
                  onChange={(e) => setFormData({ ...formData, rute: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Contoh: Jakarta - Surabaya"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Uang Jalan (Rp) *</label>
                <input
                  type="number"
                  value={formData.uangJalan}
                  onChange={(e) => setFormData({ ...formData, uangJalan: e.target.value })}
                  onWheel={(e) => e.currentTarget.blur()}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Contoh: 500000"
                  min="0"
                  step="10000"
                />
              </div>
            </>
          )}

          {/* Material Form */}
          {(type === 'addMaterial' || type === 'editMaterial') && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Material *</label>
                <input
                  type="text"
                  value={formData.material}
                  onChange={(e) => setFormData({ ...formData, material: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Contoh: Semen"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Satuan *</label>
                <input
                  type="text"
                  value={formData.satuan}
                  onChange={(e) => setFormData({ ...formData, satuan: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Contoh: Ton, Kg, m³"
                />
              </div>
            </>
          )}

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded-lg transition font-medium"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg transition font-medium"
            >
              Simpan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Modal;
