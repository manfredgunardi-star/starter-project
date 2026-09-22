import { Tabs } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import TabelMaster from '../../komponen/TabelMaster.jsx';
import { KONFIG_MASTER } from './konfigurasi.js';

export default function MasterPage() {
  const { entitas = 'pelanggan' } = useParams();
  const nav = useNavigate();
  const konfig = KONFIG_MASTER[entitas] ?? KONFIG_MASTER.pelanggan;
  return (
    <>
      <Tabs
        activeKey={konfig.kunci}
        onChange={(k) => nav(`/master/${k}`)}
        items={Object.values(KONFIG_MASTER).map((k) => ({ key: k.kunci, label: k.judul }))}
      />
      <TabelMaster key={konfig.kunci} konfig={konfig} />
    </>
  );
}
