// src/components/AlertBanner.jsx
import React from 'react';
import { Clock } from 'lucide-react';

const AlertBanner = ({ banner }) => {
  if (!banner) return null;
  return (
    <div className="bg-amber-400 text-amber-900 px-6 py-3 flex items-center justify-between shadow">
      <div className="flex items-center gap-3">
        <Clock className="w-5 h-5 flex-shrink-0" />
        <span className="font-semibold text-sm">
          Sistem akan logout otomatis dalam{' '}
          <strong>{banner.minutesRemaining} menit</strong>
          {banner.reason ? ` — ${banner.reason}` : ''}.
          Segera simpan pekerjaan Anda.
        </span>
      </div>
      <span className="text-xs font-mono opacity-75 ml-4 flex-shrink-0">
        {banner.scheduledAtLocal}
      </span>
    </div>
  );
};

export default AlertBanner;
