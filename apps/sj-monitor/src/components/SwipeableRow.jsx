import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const ACTION_WIDTH = 72;
const SWIPE_THRESHOLD = 10;
const SPRING = { type: 'spring', stiffness: 180, damping: 24, mass: 0.7 };
const INTERACTIVE_SELECTOR = 'button, a, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function isInteractiveTarget(target, container) {
  if (!(target instanceof Element)) return false;

  const interactiveElement = target.closest(INTERACTIVE_SELECTOR);
  return Boolean(interactiveElement && interactiveElement !== container && container?.contains(interactiveElement));
}

export default function SwipeableRow({ children, actions = [], disabled = false }) {
  const containerRef = useRef(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTranslateRef = useRef(0);
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);

  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const activeActions = useMemo(
    () => actions.filter((action) => action && typeof action.onClick === 'function'),
    [actions]
  );
  const maxReveal = activeActions.length * ACTION_WIDTH;
  const isEnabled = !disabled && activeActions.length > 0;
  const isOpen = translateX < 0;

  const close = useCallback(() => {
    setTranslateX(0);
  }, []);

  const resetDrag = useCallback(() => {
    isDraggingRef.current = false;
    hasMovedRef.current = false;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (!isEnabled || !isOpen) return undefined;

    const handleOutsideTouch = (event) => {
      if (containerRef.current?.contains(event.target)) return;
      close();
    };

    document.addEventListener('touchstart', handleOutsideTouch, true);
    document.addEventListener('mousedown', handleOutsideTouch, true);

    return () => {
      document.removeEventListener('touchstart', handleOutsideTouch, true);
      document.removeEventListener('mousedown', handleOutsideTouch, true);
    };
  }, [close, isEnabled, isOpen]);

  useEffect(() => {
    if (isEnabled) return;

    resetDrag();
    if (translateX !== 0) close();
  }, [close, isEnabled, resetDrag, translateX]);

  const handleTouchStart = (event) => {
    if (!isEnabled || event.touches.length !== 1) return;

    const touch = event.touches[0];
    startXRef.current = touch.clientX;
    startYRef.current = touch.clientY;
    startTranslateRef.current = translateX;
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    setIsDragging(true);
  };

  const handleTouchMove = (event) => {
    if (!isDraggingRef.current || !isEnabled || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - startXRef.current;
    const deltaY = touch.clientY - startYRef.current;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (!hasMovedRef.current) {
      if (absDeltaX < SWIPE_THRESHOLD) return;
      if (absDeltaY > absDeltaX) return;
    }

    hasMovedRef.current = true;
    event.preventDefault();
    setTranslateX(clamp(startTranslateRef.current + deltaX, -maxReveal, 0));
  };

  const handleTouchEnd = () => {
    const wasDragging = isDraggingRef.current;
    const didMove = hasMovedRef.current;

    resetDrag();

    if (!wasDragging || !isEnabled || !didMove) return;

    setTranslateX((current) => (Math.abs(current) > maxReveal / 2 ? -maxReveal : 0));
  };

  const handleActionClick = (action) => {
    try {
      action.onClick();
    } finally {
      close();
    }
  };

  const handleKeyDown = (event) => {
    if (!isEnabled || isInteractiveTarget(event.target, containerRef.current)) return;

    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowLeft') {
      event.preventDefault();
      setTranslateX(-maxReveal);
      return;
    }

    if (event.key === 'Escape' || event.key === 'ArrowRight') {
      event.preventDefault();
      close();
    }
  };

  if (!isEnabled) {
    return children;
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="group"
      aria-expanded={isOpen}
      onKeyDown={handleKeyDown}
      className="relative overflow-hidden rounded-[28px]"
      style={{ fontFamily: "'SF Pro Text', 'SF Pro Display', Inter, sans-serif" }}
    >
      <div
        className="absolute inset-y-0 right-0 flex overflow-hidden rounded-r-[28px] backdrop-blur-2xl"
        style={{
          width: maxReveal,
          border: '0.5px solid rgba(255,255,255,0.18)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.16)',
        }}
      >
        {activeActions.map((action, index) => (
          <button
            key={`${action.label}-${index}`}
            type="button"
            aria-label={action.label}
            title={action.label}
            tabIndex={isOpen ? 0 : -1}
            onClick={() => handleActionClick(action)}
            className="flex min-h-[72px] shrink-0 flex-col items-center justify-center gap-1 px-2 text-center text-[11px] font-semibold tracking-normal text-white active:scale-95"
            style={{
              width: ACTION_WIDTH,
              background: action.color,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22)',
            }}
          >
            <span className="flex h-6 w-6 items-center justify-center">{action.icon}</span>
            <span className="max-w-full truncate leading-tight">{action.label}</span>
          </button>
        ))}
      </div>

      <motion.div
        animate={{ x: translateX }}
        transition={isDragging ? { duration: 0 } : SPRING}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        className="relative z-10 touch-pan-y rounded-[28px] will-change-transform"
        style={{
          boxShadow: isOpen ? '0 8px 32px rgba(15,23,42,0.16), 0 2px 8px rgba(15,23,42,0.08)' : undefined,
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
