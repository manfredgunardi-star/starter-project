import { Settings } from 'lucide-react';
import { EmptyState } from '../../components/feedback/EmptyState.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';

export function SettingsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="System"
        title="Pengaturan"
        description="Konfigurasi aplikasi, periode laporan, dan preferensi company."
      />
      <EmptyState
        icon={Settings}
        title="Pengaturan dasar siap ditambahkan"
        description="Tahap berikutnya akan menghubungkan konfigurasi ini ke Firestore company settings."
      />
    </div>
  );
}
