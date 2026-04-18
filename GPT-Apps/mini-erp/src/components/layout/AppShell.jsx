import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav.jsx';
import { Sidebar } from './Sidebar.jsx';
import { TopBar } from './TopBar.jsx';

export function AppShell() {
  return (
    <div className="min-h-screen bg-ios-background text-ios-label">
      <Sidebar />
      <div className="min-h-screen lg:pl-72">
        <TopBar />
        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
