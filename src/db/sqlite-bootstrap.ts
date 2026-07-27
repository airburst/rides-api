import type { Database } from "bun:sqlite";

const SQLITE_BENCHMARK_SCHEMA_SQL = [
  `
  CREATE TABLE IF NOT EXISTS clubs (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL,
    name TEXT NOT NULL,
    settings TEXT NOT NULL DEFAULT '{}',
    allowed_origins TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `CREATE UNIQUE INDEX IF NOT EXISTS clubs_slug_unique ON clubs(slug);`,
  `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT NOT NULL,
    email_verified INTEGER DEFAULT 0,
    image TEXT,
    image_large TEXT,
    mobile TEXT,
    emergency TEXT,
    is_super_admin INTEGER NOT NULL DEFAULT 0,
    preferences TEXT DEFAULT '{"units":"km"}',
    membership_id TEXT,
    membership_status TEXT DEFAULT 'NOT_MEMBER',
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  `,
  `CREATE INDEX IF NOT EXISTS idx_users_name_lower ON users(lower(name));`,
  `CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(lower(email));`,
  `
  CREATE TABLE IF NOT EXISTS user_clubs (
    user_id TEXT NOT NULL,
    club_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'USER',
    joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, club_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(club_id) REFERENCES clubs(id) ON DELETE CASCADE
  );
  `,
  `CREATE INDEX IF NOT EXISTS idx_user_clubs_club_id ON user_clubs(club_id);`,
  `
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    password TEXT,
    access_token TEXT,
    refresh_token TEXT,
    id_token TEXT,
    access_token_expires_at TEXT,
    refresh_token_expires_at TEXT,
    scope TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  `,
  `CREATE INDEX IF NOT EXISTS account_user_id_idx ON accounts(user_id);`,
  `CREATE INDEX IF NOT EXISTS accounts_account_id_idx ON accounts(account_id);`,
  `
  CREATE TABLE IF NOT EXISTS rides (
    id TEXT PRIMARY KEY,
    club_id TEXT NOT NULL,
    name TEXT NOT NULL,
    ride_group TEXT,
    ride_date TEXT NOT NULL,
    destination TEXT,
    distance INTEGER,
    meet_point TEXT,
    route TEXT,
    leader TEXT,
    notes TEXT,
    ride_limit INTEGER NOT NULL DEFAULT -1,
    deleted INTEGER NOT NULL DEFAULT 0,
    cancelled INTEGER NOT NULL DEFAULT 0,
    schedule_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(club_id) REFERENCES clubs(id)
  );
  `,
  `CREATE INDEX IF NOT EXISTS idx_rides_name ON rides(name);`,
  `CREATE INDEX IF NOT EXISTS idx_rides_date_deleted ON rides(ride_date, deleted);`,
  `CREATE INDEX IF NOT EXISTS idx_rides_schedule_date ON rides(schedule_id, ride_date);`,
  `CREATE INDEX IF NOT EXISTS idx_rides_club_deleted_date ON rides(club_id, deleted, ride_date);`,
  `
  CREATE TABLE IF NOT EXISTS users_on_rides (
    user_id TEXT NOT NULL,
    ride_id TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, ride_id),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(ride_id) REFERENCES rides(id)
  );
  `,
  `CREATE INDEX IF NOT EXISTS idx_users_on_rides_ride_created ON users_on_rides(ride_id, created_at);`,
  `
  CREATE VIEW IF NOT EXISTS rides_users AS
  SELECT
    ride_id AS ride_id,
    user_id AS user_id,
    notes AS notes,
    created_at AS created_at
  FROM users_on_rides;
  `,
];

export function bootstrapSqliteSchema(sqliteClient: Database): void {
  for (const statement of SQLITE_BENCHMARK_SCHEMA_SQL) {
    sqliteClient.run(statement);
  }
}
