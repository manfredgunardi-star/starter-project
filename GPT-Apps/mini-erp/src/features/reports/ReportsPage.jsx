import { BarChart3, FileSpreadsheet, LineChart, Scale, WalletCards } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../../components/feedback/EmptyState.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';

const reports = ['Buku Besar', 'Neraca Saldo', 'Laba Rugi', 'Neraca', 'Mutasi Kas/Bank'];

export function ReportsPage() {
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader
        eyebrow="Reporting"
        title="Laporan"
        description="Laporan awal membaca jurnal posted dan master data aktif."
        actions={<Button icon={FileSpreadsheet} variant="secondary">Export</Button>}
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {reports.map((report) => (
          <Badge key={report} tone="blue">{report}</Badge>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <Button icon={BarChart3} onClick={() => navigate('/reports/buku-besar')}>Buka Buku Besar</Button>
        <Button icon={Scale} onClick={() => navigate('/reports/neraca-saldo')} variant="secondary">Buka Neraca Saldo</Button>
        <Button icon={LineChart} onClick={() => navigate('/reports/laba-rugi')} variant="secondary">Buka Laba Rugi</Button>
        <Button icon={WalletCards} onClick={() => navigate('/reports/neraca')} variant="secondary">Buka Neraca</Button>
      </div>

      <EmptyState
        icon={BarChart3}
        title="Belum ada laporan yang dipilih"
        description="Pilih laporan dari daftar untuk melihat hasil berdasarkan rentang tanggal."
      />
    </div>
  );
}
