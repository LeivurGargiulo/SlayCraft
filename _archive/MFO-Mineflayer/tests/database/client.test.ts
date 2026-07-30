import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDatabase } from '../../src/database/client.js';

describe('createDatabase', () => {
  it('runs migrations and creates the manager_status table', () => {
    const { db, close } = createDatabase(':memory:');

    const tables = db.all<{ name: string }>(
      sql`select name from sqlite_master where type = 'table' and name = 'manager_status'`,
    );

    expect(tables).toHaveLength(1);
    close();
  });

  it('closes the underlying connection', () => {
    const { db, close } = createDatabase(':memory:');
    close();

    expect(() => db.all(sql`select 1`)).toThrow();
  });
});
