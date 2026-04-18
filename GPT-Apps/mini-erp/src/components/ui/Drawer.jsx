import { X } from 'lucide-react';

export function Drawer({ children, description, footer, onClose, open, title }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 h-full w-full cursor-default bg-ios-label/20 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Tutup panel"
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-ios-separator bg-ios-background shadow-ios">
        <header className="flex items-start justify-between gap-4 border-b border-ios-separator bg-white/78 px-5 py-5 backdrop-blur-2xl">
          <div>
            <h2 className="text-xl font-semibold text-ios-label">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-6 text-ios-secondary">{description}</p> : null}
          </div>
          <button
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ios-grouped text-ios-secondary transition hover:text-ios-label focus:outline-none focus:ring-2 focus:ring-ios-blue/30"
            onClick={onClose}
            aria-label="Tutup"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <footer className="border-t border-ios-separator bg-white px-5 py-4">{footer}</footer> : null}
      </aside>
    </div>
  );
}
