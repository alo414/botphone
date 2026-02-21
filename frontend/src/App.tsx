import { useState, useEffect, useRef } from 'react';
import { CallList } from './components/CallList';
import { CallDetail } from './components/CallDetail';
import { CallForm } from './components/CallForm';
import { Settings } from './components/Settings';
import { Login } from './components/Login';
import { API_KEY_STORAGE, pingHealth } from './api';

export default function App() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem(API_KEY_STORAGE));
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [waking, setWaking] = useState(false);
  const wakingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    wakingTimer.current = setTimeout(() => setWaking(true), 800);
    pingHealth().finally(() => {
      if (wakingTimer.current) clearTimeout(wakingTimer.current);
      setWaking(false);
    });
    return () => { if (wakingTimer.current) clearTimeout(wakingTimer.current); };
  }, []);

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  function handleLogout() {
    localStorage.removeItem(API_KEY_STORAGE);
    setAuthed(false);
    setSelectedCallId(null);
    setShowForm(false);
    setShowSettings(false);
  }

  function handleCreated() {
    setRefreshKey(k => k + 1);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        height: '52px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '16px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text)',
          }}>
            Botphone
          </span>
          <span style={{
            width: '1px', height: '16px',
            background: 'var(--border-2)',
          }} />
          <span style={{
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--text-3)',
            letterSpacing: '0.04em',
          }}>
            AI Call Agent
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleLogout}
            title="Sign out"
            style={{
              padding: '7px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-2)',
              background: 'transparent',
              color: 'var(--text-3)',
              fontSize: '13px',
              lineHeight: 1,
              cursor: 'pointer',
              transition: 'background 0.1s, color 0.1s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255,79,79,0.08)';
              (e.currentTarget as HTMLElement).style.color = 'var(--red)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,79,79,0.3)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)';
            }}
          >
            Sign out
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            style={{
              padding: '7px 10px',
              borderRadius: '6px',
              border: '1px solid var(--border-2)',
              background: 'transparent',
              color: 'var(--text-3)',
              fontSize: '16px',
              lineHeight: 1,
              cursor: 'pointer',
              transition: 'background 0.1s, color 0.1s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)';
              (e.currentTarget as HTMLElement).style.color = 'var(--text)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
            }}
          >
            ⚙
          </button>
          <button
            onClick={() => setShowForm(true)}
            style={{
              padding: '7px 16px',
              borderRadius: '6px',
              border: '1px solid var(--cyan)',
              background: 'rgba(0,212,255,0.06)',
              color: 'var(--cyan)',
              fontWeight: 700,
              fontSize: '11px',
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: "'Syne', sans-serif",
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,212,255,0.12)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,212,255,0.06)'; }}
          >
            + New Call
          </button>
        </div>
      </header>

      {/* Waking banner */}
      {waking && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '7px 20px',
          background: 'rgba(255,170,0,0.07)',
          borderBottom: '1px solid rgba(255,170,0,0.2)',
          fontSize: '12px',
          color: 'rgba(255,170,0,0.9)',
          flexShrink: 0,
        }}>
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: '11px' }}>⟳</span>
          Server is starting up — this takes a few seconds...
        </div>
      )}

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        <aside style={{
          width: '300px',
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          background: 'var(--surface)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            padding: '12px 16px 10px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0,
          }}>
            <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
              Call Log
            </span>
          </div>
          <CallList
            selectedCallId={selectedCallId}
            onSelectCall={setSelectedCallId}
            refreshKey={refreshKey}
          />
        </aside>

        {/* Main */}
        <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
          {selectedCallId ? (
            <CallDetail
              key={selectedCallId}
              callId={selectedCallId}
              onBack={() => setSelectedCallId(null)}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              color: 'var(--text-3)',
              userSelect: 'none',
            }}>
              <div style={{
                width: '48px', height: '48px',
                borderRadius: '12px',
                border: '1px solid var(--border-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '22px',
                background: 'var(--surface)',
              }}>
                📞
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-2)', marginBottom: '6px' }}>
                  Select a call to view details
                </p>
                <p style={{ fontSize: '12px', color: 'var(--text-3)' }}>
                  or{' '}
                  <button onClick={() => setShowForm(true)} style={{
                    background: 'none', border: 'none', color: 'var(--cyan)',
                    cursor: 'pointer', fontSize: '12px', padding: 0, fontFamily: 'inherit',
                  }}>
                    start a new call
                  </button>
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Form modal */}
      {showForm && (
        <CallForm
          onClose={() => setShowForm(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Settings modal */}
      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}
