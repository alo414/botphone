const STATUS: Record<string, { label: string; color: string; live?: boolean }> = {
  queued:      { label: 'Queued',      color: 'var(--text-2)' },
  ringing:     { label: 'Ringing',     color: 'var(--amber)', live: true },
  in_progress: { label: 'Live',        color: 'var(--amber)', live: true },
  completed:   { label: 'Completed',   color: 'var(--green)' },
  failed:      { label: 'Failed',      color: 'var(--red)' },
  no_answer:   { label: 'No Answer',   color: 'var(--text-2)' },
  busy:        { label: 'Busy',        color: 'var(--text-2)' },
};

export function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS[status] || { label: status, color: 'var(--text-2)' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      <span style={{
        position: 'relative',
        display: 'inline-block',
        width: '7px',
        height: '7px',
        flexShrink: 0,
      }}>
        {cfg.live && (
          <span style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: cfg.color,
            animation: 'pulse-ring 1.4s ease-out infinite',
          }} />
        )}
        <span style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: cfg.color,
          animation: cfg.live ? 'blink 1.4s ease-in-out infinite' : undefined,
        }} />
      </span>
      <span style={{
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: cfg.color,
      }}>
        {cfg.label}
      </span>
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  const cfg = STATUS[status] || { label: status, color: 'var(--text-3)' };
  return (
    <span style={{ position: 'relative', display: 'inline-block', width: '8px', height: '8px', flexShrink: 0 }}>
      {cfg.live && (
        <span style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: cfg.color,
          animation: 'pulse-ring 1.4s ease-out infinite',
        }} />
      )}
      <span style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        background: cfg.color,
        animation: cfg.live ? 'blink 1.4s ease-in-out infinite' : undefined,
      }} />
    </span>
  );
}
