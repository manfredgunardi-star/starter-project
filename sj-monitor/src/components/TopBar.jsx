import { motion } from 'framer-motion';
import { LogOut } from 'lucide-react';

const PAGE_TITLES = {
  'surat-jalan':  'Surat Jalan',
  'keuangan':     'Keuangan',
  'laporan-kas':  'Laporan Kas',
  'laporan-truk': 'Laporan Truk',
  'payslip':      'Laporan Gaji',
  'invoicing':    'Invoicing',
  'uang-muka':    'Uang Muka',
  'master-data':  'Master Data',
  'users':        'Kelola User',
  'settings':     'Pengaturan',
};

export default function TopBar({ activeTab, currentUser, onLogout }) {
  const pageTitle = PAGE_TITLES[activeTab] ?? 'Monitoring SJ';
  const initials = (currentUser?.name ?? 'U').charAt(0).toUpperCase();

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 150, damping: 20 }}
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(15,23,42,0.6)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderBottom: '0.5px solid rgba(255,255,255,0.1)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
      }}>
        {/* Page title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            color: 'rgba(56,189,248,0.75)',
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            fontFamily: "'SF Pro Display', Inter, sans-serif",
          }}>
            sj-monitor
          </span>
          <span style={{
            fontSize: 17,
            fontWeight: 700,
            color: 'white',
            letterSpacing: '-0.025em',
            lineHeight: 1.2,
            fontFamily: "'SF Pro Display', Inter, sans-serif",
          }}>
            {pageTitle}
          </span>
        </div>

        {/* Right: user pill + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* User pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255,255,255,0.08)',
            border: '0.5px solid rgba(255,255,255,0.15)',
            borderRadius: 9999,
            padding: '5px 10px',
          }}>
            <div style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #38bdf8, #6366f1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 10, color: 'white', fontWeight: 700 }}>
                {initials}
              </span>
            </div>
            <span style={{
              fontSize: 12,
              color: 'rgba(255,255,255,0.8)',
              fontWeight: 500,
              fontFamily: "'SF Pro Text', Inter, sans-serif",
            }}>
              {currentUser?.name ?? ''}
            </span>
          </div>

          {/* Logout button */}
          <motion.button
            type="button"
            onClick={onLogout}
            title="Keluar"
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              border: '0.5px solid rgba(255,255,255,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <LogOut size={14} color="rgba(248,113,113,0.85)" />
          </motion.button>
        </div>
      </div>
    </motion.header>
  );
}
