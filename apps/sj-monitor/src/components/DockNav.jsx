import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion.js';

export default function DockNav({ items, activeTab, onTabChange }) {
  const prefersReducedMotion = useReducedMotion();

  const noMotion = { duration: 0 };
  const entrySpring  = prefersReducedMotion ? noMotion : { type: 'spring', stiffness: 220, damping: 20, mass: 0.8 };
  const layoutSpring = prefersReducedMotion ? noMotion : { type: 'spring', stiffness: 380, damping: 26, mass: 0.7 };
  const labelSpring  = prefersReducedMotion ? noMotion : { type: 'spring', stiffness: 320, damping: 22, mass: 0.6 };
  const tapSpring    = prefersReducedMotion ? noMotion : { type: 'spring', stiffness: 600, damping: 28, mass: 0.5 };

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
      <motion.nav
        className="scrollbar-hide"
        initial={{ opacity: 0, y: 32, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ ...entrySpring, delay: 0.08 }}
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
          pointerEvents: 'auto',
        }}
      >
        <LayoutGroup>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.tab;

          return (
            <motion.button
              key={item.tab}
              type="button"
              onClick={() => onTabChange(item.tab)}
              layout
              transition={layoutSpring}
              title={item.label}
              whileTap={{ scale: 0.85, transition: tapSpring }}
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
                transition={layoutSpring}
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
                    transition={labelSpring}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#bae6fd',
                      letterSpacing: '-0.02em',
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
        </LayoutGroup>
      </motion.nav>
    </div>
  );
}
