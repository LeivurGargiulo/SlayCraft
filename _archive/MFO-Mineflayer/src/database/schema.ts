import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const managerStatus = sqliteTable('manager_status', {
  id: integer('id').primaryKey(),
  connected: integer('connected', { mode: 'boolean' }).notNull(),
  host: text('host').notNull(),
  port: integer('port').notNull(),
  username: text('username').notNull(),
  lastConnectedAt: integer('last_connected_at', { mode: 'timestamp_ms' }),
  lastDisconnectedAt: integer('last_disconnected_at', { mode: 'timestamp_ms' }),
  lastDisconnectReason: text('last_disconnect_reason'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const containerSnapshots = sqliteTable(
  'container_snapshots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    farmId: text('farm_id').notNull(),
    containerType: text('container_type').notNull(),
    x: integer('x').notNull(),
    y: integer('y').notNull(),
    z: integer('z').notNull(),
    capacity: integer('capacity').notNull(),
    occupiedSlots: integer('occupied_slots').notNull(),
    fillPercent: real('fill_percent').notNull(),
    totalItemCount: integer('total_item_count').notNull(),
    itemsJson: text('items_json').notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('container_snapshots_farm_id_idx').on(table.farmId),
    index('container_snapshots_occurred_at_idx').on(table.occurredAt),
  ],
);

export const entityObservations = sqliteTable(
  'entities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    farmId: text('farm_id').notNull(),
    entityType: text('entity_type').notNull(),
    name: text('name').notNull(),
    customName: text('custom_name'),
    x: real('x').notNull(),
    y: real('y').notNull(),
    z: real('z').notNull(),
    expected: integer('expected', { mode: 'boolean' }).notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('entities_farm_id_idx').on(table.farmId),
    index('entities_occurred_at_idx').on(table.occurredAt),
  ],
);

/** One row per farm, upserted on every WorkerVerified/WorkerMissing — mirrors manager_status. */
export const workers = sqliteTable('workers', {
  farmId: text('farm_id').primaryKey(),
  present: integer('present', { mode: 'boolean' }).notNull(),
  atExpectedPosition: integer('at_expected_position', { mode: 'boolean' }),
  alive: integer('alive', { mode: 'boolean' }),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const production = sqliteTable(
  'production',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    farmId: text('farm_id').notNull(),
    deltaItems: integer('delta_items').notNull(),
    windowMs: integer('window_ms').notNull(),
    itemsPerMinute: real('items_per_minute').notNull(),
    itemsPerHour: real('items_per_hour').notNull(),
    rollingAverageItemsPerHour: real('rolling_average_items_per_hour').notNull(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('production_farm_id_idx').on(table.farmId),
    index('production_occurred_at_idx').on(table.occurredAt),
  ],
);

/** Append-only: one row per actual health transition, not per recomputation. */
export const health = sqliteTable(
  'health',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    farmId: text('farm_id').notNull(),
    status: text('status').notNull(),
    reason: text('reason'),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('health_farm_id_idx').on(table.farmId),
    index('health_occurred_at_idx').on(table.occurredAt),
  ],
);

/** Dashboard login (ARCHITECTURE.md "Security": username/password, JWT). No public registration — rows are created via `pnpm create-user`. */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  /** Cosmetic only for now (confirmed with the user) — every authenticated route behaves the same regardless of role. */
  role: text('role', { enum: ['admin', 'viewer'] }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const alerts = sqliteTable(
  'alerts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Null for manager-level alerts (e.g. manager_disconnected) that aren't scoped to one farm. */
    farmId: text('farm_id'),
    type: text('type').notNull(),
    severity: text('severity').notNull(),
    state: text('state').notNull(),
    message: text('message').notNull(),
    openedAt: integer('opened_at', { mode: 'timestamp_ms' }).notNull(),
    acknowledgedAt: integer('acknowledged_at', { mode: 'timestamp_ms' }),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    index('alerts_farm_id_idx').on(table.farmId),
    index('alerts_state_idx').on(table.state),
  ],
);
