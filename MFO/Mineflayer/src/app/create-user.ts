import { loadAppConfig } from '../core/config/index.js';
import { createDatabase } from '../database/client.js';
import { users } from '../database/schema.js';
import { AuthService } from '../services/auth/auth-service.js';

/** No public registration (ARCHITECTURE.md "Security" names username/password login, not sign-up) — dashboard users are created via `pnpm create-user <username> <password> [admin|viewer]`. */
async function main(): Promise<void> {
  const [username, password, role = 'admin'] = process.argv.slice(2);
  if (username === undefined || password === undefined || (role !== 'admin' && role !== 'viewer')) {
    console.error('usage: pnpm create-user <username> <password> [admin|viewer]');
    process.exit(1);
  }

  const config = loadAppConfig();
  const { db, close } = createDatabase(config.database.path);
  try {
    const passwordHash = await AuthService.hashPassword(password);
    db.insert(users).values({ username, passwordHash, role, createdAt: new Date() }).run();
    console.log(`created user "${username}" (${role})`);
  } finally {
    close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
