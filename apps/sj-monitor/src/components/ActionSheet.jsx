import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const SPRING = { type: 'spring', stiffness: 320, damping: 30, mass: 0.8 };

export default function ActionSheet({ open, onClose, title, actions = [] }) {
  const titleId = useId();
  const sheetRef = useRef(null);
  const cancelButtonRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const pendingActionRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const activeActions = actions.filter((action) => action && typeof action.onClick === 'function');

  const handleClose = useCallback(() => {
    if (pendingActionRef.current) return;
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const frameId = window.requestAnimationFrame(() => {
      const focusTarget = cancelButtonRef.current || sheetRef.current;
      focusTarget?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frameId);

      const previouslyFocused = previouslyFocusedRef.current;
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
      previouslyFocusedRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      handleClose();
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClose, open]);

  const handleActionClick = async (action) => {
    if (pendingActionRef.current) return;

    pendingActionRef.current = true;
    setIsSubmitting(true);

    try {
      await Promise.resolve(action.onClick());
    } catch (error) {
      console.error('ActionSheet action failed:', error);
    } finally {
      pendingActionRef.current = false;
      setIsSubmitting(false);
      onClose?.();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]">
          <motion.button
            type="button"
            aria-label="Tutup menu aksi"
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            disabled={isSubmitting}
            onClick={handleClose}
          />

          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : 'Menu aksi'}
            tabIndex={-1}
            className="fixed bottom-0 left-0 right-0 z-[71] px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '110%', opacity: 0 }}
            transition={SPRING}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              className="mx-auto w-full max-w-md"
              style={{ fontFamily: "'SF Pro Text', 'SF Pro Display', Inter, sans-serif" }}
            >
              <div className="overflow-hidden rounded-2xl border border-white/30 bg-white/85 shadow-2xl shadow-slate-950/25 backdrop-blur-2xl">
                {title && (
                  <div
                    id={titleId}
                    className="border-b border-slate-200/80 px-5 py-3 text-center text-[13px] font-semibold text-slate-500"
                  >
                    {title}
                  </div>
                )}

                {activeActions.map((action, index) => (
                  <button
                    key={action.id || action.key || `${action.label}-${index}`}
                    type="button"
                    disabled={isSubmitting}
                    className={`flex min-h-[56px] w-full items-center justify-center gap-3 border-b border-slate-200/80 px-5 text-center text-[17px] font-semibold transition active:bg-slate-200/75 last:border-b-0 ${
                      action.destructive ? 'text-rose-600' : 'text-sky-600'
                    } disabled:cursor-wait disabled:opacity-60 disabled:active:bg-transparent`}
                    onClick={() => handleActionClick(action)}
                  >
                    {action.icon && <span className="flex h-5 w-5 items-center justify-center">{action.icon}</span>}
                    <span className="min-w-0 truncate">{action.label}</span>
                  </button>
                ))}
              </div>

              <button
                ref={cancelButtonRef}
                type="button"
                disabled={isSubmitting}
                className="mt-2 min-h-[56px] w-full rounded-2xl border border-white/30 bg-white/90 px-5 text-center text-[17px] font-bold text-sky-600 shadow-xl shadow-slate-950/15 backdrop-blur-2xl transition active:bg-slate-200/80 disabled:cursor-wait disabled:opacity-60 disabled:active:bg-white/90"
                onClick={handleClose}
              >
                Batal
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
