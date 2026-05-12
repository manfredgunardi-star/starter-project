import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZE = 10;

export const getPageCount = (total, pageSize = PAGE_SIZE) => Math.max(1, Math.ceil(total / pageSize));

export const clampPage = (page, total, pageSize = PAGE_SIZE) => (
  Math.min(Math.max(Number(page) || 1, 1), getPageCount(total, pageSize))
);

export default function Pagination({ total, page, pageSize = PAGE_SIZE, onChange }) {
  const totalPages = getPageCount(total, pageSize);
  const safePage = clampPage(page, total, pageSize);
  if (totalPages <= 1) return null;

  const btnStyle = (enabled) => ({
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.1)',
    background: enabled ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.05)',
    color: enabled ? '#38bdf8' : 'rgba(255,255,255,0.2)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    fontSize: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
  });

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 6,
      padding: '14px 0',
    }}>
      <button
        onClick={() => onChange(1)}
        disabled={safePage <= 1}
        style={btnStyle(safePage > 1)}
      >{'<<'}</button>

      <button
        onClick={() => onChange(safePage - 1)}
        disabled={safePage <= 1}
        style={btnStyle(safePage > 1)}
      >
        <ChevronLeft size={14} />
      </button>

      <span style={{
        color: '#94a3b8',
        fontSize: 13,
        minWidth: 90,
        textAlign: 'center',
        fontFamily: "'SF Pro Text', Inter, sans-serif",
      }}>
        {safePage} / {totalPages}
        <span style={{ color: 'rgba(148,163,184,0.5)', fontSize: 11, marginLeft: 4 }}>
          ({total})
        </span>
      </span>

      <button
        onClick={() => onChange(safePage + 1)}
        disabled={safePage >= totalPages}
        style={btnStyle(safePage < totalPages)}
      >
        <ChevronRight size={14} />
      </button>

      <button
        onClick={() => onChange(totalPages)}
        disabled={safePage >= totalPages}
        style={btnStyle(safePage < totalPages)}
      >{'>>'}</button>
    </div>
  );
}
