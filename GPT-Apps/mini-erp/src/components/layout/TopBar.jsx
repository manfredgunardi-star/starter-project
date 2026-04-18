import { Bell, ChevronDown, LogOut, Search } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { useCompany } from '../../hooks/useCompany.js';

export function TopBar() {
  const { authMode, signOut, user } = useAuth();
  const { activeCompany } = useCompany();

  return (
    <header className="sticky top-0 z-20 border-b border-ios-separator/70 bg-ios-background/80 backdrop-blur-2xl">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button className="flex min-h-11 items-center gap-2 rounded-full border border-ios-separator bg-white px-4 text-sm font-medium text-ios-label shadow-ios-subtle transition hover:border-ios-blue/40 focus:outline-none focus:ring-2 focus:ring-ios-blue/30">
          <span className="max-w-36 truncate sm:max-w-56">{activeCompany.name}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>

        <div className="relative hidden flex-1 md:block">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ios-secondary"
            size={18}
            aria-hidden="true"
          />
          <input
            className="h-11 w-full rounded-full border border-ios-separator bg-white pl-11 pr-4 text-sm outline-none transition placeholder:text-ios-secondary focus:border-ios-blue focus:ring-2 focus:ring-ios-blue/15"
            placeholder="Cari data, jurnal, atau laporan"
            type="search"
          />
        </div>

        <button
          className="ml-auto flex h-11 w-11 items-center justify-center rounded-full border border-ios-separator bg-white text-ios-secondary shadow-ios-subtle transition hover:text-ios-label focus:outline-none focus:ring-2 focus:ring-ios-blue/30 md:ml-0"
          aria-label="Notifikasi"
        >
          <Bell size={19} aria-hidden="true" />
        </button>

        <button className="flex min-h-11 items-center gap-3 rounded-full bg-white py-1.5 pl-1.5 pr-4 shadow-ios-subtle transition hover:bg-ios-grouped focus:outline-none focus:ring-2 focus:ring-ios-blue/30">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ios-label text-xs font-semibold text-white">
            {user.displayName.slice(0, 1)}
          </span>
          <span className="hidden text-sm font-medium sm:inline">{user.displayName}</span>
        </button>
        {authMode === 'firebase' ? (
          <button
            className="flex h-11 w-11 items-center justify-center rounded-full border border-ios-separator bg-white text-ios-secondary shadow-ios-subtle transition hover:text-ios-red focus:outline-none focus:ring-2 focus:ring-ios-red/30"
            onClick={signOut}
            aria-label="Keluar"
          >
            <LogOut size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </header>
  );
}
