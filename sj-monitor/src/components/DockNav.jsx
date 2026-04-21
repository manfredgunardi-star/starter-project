import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';

const spring = { type: 'spring', stiffness: 150, damping: 20 };

export default function DockNav({ items, activeTab, onTabChange }) {
  return (
    <motion.nav
      initial={{ opacity: 0, y: 24, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring, delay: 0.1 }}
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
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
            transition={spring}
            title={item.label}
            style={{
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
            <Icon
              size={isActive ? 15 : 20}
              color={isActive ? '#38bdf8' : 'rgba(255,255,255,0.35)'}
              strokeWidth={isActive ? 2.5 : 2}
            />
            <AnimatePresence>
              {isActive && (
                <motion.span
                  key="label"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={spring}
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
  );
}
