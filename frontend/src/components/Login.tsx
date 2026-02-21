interface Props {
  error?: string;
}

function errorMessage(code: string): string {
  switch (code) {
    case 'not_allowed': return 'Your Google account is not authorized to access this app.';
    case 'invalid_state': return 'Login session expired. Please try again.';
    case 'token_exchange_failed': return 'Authentication failed. Please try again.';
    case 'server_error': return 'Server error. Please try again.';
    default: return `Authentication error: ${code}`;
  }
}

export function Login({ error }: Props) {
  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      animation: 'fade-in 0.2s ease',
    }}>
      <div
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
            Sign in with your Google account to continue
          </span>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 12px',
            borderRadius: '6px',
            background: 'rgba(255,79,79,0.08)',
            border: '1px solid rgba(255,79,79,0.25)',
            fontSize: '13px',
            color: 'var(--red)',
          }}>
            {errorMessage(error)}
          </div>
        )}

        {/* Sign in button */}
        <a
          href="/api/auth/login"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '11px 16px',
            borderRadius: '6px',
            border: '1px solid var(--border-2)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontWeight: 600,
            fontSize: '13px',
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'var(--surface)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)';
          }}
        >
          {/* Google icon */}
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </a>
      </div>
    </div>
  );
}
