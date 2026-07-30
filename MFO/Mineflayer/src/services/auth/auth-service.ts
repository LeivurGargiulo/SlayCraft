import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import type { Db } from '../../database/client.js';
import { users } from '../../database/schema.js';
import type { Logger } from '../../core/logger/index.js';

const BCRYPT_ROUNDS = 12;

export type UserRole = 'admin' | 'viewer';

export interface AuthUser {
  readonly id: number;
  readonly username: string;
  readonly role: UserRole;
}

export interface AuthServiceDeps {
  readonly db: Db;
  readonly jwtSecret: string;
  readonly jwtExpiry: string;
  readonly logger: Logger;
}

/** Dashboard login (ARCHITECTURE.md "Security"): bcrypt-verified credentials, one long-lived JWT, no refresh flow (confirmed with the user). */
export class AuthService {
  private readonly db: Db;
  private readonly jwtSecret: string;
  private readonly jwtExpiry: string;
  private readonly logger: Logger;

  constructor(deps: AuthServiceDeps) {
    this.db = deps.db;
    this.jwtSecret = deps.jwtSecret;
    this.jwtExpiry = deps.jwtExpiry;
    this.logger = deps.logger.child({ module: 'services.auth' });
  }

  /** Returns a signed JWT on success, undefined on unknown user or bad password (same response either way — no user enumeration). */
  async login(username: string, password: string): Promise<string | undefined> {
    const row = this.db.select().from(users).where(eq(users.username, username)).get();
    if (!row || !(await bcrypt.compare(password, row.passwordHash))) {
      this.logger.warn({ username }, 'login failed');
      return undefined;
    }

    const token = jwt.sign({ username: row.username, role: row.role }, this.jwtSecret, {
      subject: String(row.id),
      expiresIn: this.jwtExpiry as NonNullable<SignOptions['expiresIn']>,
    });
    this.logger.info({ username }, 'login succeeded');
    return token;
  }

  /** Used by both the REST `onRequest` hook and the Socket.IO `io.use` middleware, so the two surfaces can't drift. */
  verifyToken(token: string): AuthUser | undefined {
    try {
      const payload = jwt.verify(token, this.jwtSecret);
      const sub: unknown = typeof payload === 'string' ? undefined : payload.sub;
      const username: unknown = typeof payload === 'string' ? undefined : payload.username;
      const role: unknown = typeof payload === 'string' ? undefined : payload.role;
      if (
        typeof sub !== 'string' ||
        typeof username !== 'string' ||
        (role !== 'admin' && role !== 'viewer')
      ) {
        return undefined;
      }
      return { id: Number(sub), username, role };
    } catch {
      return undefined;
    }
  }

  static hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }
}
