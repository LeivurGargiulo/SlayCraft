import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext.js';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  if (token === undefined) return <Navigate to="/login" replace />;
  return children;
}
