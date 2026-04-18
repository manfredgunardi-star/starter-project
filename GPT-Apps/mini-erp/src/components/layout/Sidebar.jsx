import { NavLink } from 'react-router-dom';
import { Boxes } from 'lucide-react';
import { navigationGroups } from '../../app/navigation.js';

const baseLink =
  'flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition duration-200 focus:outline-none focus:ring-2 focus:ring-ios-blue/30';

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-ios-separator/80 bg-white/78 px-4 py-5 backdrop-blur-2xl lg:block">
      <div className="flex items-center gap-3 px-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ios-blue text-white shadow-ios-subtle">
          <Boxes size={22} aria-hidden="true" />
        </div>
        <div>
          <p className="text-base font-semibold leading-tight">Mini ERP</p>
          <p className="text-xs text-ios-secondary">General workspace</p>
        </div>
      </div>

      <nav className="mt-8 space-y-7">
        {navigationGroups.map((group) => (
          <div key={group.label}>
            <p className="px-3 text-xs font-semibold uppercase tracking-[0.08em] text-ios-secondary">
              {group.label}
            </p>
            <div className="mt-2 space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;

                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      [
                        baseLink,
                        isActive
                          ? 'bg-ios-blue text-white shadow-ios-subtle'
                          : 'text-ios-secondary hover:bg-ios-grouped hover:text-ios-label',
                      ].join(' ')
                    }
                  >
                    <Icon size={19} aria-hidden="true" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
