import type Database from 'better-sqlite3';
import { mcfmFetch } from '../mcfarmmanager.js';

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

function dimensionFor(coordinates: string[]): string {
  const text = coordinates.join(' ');
  if (text.includes('(Nether)')) return 'minecraft:the_nether';
  if (text.includes('(End)')) return 'minecraft:the_end';
  return 'minecraft:overworld';
}

function buildFarmConfig(granja: MinecoopEntity) {
  const storage = granja.coordinates
    .filter((c) => c.startsWith('Almacen'))
    .map((_, i) => ({ id: `${granja.id}-storage-${i}`, label: 'Almacen', position: { x: 0, y: 64, z: 0 } }));
  const afkSpot = granja.coordinates.some((c) => c.startsWith('Punto AFK'))
    ? { position: { x: 0, y: 64, z: 0 }, radius: 5 }
    : null;
  return {
    id: granja.id,
    name: granja.title,
    dimension: dimensionFor(granja.coordinates),
    anchor: { x: 0, y: 64, z: 0 },
    entityScanRadius: 16,
    fakePlayerName: null,
    storage,
    afkSpot,
  };
}

export async function importGranjas(db: Database.Database, granjas: MinecoopEntity[]) {
  const upsertMetadata = db.prepare(
    `INSERT INTO farm_metadata (farm_id, notes, coordinates) VALUES (?, ?, ?)
     ON CONFLICT(farm_id) DO UPDATE SET notes = excluded.notes, coordinates = excluded.coordinates`
  );
  for (const granja of granjas) {
    await mcfmFetch('/farms', { method: 'POST', body: buildFarmConfig(granja) });
    const original = granja.coordinates.join('; ');
    upsertMetadata.run(granja.id, `Coordenadas originales de minecoop (placeholder, corregir en la UI): ${original}`, original);
  }
}
