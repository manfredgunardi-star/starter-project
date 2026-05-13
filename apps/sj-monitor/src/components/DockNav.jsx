import { useState } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { MoreHorizontal, X } from 'lucide-react';
import { useReducedMotion } from '../hooks/useReducedMotion.js';
import { useScrollDirection } from '../hooks/useScrollDirection.js';

export default function DockNav({ items, activeTab, onTabChange, primaryCount = 4 }) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const hidden = useScrollDirection();
  const primaryItems = items.slice(0, primaryCount);
  const moreItems = items.slice(primaryCount);
  const hasMoreItems = moreItems.length > 0;
  const isMoreActive = moreItems.some((item) => item.tab === activeTab);

  const noMotion = { duration: 0 };
  const spring    = prefersReducedMotion ? noMotion : { type: 'spring', stiffness: 280, damping: 26, mass: 0.8 };
  const layoutSpr = prefersReducedMotion ? noMotion : { type: 'spring', stiffness: 380, damping: 26, mass: 0.7 };
  const labelSpr  = prefersReducedMotion ? noMotion : { type: 'spring', stiffness: 320, damping: 22, mass: 0.6 };
  const tapSpr    = prefersReducedMotion ? noMotion : { type: 'spring', stiffness: 600, damping: 28, mass: 0.5 };

  const handleMoreItemClick = (tab) => {
    onTabChange(tab);
    setIsMoreOpen(false);
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      left: 16,
      right: 16,
      display: 'flex',
      justifyContent: 'center',
      zIndex: 50,
      pointerEvents: 'none',
    }}>
      <AnimatePresence>
        {isMoreOpen && hasMoreItems && (
          <>
            <motion.button
              key="dock-more-backdrop"
              type="button"
              aria-label="Tutup menu lainnya"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={spring}
              onClick={() => setIsMoreOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(2,6,23,0.45)',
                border: 0,
                padding: 0,
                pointerEvents: 'auto',
                cursor: 'pointer',
              }}
            />
            <motion.div
              key="dock-more-sheet"
              initial={{ opacity: 0, y: 28, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 28, scale: 0.96 }}
              transition={spring}
              role="dialog"
              aria-modal="true"
              aria-label="Menu lainnya"
              style={{
                position: 'fixed',
                left: 16,
                right: 16,
                bottom: 92,
                maxHeight: '62vh',
                overflowY: 'auto',
                background: 'rgba(15,23,42,0.75)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                border: '0.5px solid rgba(255,255,255,0.15)',
                borderRadius: 28,
                padding: 14,
                boxShadow: '0 18px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
                pointerEvents: 'auto',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 12,
              }}>
                <span style={{
                  color: '#e0f2fe',
                  fontSize: 13,
                  fontWeight: 800,
                  letterSpacing: 0,
                  fontFamily: "'SF Pro Text', Inter, sans-serif",
                }}>
                  Lainnya
                </span>
                <motion.button
                  type="button"
                  aria-label="Tutup menu lainnya"
                  title="Tutup"
                  onClick={() => setIsMoreOpen(false)}
                  whileTap={{ scale: 0.85, transition: tapSpr }}
                  style={{
                    width: 34,
                    height: 34,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 9999,
                    border: '0.5px solid rgba(255,255,255,0.14)',
                    background: 'rgba(255,255,255,0.08)',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <X size={18} aria-hidden="true" />
                </motion.button>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(86px, 1fr))',
                gap: 8,
              }}>
                {moreItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.tab;

                  return (
                    <motion.button
                      key={item.tab}
                      type="button"
                      onClick={() => handleMoreItemClick(item.tab)}
                      title={item.label}
                      aria-label={item.label}
                      aria-current={isActive ? 'page' : undefined}
                      whileTap={{ scale: 0.96, transition: tapSpr }}
                      style={{
                        minWidth: 0,
                        minHeight: 76,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '10px 8px',
                        borderRadius: 18,
                        border: isActive ? '0.5px solid rgba(56,189,248,0.35)' : '0.5px solid rgba(255,255,255,0.08)',
                        background: isActive ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.06)',
                        color: isActive ? '#bae6fd' : 'rgba(255,255,255,0.72)',
                        cursor: 'pointer',
                        boxShadow: isActive ? '0 2px 12px rgba(56,189,248,0.15)' : 'none',
                        overflow: 'hidden',
                      }}
                    >
                      <Icon
                        size={20}
                        color={isActive ? '#38bdf8' : 'rgba(255,255,255,0.55)'}
                        strokeWidth={isActive ? 2.5 : 2}
                        aria-hidden="true"
                      />
                      <span style={{
                        width: '100%',
                        color: 'inherit',
                        fontSize: 11,
                        fontWeight: 700,
                        lineHeight: 1.2,
                        letterSpacing: 0,
                        textAlign: 'center',
                        fontFamily: "'SF Pro Text', Inter, sans-serif",
                        overflowWrap: 'anywhere',
                      }}>
                        {item.label}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <motion.nav
        className="scrollbar-hide"
        initial={{ opacity: 0, y: 32, scale: 0.92 }}
        animate={{
          opacity: hidden ? 0 : 1,
          y: hidden ? 40 : 0,
          scale: hidden ? 0.88 : 1,
        }}
        transition={spring}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'rgba(15,23,42,0.75)',
          backdropFilter: 'blur(28px)',
          WebkitBackdropFilter: 'blur(28px)',
          border: '0.5px solid rgba(255,255,255,0.15)',
          borderRadius: 9999,
          padding: '8px 14px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
          overflowX: 'auto',
          maxWidth: '100%',
          pointerEvents: hidden ? 'none' : 'auto',
        }}
      >
        <LayoutGroup>
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.tab;

          return (
            <motion.button
              key={item.tab}
              type="button"
              onClick={() => onTabChange(item.tab)}
              layout
              transition={layoutSpr}
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              whileTap={{ scale: 0.85, transition: tapSpr }}
              style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: isActive ? 6 : 0,
                background: isActive ? 'rgba(56,189,248,0.2)' : 'transparent',
                border: isActive ? '0.5px solid rgba(56,189,248,0.35)' : '0.5px solid transparent',
                borderRadius: 22,
                padding: isActive ? '6px 12px' : '6px 7px',
                cursor: 'pointer',
                boxShadow: isActive ? '0 2px 12px rgba(56,189,248,0.15)' : 'none',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              <motion.div
                animate={{
                  scale: isActive ? 1 : 1,
                  color: isActive ? '#38bdf8' : 'rgba(255,255,255,0.35)',
                }}
                transition={layoutSpr}
              >
                <Icon
                  size={isActive ? 15 : 20}
                  color={isActive ? '#38bdf8' : 'rgba(255,255,255,0.35)'}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </motion.div>
              <AnimatePresence>
                {isActive && (
                  <motion.span
                    key="label"
                    initial={{ width: 0, opacity: 0, x: -4 }}
                    animate={{ width: 'auto', opacity: 1, x: 0 }}
                    exit={{ width: 0, opacity: 0, x: -4 }}
                    transition={labelSpr}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#bae6fd',
                      letterSpacing: 0,
                      fontFamily: "'SF Pro Text', Inter, sans-serif",
                      display: 'inline-block',
                      overflow: 'hidden',
                    }}
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
        {hasMoreItems && (
          <motion.button
            key="dock-more"
            type="button"
            onClick={() => setIsMoreOpen((current) => !current)}
            layout
            transition={layoutSpr}
            title="Lainnya"
            aria-label="Buka menu lainnya"
            aria-expanded={isMoreOpen}
            aria-current={isMoreActive ? 'page' : undefined}
            whileTap={{ scale: 0.85, transition: tapSpr }}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: isMoreActive ? 6 : 0,
              background: isMoreActive ? 'rgba(56,189,248,0.2)' : 'transparent',
              border: isMoreActive ? '0.5px solid rgba(56,189,248,0.35)' : '0.5px solid transparent',
              borderRadius: 22,
              padding: isMoreActive ? '6px 12px' : '6px 7px',
              cursor: 'pointer',
              boxShadow: isMoreActive ? '0 2px 12px rgba(56,189,248,0.15)' : 'none',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            <motion.div
              animate={{
                scale: 1,
                color: isMoreActive ? '#38bdf8' : 'rgba(255,255,255,0.35)',
              }}
              transition={layoutSpr}
            >
              <MoreHorizontal
                size={isMoreActive ? 15 : 20}
                color={isMoreActive ? '#38bdf8' : 'rgba(255,255,255,0.35)'}
                strokeWidth={isMoreActive ? 2.5 : 2}
                aria-hidden="true"
              />
            </motion.div>
            <AnimatePresence>
              {isMoreActive && (
                <motion.span
                  key="more-label"
                  initial={{ width: 0, opacity: 0, x: -4 }}
                  animate={{ width: 'auto', opacity: 1, x: 0 }}
                  exit={{ width: 0, opacity: 0, x: -4 }}
                  transition={labelSpr}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#bae6fd',
                    letterSpacing: 0,
                    fontFamily: "'SF Pro Text', Inter, sans-serif",
                    display: 'inline-block',
                    overflow: 'hidden',
                  }}
                >
                  Lainnya
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )}
        </LayoutGroup>
      </motion.nav>
    </div>
  );
}
