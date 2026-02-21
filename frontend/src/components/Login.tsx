import { useState } from 'react';
import { API_KEY_STORAGE } from '../api';

interface Props {
  onLogin: () => void;
}

export function Login({ onLogin }: Props) {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/settings', {
        headers: { 'Authorization': `Bearer ${trimmed}` },
      });
      if (res.status === 401) {
        setError('Invalid API key.');
        return;
      }
      if (!res.ok) {
        setError(`Server error (${res.status}).`);
        return;
      }
      localStorage.setItem(API_KEY_STORAGE, trimmed);
      onLogin();
    } catch {
      setError('Could not reach server.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      animation: 'fade-in 0.2s ease',
    }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: '360px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          padding: '32px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border-2)',
          borderRadius: '14px',
          animation: 'slide-up 0.2s ease',
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '20px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text)',
          }}>
            Botphone
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>
            Enter your API key to continue
          </span>
        </div>

        {/* Input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-3)',
          }}>
            API Key
          </label>
          <input
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="••••••••••••••••"
            autoFocus
            style={{
              padding: '10px 12px',
              background: 'var(--surface)',
              border: `1px solid ${error ? 'var(--red)' : 'var(--border-2)'}`,
              borderRadius: '6px',
              color: 'var(--text)',
              fontSize: '13px',
              outline: 'none',
              fontFamily: 'monospace',
              letterSpacing: '0.05em',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => {
              if (!error) e.currentTarget.style.borderColor = 'var(--cyan)';
            }}
            onBlur={e => {
              if (!error) e.currentTarget.style.borderColor = 'var(--border-2)';
            }}
          />
          {error && (
            <span style={{ fontSize: '12px', color: 'var(--red)' }}>{error}</span>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading || !key.trim()}
          style={{
            padding: '11px',
            borderRadius: '6px',
            border: 'none',
            background: loading || !key.trim() ? 'var(--surface-3)' : 'var(--cyan)',
            color: loading || !key.trim() ? 'var(--text-3)' : '#000',
            fontWeight: 700,
            fontSize: '12px',
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            cursor: loading || !key.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
            fontFamily: "'Syne', sans-serif",
          }}
        >
          {loading ? 'Verifying...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
