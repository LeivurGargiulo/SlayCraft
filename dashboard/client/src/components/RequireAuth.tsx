import { Navigate, Outlet } from 'react-router-dom';
import { useMe } from '../api/hooks';

export default function RequireAuth() {
  const me = useMe();
  if (me.isLoading) return <div className="p-8 text-slate-400">Cargando…</div>;
  if (me.isError) return <Navigate to="/login" replace />;
  return <Outlet />;
}
