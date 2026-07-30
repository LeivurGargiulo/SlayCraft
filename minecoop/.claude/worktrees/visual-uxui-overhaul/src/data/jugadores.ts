export type Actividad = 'activo' | 'ocasional' | 'inactivo';

export const ACTIVIDAD_LABELS: Record<Actividad, string> = {
  activo: 'Activo',
  ocasional: 'Ocasional',
  inactivo: 'Inactivo',
};

export function skinBodyUrl(username: string, size = 200) {
  return `https://minotar.net/body/${username}/${size}.png`;
}
