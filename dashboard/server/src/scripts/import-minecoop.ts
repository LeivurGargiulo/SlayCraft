import type Database from 'better-sqlite3';

export interface MinecoopJugador {
  username: string;
  actividad: 'activo' | 'ocasional' | 'inactivo';
}

export interface MinecoopEntity {
  id: string;
  title: string;
  coordinates: string[];
}

export function importJugadores(db: Database.Database, jugadores: MinecoopJugador[]) {
  const insert = db.prepare(
    `INSERT INTO players (minecraft_name, actividad) VALUES (?, ?)
     ON CONFLICT(minecraft_name) DO UPDATE SET actividad = excluded.actividad`
  );
  for (const j of jugadores) insert.run(j.username, j.actividad);
}

export function importProyectos(db: Database.Database, proyectos: MinecoopEntity[]): Map<string, number> {
  const idBySlug = new Map<string, number>();
  const insert = db.prepare('INSERT INTO projects (name, status, coordinates) VALUES (?, ?, ?)');
  for (const p of proyectos) {
    const info = insert.run(p.title, 'active', p.coordinates.join('; '));
    idBySlug.set(p.id, Number(info.lastInsertRowid));
  }
  return idBySlug;
}
