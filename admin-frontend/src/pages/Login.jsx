import { useState } from 'react';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (onLogin(password)) return;
    setError(true);
    setShake(true);
    setPassword('');
    setTimeout(() => setShake(false), 500);
  }

  return (
    <div className="login-page">
      <div className={`login-card ${shake ? 'shake' : ''}`}>
        <div className="login-logo">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="var(--accent)" />
            <path d="M8 16h16M16 8v16" stroke="#0a0b0d" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="login-title">DxbDipFinder - Admin</h1>
        <p className="login-subtitle">dxpdipfinder.com</p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setError(false); }}
            placeholder="Enter password"
            className="login-input"
            autoFocus
          />
          {error && <p className="login-error">Wrong password</p>}
          <button type="submit" className="login-button" disabled={!password}>
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
