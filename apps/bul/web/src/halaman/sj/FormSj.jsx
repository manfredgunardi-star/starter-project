import { Modal, Form, Button, Flex, Alert } from 'antd';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import FieldDinamis from '../../komponen/FieldDinamis.jsx';
import TombolAksi from '../../komponen/TombolAksi.jsx';
import { useFungsi, useRpc } from '../../lib/data.js';
import { formatRupiah, keTanggalDb } from '../../lib/format.js';
import { argsBuatSj, argsUbahSj } from './argsSj.js';

const OPSI = {
  lini: { tabel: 'lini', label: 'nama', value: 'kode' },
  pelanggan: { tabel: 'pelanggan', label: 'nama' },
  rute: { tabel: 'rute', label: 'nama' },
  material: { tabel: 'material', label: (r) => `${r.lini_kode} · ${r.nama} (${r.satuan})`, order: 'nama' },
  truk: { tabel: 'truk', label: 'nopol', order: 'nopol' },
  supir: { tabel: 'supir', label: 'nama' },
};

export default function FormSj({ open, sj, onTutup }) {
  const [form] = Form.useForm();
  const ubah = Boolean(sj?.id);
  const buat = useRpc('buat_sj', { invalidate: ['surat_jalan'] });
  const simpanUbah = useRpc('ubah_sj', { invalidate: ['surat_jalan'] });
  const rute = Form.useWatch('rute_id', form);
  const tanggal = Form.useWatch('tanggal', form);
  const ujMaster = useFungsi('uang_jalan_berlaku', { p_rute_id: rute, p_tanggal: keTanggalDb(tanggal) }, { enabled: Boolean(rute && tanggal) });

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(ubah ? { ...sj, tanggal: dayjs(sj.tanggal) } : { tanggal: dayjs(), lini_kode: 'SJP' });
  }, [open, sj, ubah, form]);

  async function simpan(lagi) {
    const v = await form.validateFields();
    if (ubah) await simpanUbah.mutateAsync(argsUbahSj(sj.id, v));
    else await buat.mutateAsync(argsBuatSj(v));
    if (lagi) form.setFieldsValue({ nomor: undefined, truk_id: undefined, supir_id: undefined, qty_muat: undefined, uang_jalan: undefined, keterangan: undefined });
    else onTutup();
  }

  return (
    <Modal open={open} title={ubah ? `Ubah SJ ${sj.nomor}` : 'SJ baru'} onCancel={onTutup} destroyOnHidden footer={
      <Flex gap={8} justify="end">
        <Button onClick={onTutup}>Tutup</Button>
        {!ubah && <TombolAksi onClick={() => simpan(true)}>Simpan & tambah lagi</TombolAksi>}
        <TombolAksi type="primary" onClick={() => simpan(false)}>Simpan</TombolAksi>
      </Flex>
    }>
      <Form form={form} layout="vertical">
        {!ubah && <FieldDinamis field={{ name: 'lini_kode', label: 'Lini', tipe: 'pilihan', sumber: OPSI.lini, wajib: true }} />}
        <FieldDinamis field={{ name: 'nomor', label: 'Nomor SJ', tipe: 'teks', wajib: true }} />
        <FieldDinamis field={{ name: 'tanggal', label: 'Tanggal SJ', tipe: 'tanggal', wajib: true }} />
        <FieldDinamis field={{ name: 'pelanggan_id', label: 'Pelanggan', tipe: 'pilihan', sumber: OPSI.pelanggan, wajib: true }} />
        <FieldDinamis field={{ name: 'rute_id', label: 'Rute', tipe: 'pilihan', sumber: OPSI.rute, wajib: true }} />
        <FieldDinamis field={{ name: 'material_id', label: 'Material', tipe: 'pilihan', sumber: OPSI.material, wajib: true }} />
        <FieldDinamis field={{ name: 'truk_id', label: 'Truk', tipe: 'pilihan', sumber: OPSI.truk, wajib: true }} />
        <FieldDinamis field={{ name: 'supir_id', label: 'Supir', tipe: 'pilihan', sumber: OPSI.supir, wajib: true }} />
        <FieldDinamis field={{ name: 'qty_muat', label: 'Qty muat', tipe: 'qty', wajib: true }} />
        {rute && tanggal && (
          <Alert
            style={{ marginBottom: 12 }}
            type={ujMaster.data == null ? 'warning' : 'info'}
            message={ujMaster.data == null
              ? 'Uang jalan rute belum diatur untuk tanggal ini — isi manual atau atur di Master › Uang Jalan Rute.'
              : `Uang jalan master: ${formatRupiah(ujMaster.data)}. Kosongkan kolom di bawah untuk memakai nilai ini.`}
          />
        )}
        <FieldDinamis field={{ name: 'uang_jalan', label: ubah ? 'Uang jalan' : 'Uang jalan (kosong = dari master)', tipe: 'uang', wajib: ubah }} />
        <FieldDinamis field={{ name: 'keterangan', label: 'Keterangan', tipe: 'teks' }} />
      </Form>
    </Modal>
  );
}
