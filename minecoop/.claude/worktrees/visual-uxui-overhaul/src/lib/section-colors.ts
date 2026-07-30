export type SectionKey = 'proyectos' | 'granjas' | 'jugadores' | 'tareas' | 'admin' | 'accent';

interface SectionClasses {
  border: string;
  borderHover: string;
  text: string;
  hoverText: string;
  bg: string;
}

export const SECTION_COLORS: Record<SectionKey, SectionClasses> = {
  proyectos: {
    border: 'border-proyectos/40',
    borderHover: 'hover:border-proyectos/80',
    text: 'text-proyectos',
    hoverText: 'hover:text-proyectos',
    bg: 'bg-proyectos',
  },
  granjas: {
    border: 'border-granjas/40',
    borderHover: 'hover:border-granjas/80',
    text: 'text-granjas',
    hoverText: 'hover:text-granjas',
    bg: 'bg-granjas',
  },
  jugadores: {
    border: 'border-jugadores/40',
    borderHover: 'hover:border-jugadores/80',
    text: 'text-jugadores',
    hoverText: 'hover:text-jugadores',
    bg: 'bg-jugadores',
  },
  tareas: {
    border: 'border-tareas/40',
    borderHover: 'hover:border-tareas/80',
    text: 'text-tareas',
    hoverText: 'hover:text-tareas',
    bg: 'bg-tareas',
  },
  admin: {
    border: 'border-admin/40',
    borderHover: 'hover:border-admin/80',
    text: 'text-admin',
    hoverText: 'hover:text-admin',
    bg: 'bg-admin',
  },
  accent: {
    border: 'border-accent/40',
    borderHover: 'hover:border-accent/80',
    text: 'text-accent',
    hoverText: 'hover:text-accent',
    bg: 'bg-accent',
  },
};
