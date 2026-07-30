import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../db.js';
import { hashPassword } from '../auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const password = process.argv[2];
if (!password) {
  console.error('Uso: npm run set-password -- <contraseña>');
  process.exit(1);
}

const dataDir = process.env.DASHBOARD_DATA_DIR ?? path.join(__dirname, '..', '..', 'data');
const db = openDb(path.join(dataDir, 'dashboard.sqlite'));
db.prepare(
  'INSERT INTO users (id, password_hash) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash'
).run(hashPassword(password));
console.log('Contraseña actualizada.');
