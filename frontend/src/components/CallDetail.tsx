import { useEffect, useRef, useState } from 'react';
import { getCall, getLiveTranscript, hangupCall } from '../api';
import type { CallRecord, TranscriptItem } from '../api';
import { StatusBadge } from './StatusBadge';

const ACTIVE = new Set(['queued', 'ringing', 'in_progress']);

function formatKey(k: string) {
  return k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
}
function formatVal(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  return String(v);
}

function Bubble({ entry, animate }: { entry: TranscriptItem; animate?: boolean }) {
  const isAgent = entry.role === 'agent';
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isAgent ? 'flex-start' : 'flex-end',
      animation: animate ? 'slide-up 0.25s ease both' : undefined,
    }}>
      <div style={{
        fontSize: '10px',
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-3)',
        marginBottom: '4px',
        paddingLeft: isAgent ? '4px' : '0',
        paddingRight: isAgent ? '0' : '4px',
      }}>
        {isAgent ? 'AI Agent' : 'Caller'}
      </div>
      <div style={{
        maxWidth: '80%',
        padding: '10px 14px',
        borderRadius: isAgent ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
        background: isAgent ? 'var(--surface-3)' : 'rgba(0, 212, 255, 0.08)',
        border: `1px solid ${isAgent ? 'var(--border)' : 'rgba(0, 212, 255, 0.15)'}`,
        fontFamily: "'Martian Mono', monospace",
        fontSize: '12.5px',
        lineHeight: '1.6',
        color: isAgent ? 'var(--text)' : 'rgba(180, 240, 255, 0.9)',
        fontWeight: 300,
      }}>
        {entry.text}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', flexDirection: 'column' }}>
      <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '4px', paddingLeft: '4px' }}>
        AI Agent
      </div>
      <div style={{
        padding: '12px 16px',
        borderRadius: '4px 12px 12px 12px',
        background: 'var(--surface-3)',
        border: '1px solid var(--border)',
        display: 'flex',
        gap: '4px',
        alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: '5px', height: '5px', borderRadius: '50%',
            background: 'var(--text-3)',
            animation: `blink 1.2s ease-in-out ${i * 0.2}s infinite`,
            display: 'inline-block',
          }} />
        ))}
      </div>
    </div>
  );
}

interface Props {
  callId: string;
  onBack: () => void;
}

