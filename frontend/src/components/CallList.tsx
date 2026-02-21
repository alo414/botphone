import { useEffect, useState } from 'react';
import { listCalls } from '../api';
import type { CallRecord } from '../api';
import { StatusDot } from './StatusBadge';

const ACTIVE = new Set(['queued', 'ringing', 'in_progress']);

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface Props {
  selectedCallId: string | null;
  onSelectCall: (id: string) => void;
  refreshKey: number;
}

export function CallList({ selectedCallId, onSelectCall, refreshKey }: Props) {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCalls({ limit: 50 })
      .then(data => { if (!cancelled) { setCalls(data); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Fast-poll while any call is active; slow-poll always to catch MCP-created calls
  useEffect(() => {
    const hasActive = calls.some(c => ACTIVE.has(c.status));
    const id = setInterval(() => {
      listCalls({ limit: 50 }).then(setCalls).catch(() => {});
    }, hasActive ? 2500 : 10000);
    return () => clearInterval(id);
  }, [calls]);

  const sorted = [...calls].sort((a, b) => {
    const aA = ACTIVE.has(a.status) ? 0 : 1;
    const bA = ACTIVE.has(b.status) ? 0 : 1;
    if (aA !== bA) return aA - bA;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  if (loading && calls.length === 0) {
    return (
      <div style={{ padding: '24px 16px', color: 'var(--text-3)', fontSize: '12px', letterSpacing: '0.05em' }}>
        LOADING...
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div style={{ padding: '24px 16px', color: 'var(--text-3)', fontSize: '12px' }}>
        No calls yet.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {sorted.map((call, i) => {
        const isSelected = call.id === selectedCallId;
        const isActive = ACTIVE.has(call.status);
        const name = call.business_name || call.phone_number;

        return (
          <button
            key={call.id}
            onClick={() => onSelectCall(call.id)}
            style={{
              display: 'block',
              width: '100%',
              padding: '14px 16px',
              background: isSelected ? 'var(--surface-3)' : 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border)',
              borderLeft: `3px solid ${isActive ? 'var(--amber)' : isSelected ? 'var(--border-2)' : 'transparent'}`,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background 0.1s',
              animation: i < 3 ? `fade-in 0.3s ease ${i * 0.05}s both` : undefined,
            }}
            onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
            onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
              <StatusDot status={call.status} />
              <span style={{
                flex: 1,
                fontWeight: 600,
                fontSize: '13px',
                color: 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {name}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-3)', flexShrink: 0 }}>
                {relativeTime(call.created_at)}
              </span>
            </div>
            <div style={{
              fontSize: '12px',
              color: 'var(--text-2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              paddingLeft: '16px',
            }}>
              {call.objective}
            </div>
            {call.duration_seconds && (
              <div style={{ fontSize: '11px', color: 'var(--text-3)', paddingLeft: '16px', marginTop: '3px' }}>
                {call.duration_seconds}s
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
