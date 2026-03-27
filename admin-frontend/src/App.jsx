import { useState, useCallback } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD;

export default function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('ddp_admin') === '1');

  const handleLogin = useCallback((pw) => {
    if (pw === ADMIN_PASSWORD) {
      sessionStorage.setItem('ddp_admin', '1');
      setAuthed(true);
      return true;
    }
    return false;
  }, []);

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem('ddp_admin');
    setAuthed(false);
  }, []);

  if (!authed) return <Login onLogin={handleLogin} />;
  return <Dashboard onLogout={handleLogout} />;
}
