import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import { openDb } from '../src/db.js';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';

export function makeApp(): { app: FastifyInstance; db: Database.Database; uploadsDir: string } {
  const db = openDb(':memory:');
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-test-'));
  const app = buildApp(db, uploadsDir);
  return { app, db, uploadsDir };
}

export async function loginAndGetCookie(
  app: FastifyInstance,
  db: Database.Database,
  password = 'test-pass'
): Promise<string> {
  db.prepare(
    'INSERT INTO users (id, password_hash) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash'
  ).run(hashPassword(password));
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { password } });
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!raw) throw new Error('login did not set a cookie');
  return raw.split(';')[0];
}
