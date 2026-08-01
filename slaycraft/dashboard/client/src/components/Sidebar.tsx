import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useLogout } from '../api/hooks';

const links = [
  { to: '/', label: 'Resumen' },
  { to: '/tareas', label: 'Tareas' },
  { to: '/granjas', label: 'Granjas' },
  { to: '/proyectos', label: 'Proyectos' },
  { to: '/jugadores', label: 'Jugadores' },
  { to: '/galeria', label: 'Galería' },
  { to: '/mapa', label: 'Mapa' },
];

export default function Sidebar() {
  const logout = useLogout();
  const location = useLocation();

  return (
    <aside className="flex w-full flex-row overflow-x-auto border-b border-border bg-panel sm:h-screen sm:w-52 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
      <div className="px-4 py-5 font-mono text-lg text-gold">SlayCraft</div>
      <nav className="flex flex-1 gap-1 px-2 sm:flex-col sm:gap-0 sm:space-y-1">
        {links.map((l) => {
          const isActive = l.to === '/' ? location.pathname === '/' : location.pathname.startsWith(l.to);
          return (
            <NavLink key={l.to} to={l.to} end={l.to === '/'} className="relative block">
              {isActive && (
                <motion.div
                  layoutId="active-pill"
                  className="absolute inset-0 rounded bg-base"
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
              <motion.span
                whileHover={{ x: 2 }}
                className={`relative block rounded px-3 py-2 text-sm ${isActive ? 'text-gold' : 'text-slate-300 hover:bg-base'}`}
              >
                {l.label}
              </motion.span>
            </NavLink>
          );
        })}
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
