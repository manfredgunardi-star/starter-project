import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';

export default function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="alert"
      className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-2 bg-amber-500 py-2 px-4 text-white text-sm font-semibold shadow-lg"
    >
      <WifiOff className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      <span>Offline - data tersimpan lokal, akan sync saat terhubung kembali</span>
    </div>
  );
}
