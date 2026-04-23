import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion } from '../hooks/useReducedMotion.js';

const BANNER_CONFIG = {
  'surat-jalan':  { icon: '📦', title: 'Daftar Surat Jalan',   subtitle: 'Monitoring pengiriman material' },
  'keuangan':     { icon: '💰', title: 'Keuangan',              subtitle: 'Arus kas & pengeluaran operasional' },
  'laporan-kas':  { icon: '📊', title: 'Laporan Kas',           subtitle: 'Rekap penerimaan & pembayaran' },
  'laporan-truk': { icon: '🚛', title: 'Laporan Truk',          subtitle: 'Aktivitas armada per periode' },
  'payslip':      { icon: '💼', title: 'Laporan Gaji',          subtitle: 'Slip gaji pengemudi' },
  'invoicing':    { icon: '🧾', title: 'Invoicing',             subtitle: 'Penagihan & pelacakan piutang' },
  'uang-muka':    { icon: '💵', title: 'Uang Muka',             subtitle: 'Manajemen uang muka per rute' },
  'master-data':  { icon: '🗂️', title: 'Master Data',          subtitle: 'Rute · Material · Armada · Supir' },
  'users':        { icon: '👥', title: 'Kelola User',           subtitle: 'Manajemen akses pengguna' },
  'settings':     { icon: '⚙️', title: 'Pengaturan',           subtitle: 'Konfigurasi aplikasi' },
};

export default function SectionBanner({ activeTab }) {
  const prefersReducedMotion = useReducedMotion();

  const contentSpring = prefersReducedMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 280, damping: 24, mass: 0.7 };

  const config = BANNER_CONFIG[activeTab];
  if (!config) return null;

  return (
    <div style={{
      position: 'sticky',
      top: 57,
      zIndex: 49,
      background: 'rgba(15,23,42,0.55)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '0.5px solid rgba(255,255,255,0.07)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
    }}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 8 }}
          transition={contentSpring}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 16px',
          }}
        >
          {/* Icon pill */}
          <div style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: 'rgba(56,189,248,0.12)',
            border: '0.5px solid rgba(56,189,248,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
            flexShrink: 0,
          }}>
            {config.icon}
          </div>

          {/* Text */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{
              fontSize: 13,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.92)',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              fontFamily: "'SF Pro Display', Inter, sans-serif",
            }}>
              {config.title}
            </span>
            <span style={{
              fontSize: 10,
              color: 'rgba(255,255,255,0.42)',
              letterSpacing: '0.01em',
              fontFamily: "'SF Pro Text', Inter, sans-serif",
            }}>
              {config.subtitle}
            </span>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
