import { NavLink } from 'react-router-dom';
import { useLogout } from '../api/hooks';

const links = [
  { to: '/', label: 'Resumen' },
  { to: '/tareas', label: 'Tareas' },
  { to: '/granjas', label: 'Granjas' },
  { to: '/jugadores', label: 'Jugadores' },
  { to: '/proyectos', label: 'Proyectos' },
  { to: '/galeria', label: 'Galería' },
  { to: '/mapa', label: 'Mapa' },
];

export default function Sidebar() {
  const logout = useLogout();
  return (
    <aside className="flex h-screen w-52 flex-col border-r border-border bg-panel">
      <div className="px-4 py-5 font-mono text-lg text-gold">SlayCraft</div>
      <nav className="flex-1 space-y-1 px-2">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) =>
              `block rounded px-3 py-2 text-sm ${isActive ? 'bg-base text-gold' : 'text-slate-300 hover:bg-base'}`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={() => logout.mutate()}
        className="m-2 rounded px-3 py-2 text-left text-sm text-slate-400 hover:bg-base hover:text-slate-100"
      >
        Cerrar sesión
      </button>
    </aside>
  );
}
