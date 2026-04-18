import { NavLink } from 'react-router-dom';
import { navigationGroups } from '../../app/navigation.js';

const mobileItems = navigationGroups[0].items.slice(0, 5);

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ios-separator bg-white/88 px-2 pb-2 pt-1 backdrop-blur-2xl lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
        {mobileItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                [
                  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-ios-blue/30',
                  isActive ? 'text-ios-blue' : 'text-ios-secondary hover:text-ios-label',
                ].join(' ')
              }
            >
              <Icon size={20} aria-hidden="true" />
              <span className="max-w-full truncate">{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
