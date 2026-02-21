import { useState } from 'react';
import { createCall } from '../api';
import type { CreateCallPayload } from '../api';

const SCOPES = [
  { value: 'restaurant',   label: 'Restaurant',    desc: 'Reservations, wait times' },
  { value: 'general_info', label: 'General Info',  desc: 'Hours, availability, pricing' },
  { value: 'appointment',  label: 'Appointment',   desc: 'Schedule bookings' },
  { value: 'general',      label: 'General',       desc: 'Freeform objective' },
];

const CTX_FIELDS: Record<string, { key: string; label: string; placeholder: string }[]> = {
  restaurant:   [
    { key: 'partySize',     label: 'Party Size',     placeholder: 'e.g. 4' },
    { key: 'preferredDate', label: 'Date',            placeholder: 'e.g. Friday' },
    { key: 'preferredTime', label: 'Time',            placeholder: 'e.g. 7:00 PM' },
  ],
  general_info: [{ key: 'itemName', label: 'Item', placeholder: 'e.g. iPhone 16 Pro' }],
  appointment:  [
    { key: 'preferredDate', label: 'Date',            placeholder: 'e.g. next Tuesday' },
    { key: 'preferredTime', label: 'Time',            placeholder: 'e.g. morning' },
  ],
  general: [],
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--surface)',
  border: '1px solid var(--border-2)',
  borderRadius: '6px',
  color: 'var(--text)',
  fontSize: '13px',
  outline: 'none',
  transition: 'border-color 0.15s',
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-3)',
  marginBottom: '6px',
};

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export function CallForm({ onClose, onCreated }: Props) {
  const [scope, setScope]       = useState('general');
  const [inputType, setIT]      = useState<'phone' | 'place'>('phone');
  const [phone, setPhone]       = useState('');
  const [placeId, setPlaceId]   = useState('');
  const [objective, setObj]     = useState('');
  const [ctx, setCtx]           = useState<Record<string, string>>({});
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const payload: CreateCallPayload = {
      scope,
      objective,
      context: Object.fromEntries(Object.entries(ctx).filter(([, v]) => v)),
    };
    if (inputType === 'phone') payload.phoneNumber = phone;
    else payload.placeId = placeId;
    try {
      await createCall(payload);
      onCreated();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const ctxFields = CTX_FIELDS[scope] || [];

  return (
    /* Backdrop */
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'fade-in 0.15s ease',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%', maxWidth: '480px', maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--surface-2)',
          border: '1px solid var(--border-2)',
          borderRadius: '12px',
          padding: '28px',
          display: 'flex', flexDirection: 'column', gap: '20px',
          animation: 'slide-up 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>
            New Call
          </h2>
          <button type="button" onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-3)',
            fontSize: '20px', lineHeight: 1, cursor: 'pointer', padding: '4px',
          }}>×</button>
        </div>

        {/* Scope */}
        <div>
          <span style={label}>Scope</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {SCOPES.map(s => (
              <button key={s.value} type="button" onClick={() => setScope(s.value)} style={{
                padding: '10px 12px',
                borderRadius: '6px',
                border: `1px solid ${scope === s.value ? 'var(--cyan)' : 'var(--border-2)'}`,
                background: scope === s.value ? 'rgba(0,212,255,0.06)' : 'var(--surface)',
                color: scope === s.value ? 'var(--cyan)' : 'var(--text-2)',
                textAlign: 'left', cursor: 'pointer', transition: 'all 0.1s',
              }}>
                <div style={{ fontWeight: 600, fontSize: '13px' }}>{s.label}</div>
                <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '2px' }}>{s.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Contact */}
        <div>
          <span style={label}>Contact</span>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            {(['phone', 'place'] as const).map(t => (
              <button key={t} type="button" onClick={() => setIT(t)} style={{
                padding: '5px 12px', borderRadius: '4px', cursor: 'pointer',
                border: `1px solid ${inputType === t ? 'var(--border-2)' : 'var(--border)'}`,
                background: inputType === t ? 'var(--surface-3)' : 'transparent',
                color: inputType === t ? 'var(--text)' : 'var(--text-3)',
                fontSize: '11px', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>
                {t === 'phone' ? 'Phone Number' : 'Place ID'}
              </button>
            ))}
          </div>
          {inputType === 'phone'
            ? <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000" style={input} required />
            : <input type="text" value={placeId} onChange={e => setPlaceId(e.target.value)}
                placeholder="ChIJ..." style={input} required />}
        </div>

        {/* Objective */}
        <div>
          <span style={label}>Objective</span>
          <textarea value={objective} onChange={e => setObj(e.target.value)}
            placeholder="What should the AI accomplish?"
            style={{ ...input, minHeight: '90px', resize: 'vertical', lineHeight: '1.5' }}
            required />
        </div>

        {/* Context */}
        {ctxFields.length > 0 && (
          <div>
            <span style={label}>Context</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {ctxFields.map(f => (
                <div key={f.key}>
                  <label style={{ ...label, marginBottom: '4px', color: 'var(--text-3)' }}>{f.label}</label>
                  <input type="text" value={ctx[f.key] || ''} placeholder={f.placeholder}
                    onChange={e => setCtx({ ...ctx, [f.key]: e.target.value })} style={input} />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div style={{
            padding: '10px 12px', borderRadius: '6px',
            background: 'rgba(255,79,79,0.08)', border: '1px solid rgba(255,79,79,0.3)',
            color: 'var(--red)', fontSize: '13px',
          }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} style={{
          padding: '11px',
          borderRadius: '6px',
          border: 'none',
          background: loading ? 'var(--surface-3)' : 'var(--cyan)',
          color: loading ? 'var(--text-3)' : '#000',
          fontWeight: 700,
          fontSize: '13px',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all 0.1s',
          fontFamily: "'Syne', sans-serif",
        }}>
          {loading ? 'Initiating...' : 'Start Call'}
        </button>
      </form>
    </div>
  );
}
