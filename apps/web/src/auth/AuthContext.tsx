import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthedUser, RegisterRequest, ResetPasswordRequest } from '@dc/shared';
import { api } from '../api.ts';

/**
 * Holds the "who am I?" answer for the whole app. On mount it asks the server
 * once; while that's in flight, `loading` is true so we don't flash the login
 * screen at someone who is actually logged in.
 */
interface AuthState {
  user: AuthedUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (req: RegisterRequest) => Promise<void>;
  resetPassword: (req: ResetPasswordRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<AuthedUser>('/api/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    setUser(await api.post<AuthedUser>('/api/auth/login', { username, password }));
  };
  const register = async (req: RegisterRequest) => {
    setUser(await api.post<AuthedUser>('/api/auth/register', req));
  };
  const resetPassword = async (req: ResetPasswordRequest) => {
    setUser(await api.post<AuthedUser>('/api/auth/reset', req));
  };
  const logout = async () => {
    await api.post('/api/auth/logout');
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, loading, login, register, resetPassword, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
