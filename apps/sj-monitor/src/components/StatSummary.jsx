const FONT_STACK = "'SF Pro Text', 'SF Pro Display', Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const StatSummary = ({ title, stats = [] }) => {
  if (!Array.isArray(stats) || stats.length === 0) {
    return null;
  }

  return (
    <section
      style={{
        marginBottom: 16,
        padding: '14px 16px 16px',
        borderRadius: 16,
        border: '1px solid rgba(148, 163, 184, 0.22)',
        background: 'rgba(255, 255, 255, 0.86)',
        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        fontFamily: FONT_STACK,
      }}
    >
      {title && (
        <p
          style={{
            margin: '0 0 12px',
            color: '#8e8e93',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0,
            lineHeight: 1.2,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          width: '100%',
        }}
      >
        {stats.map((stat, index) => (
          <div
            key={`${stat.label}-${index}`}
            style={{
              flex: '1 1 0',
              minWidth: 0,
              paddingLeft: index === 0 ? 0 : 12,
              paddingRight: index === stats.length - 1 ? 0 : 12,
              borderLeft: index === 0 ? 'none' : '1px solid rgba(142, 142, 147, 0.22)',
            }}
          >
            <div
              style={{
                color: stat.color || '#1c1c1e',
                fontSize: 'clamp(18px, 5vw, 24px)',
                fontWeight: 800,
                letterSpacing: 0,
                lineHeight: 1.12,
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                marginTop: 5,
                color: '#6b7280',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 0,
                lineHeight: 1.25,
                overflowWrap: 'anywhere',
              }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default StatSummary;
