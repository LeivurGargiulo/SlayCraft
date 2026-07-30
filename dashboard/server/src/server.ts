import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { buildApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DASHBOARD_DATA_DIR ?? path.join(__dirname, '..', 'data');
const uploadsDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const db = openDb(path.join(dataDir, 'dashboard.sqlite'));
const app = buildApp(db, uploadsDir);

app
  .listen({ port: Number(process.env.PORT ?? 3001), host: '0.0.0.0' })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
