import { useState } from 'react';
import { Tabs, Table, DatePicker, InputNumber, Select, Flex, Button, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { useDaftar, useFungsi } from '../../lib/data.js';
import { formatRupiah, keTanggalDb } from '../../lib/format.js';
import { dariSen, keSen } from '../../lib/uang.js';
import { keCsv, unduhCsv } from '../../lib/csv.js';
import { LAPORAN } from './definisi.js';

const DIMENSI = ['truk', 'supir', 'pelanggan', 'rute', 'lini'].map((v) => ({ value: v, label: v }));

export default function LaporanPage() {
  const { kunci = 'neraca' } = useParams();
  const nav = useNavigate();
  const def = LAPORAN[kunci] ?? LAPORAN.neraca;
  const [rentang, setRentang] = useState([dayjs().startOf('year'), dayjs().endOf('month')]);
  const [per, setPer] = useState(dayjs());
  const [tahun, setTahun] = useState(dayjs().year());
  const [dimensi, setDimensi] = useState('truk');
  const args = def.args({ dari: keTanggalDb(rentang[0]), sampai: keTanggalDb(rentang[1]), per: keTanggalDb(per), tahun, dimensi });
  const f = useFungsi(def.fungsi, args, { enabled: Boolean(def.fungsi) });
  const v = useDaftar(def.view, { enabled: Boolean(def.view) });
  const q = def.fungsi ? f : v;
  const rows = q.data ?? [];
  const total = (def.total ?? []).map((t) => ({
    label: t.label,
    nilai: dariSen(rows.filter(t.filter ?? (() => true)).reduce((s, r) => s + BigInt(t.tanda ? t.tanda(r) : 1) * keSen(r[t.kolom]), 0n)),
  }));
  return (
    <>
      <Tabs activeKey={kunci} onChange={(k) => nav(`/laporan/${k}`)} items={Object.entries(LAPORAN).map(([k, l]) => ({ key: k, label: l.judul }))} />
      <Flex wrap gap={8} style={{ marginBottom: 12 }}>
        {def.param.includes('periode') && <DatePicker.RangePicker format="DD/MM/YYYY" value={rentang} onChange={(x) => x && setRentang(x)} allowClear={false} />}
        {def.param.includes('per') && <DatePicker format="DD/MM/YYYY" value={per} onChange={(x) => x && setPer(x)} allowClear={false} />}
        {def.param.includes('tahun') && <InputNumber value={tahun} min={2025} max={2100} onChange={(x) => x && setTahun(x)} />}
        {def.param.includes('dimensi') && <Select value={dimensi} options={DIMENSI} onChange={setDimensi} style={{ width: 140 }} />}
        <Button onClick={() => unduhCsv(`${kunci}-${dayjs().format('YYYYMMDD')}.csv`, keCsv(def.kolom, rows))} disabled={!rows.length}>Unduh CSV</Button>
      </Flex>
      <Table rowKey={(r, i) => `${i}`} size="small" loading={q.isLoading} dataSource={rows} columns={def.kolom} pagination={false} scroll={{ x: true }} />
      {total.map((t) => <Typography.Paragraph key={t.label} strong style={{ textAlign: 'right', marginTop: 8 }}>{t.label}: {formatRupiah(t.nilai)}</Typography.Paragraph>)}
    </>
  );
}