export function CallDetail({ callId, onBack }: Props) {
  const [call, setCall] = useState<CallRecord | null>(null);
  const [liveTranscript, setLiveTranscript] = useState<TranscriptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [hangingUp, setHangingUp] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  // Fetch call record
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setLiveTranscript([]);
    prevCountRef.current = 0;
    getCall(callId)
      .then(data => { if (!cancelled) { setCall(data); setLoading(false); } })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message.includes('404') ? 'Call not found' : 'Failed to load — tap to retry');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [callId, retryKey]);

  // Refresh call record while active
  useEffect(() => {
    if (!call || !ACTIVE.has(call.status)) return;
    const id = setInterval(() => {
      getCall(callId).then(setCall).catch(() => {});
    }, 3000);
    return () => clearInterval(id);
  }, [call, callId]);

  // Poll live transcript
  useEffect(() => {
    if (!call || !ACTIVE.has(call.status)) return;
    const poll = () => {
      getLiveTranscript(callId)
        .then(data => setLiveTranscript(data.transcript))
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 1500);
    return () => clearInterval(id);
  }, [call, callId]);

  // Scroll to bottom when transcript grows
  useEffect(() => {
    const transcript = call?.transcript || liveTranscript;
    if (transcript.length > prevCountRef.current) {
      prevCountRef.current = transcript.length;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [call?.transcript, liveTranscript]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: '12px', letterSpacing: '0.05em' }}>
        LOADING...
      </div>
    );
  }
  if (error || !call) {
    const msg = error ?? 'Call not found';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px' }}>
        <span style={{ color: 'var(--red)', fontSize: '13px' }}>{msg}</span>
        {msg !== 'Call not found' && (
          <button onClick={() => setRetryKey(k => k + 1)} style={{
            padding: '6px 16px', borderRadius: '6px', border: '1px solid var(--border-2)',
            background: 'var(--surface)', color: 'var(--text-2)', fontSize: '12px', cursor: 'pointer',
          }}>
            Retry
          </button>
        )}
      </div>
    );
  }

  const isActive = ACTIVE.has(call.status);
  const transcript: TranscriptItem[] = isActive ? liveTranscript : (call.transcript || []);
  const name = call.business_name || call.phone_number;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', animation: 'fade-in 0.2s ease' }}>
      {/* Header */}
      <div style={{
        padding: '20px 28px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: 'var(--text-3)',
          fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase',
          cursor: 'pointer', padding: 0, marginBottom: '14px',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <span>←</span> All Calls
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
              <h2 style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: '22px',
                fontWeight: 700,
                color: 'var(--text)',
                letterSpacing: '-0.02em',
              }}>
                {name}
              </h2>
              <StatusBadge status={call.status} />
              {isActive && (
                <button
                  onClick={() => {
                    setHangingUp(true);
                    hangupCall(callId).catch(() => {}).finally(() => setHangingUp(false));
                  }}
                  disabled={hangingUp}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,79,79,0.4)',
                    background: 'rgba(255,79,79,0.08)',
                    color: 'var(--red)',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    cursor: hangingUp ? 'not-allowed' : 'pointer',
                    opacity: hangingUp ? 0.5 : 1,
                    fontFamily: "'Syne', sans-serif",
                  }}
                >
                  {hangingUp ? 'Hanging up…' : '✕ Hang Up'}
                </button>
              )}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-3)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {call.business_name && <span>{call.phone_number}</span>}
              <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{call.scope}</span>
              <span>{new Date(call.created_at).toLocaleString()}</span>
              {call.duration_seconds && <span>{call.duration_seconds}s</span>}
            </div>
          </div>
        </div>

        <div style={{
          marginTop: '12px',
          fontSize: '13px',
          color: 'var(--text-2)',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '8px 12px',
        }}>
          <span style={{ color: 'var(--text-3)', fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginRight: '8px' }}>Objective</span>
          {call.objective}
        </div>
      </div>

      {/* Summary */}
      {call.summary && (
        <div style={{
          padding: '16px 28px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(0, 200, 122, 0.04)',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: '8px' }}>
            Summary
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text)', marginBottom: Object.keys(call.summary.structuredData).length ? '12px' : 0, lineHeight: '1.6' }}>
            {call.summary.outcome}
          </p>
          {Object.keys(call.summary.structuredData).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {Object.entries(call.summary.structuredData).map(([k, v]) => (
                <div key={k} style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '12px',
                }}>
                  <span style={{ color: 'var(--text-3)', marginRight: '6px' }}>{formatKey(k)}</span>
                  <span style={{ color: 'var(--text)', fontWeight: 500 }}>{formatVal(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transcript */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '12px 28px 8px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
            Transcript
          </span>
          {isActive && (
            <span style={{
              fontSize: '10px', fontWeight: 600, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: 'var(--amber)',
              animation: 'blink 1.4s ease-in-out infinite',
            }}>
              ● Live
            </span>
          )}
          {transcript.length > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--text-3)', marginLeft: 'auto' }}>
              {transcript.length} turn{transcript.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {transcript.length === 0 ? (
            <div style={{ color: 'var(--text-3)', fontSize: '12px', textAlign: 'center', paddingTop: '40px' }}>
              {isActive
                ? call.status === 'in_progress'
                  ? 'Waiting for conversation to begin...'
                  : call.status === 'ringing'
                    ? 'Ringing...'
                    : 'Connecting...'
                : 'No transcript recorded'}
            </div>
          ) : (
            transcript.map((entry, i) => (
              <Bubble key={i} entry={entry} animate={i >= transcript.length - 2} />
            ))
          )}
          {isActive && call.status === 'in_progress' && (
            <TypingIndicator />
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
