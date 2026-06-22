import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { theme } from './theme.ts';
import { AuthProvider, useAuth } from './auth/AuthContext.tsx';
import { SocketProvider } from './socket/SocketContext.tsx';
import { Login } from './pages/Login.tsx';
import { Register } from './pages/Register.tsx';
import { AppShell } from './AppShell.tsx';

/** The bouncer: wait for the "who am I?" answer, then allow in or redirect. */
function Protected() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: theme.chatBg, color: theme.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return (
    <SocketProvider>
      <AppShell />
    </SocketProvider>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/invite/:token" element={<Register />} />
          <Route path="/*" element={<Protected />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
