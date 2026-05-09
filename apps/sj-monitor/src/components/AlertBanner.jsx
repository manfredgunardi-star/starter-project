// src/components/AlertBanner.jsx
import { Clock } from 'lucide-react';

const AlertBanner = ({ banner }) => {
  if (!banner) return null;
  return (
    <div className="bg-amber-400 text-amber-900 px-3 py-2 sm:px-6 sm:py-3 flex items-center justify-between shadow">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Clock className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
        <span className="font-semibold text-xs sm:text-sm">
          Logout otomatis dalam{' '}
          <strong>{banner.minutesRemaining} menit</strong>
          {banner.reason ? ` — ${banner.reason}` : ''}.
          Simpan pekerjaan Anda.
        </span>
      </div>
      <span className="text-xs font-mono opacity-75 ml-2 sm:ml-4 flex-shrink-0 hidden sm:inline">
        {banner.scheduledAtLocal}
      </span>
    </div>
  );
};

export default AlertBanner;
