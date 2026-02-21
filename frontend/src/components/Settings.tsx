import { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../api';
import type { AppSettings } from '../api';

const OPENAI_VOICES = [
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable',
  'nova', 'onyx', 'sage', 'shimmer', 'verse', 'marin', 'cedar',
];

const input: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--surface)',
  border: '1px solid var(--border-2)',
  borderRadius: '6px',
  color: 'var(--text)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
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
}

export function Settings({ onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getSettings().then(setSettings).catch(() => setError('Failed to load settings'));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const updated = await updateSettings(settings);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
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
        onSubmit={handleSave}
        style={{
          width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--surface-2)',
          border: '1px solid var(--border-2)',
          borderRadius: '12px',
          padding: '28px',
          display: 'flex', flexDirection: 'column', gap: '20px',
          animation: 'slide-up 0.2s ease',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '20px', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Settings
          </h2>
          <button type="button" onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-3)',
            fontSize: '20px', lineHeight: 1, cursor: 'pointer', padding: '4px',
          }}>×</button>
        </div>

        {!settings ? (
          <div style={{ color: 'var(--text-3)', fontSize: '12px', letterSpacing: '0.05em', padding: '20px 0', textAlign: 'center' }}>
            {error || 'LOADING...'}
          </div>
        ) : (
          <>
            {/* Provider toggle */}
            <div>
              <span style={label}>AI Provider</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                {(['openai', 'elevenlabs'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSettings({ ...settings, provider: p })}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: '6px',
                      border: `1px solid ${settings.provider === p ? 'var(--cyan)' : 'var(--border-2)'}`,
                      background: settings.provider === p ? 'rgba(0,212,255,0.06)' : 'var(--surface)',
                      color: settings.provider === p ? 'var(--cyan)' : 'var(--text-2)',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '13px',
                      transition: 'all 0.1s',
                      fontFamily: 'inherit',
                    }}
                  >
                    {p === 'openai' ? 'OpenAI Realtime' : 'ElevenLabs'}
                  </button>
                ))}
              </div>
            </div>

            {/* OpenAI config */}
            {settings.provider === 'openai' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{
                  fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: 'var(--text-3)',
                  borderBottom: '1px solid var(--border)', paddingBottom: '8px',
                }}>
                  OpenAI Config
                </div>

                <div>
                  <label style={label}>Voice</label>
                  <select
                    value={settings.openai.voice}
                    onChange={e => setSettings({ ...settings, openai: { ...settings.openai, voice: e.target.value } })}
                    style={{ ...input, cursor: 'pointer' }}
                  >
                    {OPENAI_VOICES.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={label}>
                    Speed — {settings.openai.speed.toFixed(1)}×
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.1"
                    value={settings.openai.speed}
                    onChange={e => setSettings({ ...settings, openai: { ...settings.openai, speed: parseFloat(e.target.value) } })}
                    style={{ width: '100%', accentColor: 'var(--cyan)', cursor: 'pointer' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>
                    <span>0.5×</span>
                    <span>1.5×</span>
                  </div>
                </div>
              </div>
            )}

            {/* ElevenLabs config */}
            {settings.provider === 'elevenlabs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{
                  fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: 'var(--text-3)',
                  borderBottom: '1px solid var(--border)', paddingBottom: '8px',
                }}>
                  ElevenLabs Config
                </div>

                <div>
                  <label style={label}>Agent ID</label>
                  <input
                    type="text"
                    value={settings.elevenlabs.agentId}
                    onChange={e => setSettings({ ...settings, elevenlabs: { ...settings.elevenlabs, agentId: e.target.value } })}
                    placeholder="e.g. a7bd04a..."
                    style={input}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '6px' }}>
                    Find your Agent ID in the ElevenLabs dashboard under Conversational AI.
                  </div>
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

            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '11px',
                borderRadius: '6px',
                border: 'none',
                background: saved ? 'var(--green)' : saving ? 'var(--surface-3)' : 'var(--cyan)',
                color: saving ? 'var(--text-3)' : '#000',
                fontWeight: 700,
                fontSize: '13px',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                fontFamily: "'Syne', sans-serif",
              }}
            >
              {saved ? 'Saved ✓' : saving ? 'Saving...' : 'Save Settings'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
