import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const ACTION_WIDTH = 72;
const MOBILE_QUERY = '(max-width: 767px)';
const SPRING = { type: 'spring', stiffness: 180, damping: 24, mass: 0.7 };

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function SwipeableRow({ children, actions = [], disabled = false }) {
  const containerRef = useRef(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const startTranslateRef = useRef(0);
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);

  const [isMobile, setIsMobile] = useState(false);
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const activeActions = useMemo(
    () => actions.filter((action) => action && typeof action.onClick === 'function'),
    [actions]
  );
  const maxReveal = activeActions.length * ACTION_WIDTH;
  const isEnabled = isMobile && !disabled && activeActions.length > 0;
  const isOpen = translateX < 0;

  const close = useCallback(() => {
    setTranslateX(0);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;

    const mediaQuery = window.matchMedia(MOBILE_QUERY);
    const handleChange = (event) => {
      setIsMobile(event.matches);
      if (!event.matches) close();
    };

    setIsMobile(mediaQuery.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [close]);

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
    if (!isEnabled && translateX !== 0) close();
  }, [close, isEnabled, translateX]);

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

    if (!hasMovedRef.current && Math.abs(deltaY) > Math.abs(deltaX)) return;

    hasMovedRef.current = true;
    event.preventDefault();
    setTranslateX(clamp(startTranslateRef.current + deltaX, -maxReveal, 0));
  };

  const handleTouchEnd = () => {
    if (!isDraggingRef.current || !isEnabled) return;

    isDraggingRef.current = false;
    hasMovedRef.current = false;
    setIsDragging(false);
    setTranslateX((current) => (Math.abs(current) > maxReveal / 2 ? -maxReveal : 0));
  };

  const handleActionClick = (action) => {
    action.onClick();
    close();
  };

  if (!isEnabled) {
    return children;
  }

  return (
    <div
      ref={containerRef}
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
