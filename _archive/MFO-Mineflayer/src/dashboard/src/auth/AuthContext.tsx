import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setAuthToken, setUnauthorizedHandler } from '../api/client.js';

const STORAGE_KEY = 'mfo.token';

interface AuthContextValue {
  readonly token: string | undefined;
  readonly login: (username: string, password: string) => Promise<void>;
  readonly logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Single long-lived JWT, no refresh flow (confirmed with the user) — a 401 anywhere just clears it and drops back to the login screen. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | undefined>(
    () => localStorage.getItem(STORAGE_KEY) ?? undefined,
  );

  useEffect(() => {
    setAuthToken(token);
  }, [token]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(undefined);
    });
    return () => {
      setUnauthorizedHandler(undefined);
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      login: async (username, password) => {
        const { token: issued } = await api.login(username, password);
        localStorage.setItem(STORAGE_KEY, issued);
        setToken(issued);
      },
      logout: () => {
        localStorage.removeItem(STORAGE_KEY);
        setToken(undefined);
      },
    }),
    [token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
