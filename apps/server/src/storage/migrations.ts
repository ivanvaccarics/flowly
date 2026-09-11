import { SimulatedCrashError } from "./errors.js";

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export interface AsyncSqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<void>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface MigrationHooks {
  /** Simulates a process crash after the statements run but before COMMIT. */
  crashBeforeCommitOf?: number;
}

const recordTable = (name: string): string =>
  `CREATE TABLE IF NOT EXISTS ${name} (
     id TEXT PRIMARY KEY,
     updated_at TEXT NOT NULL,
     revision INTEGER NOT NULL,
     ref_a TEXT,
     ref_b TEXT,
     payload BLOB NOT NULL
   )`;

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "phase-2-schema",
    statements: [
      recordTable("accounts"),
      recordTable("transactions"),
      `CREATE INDEX IF NOT EXISTS transactions_account_idx ON transactions(ref_a, ref_b)`,
      recordTable("tags"),
      `CREATE UNIQUE INDEX IF NOT EXISTS tags_normalized_name_idx ON tags(ref_a)`,
      recordTable("tagging_rules"),
      recordTable("budgets"),
      recordTable("recurring_rules"),
      recordTable("settings"),
    ],
  },
  {
    version: 2,
    name: "dashboard-and-search-indexes",
    statements: [
      // Date-only searches (dashboard ranges) get their own index; the account
      // index from version 1 stays the better choice when an account is known.
      `CREATE INDEX IF NOT EXISTS transactions_booking_idx ON transactions(ref_b)`,
      `CREATE INDEX IF NOT EXISTS transactions_updated_idx ON transactions(updated_at)`,
    ],
  },
  {
    // Budgets were removed from the product after version 1 shipped, so the
    // table created by that migration is dropped here instead of editing
    // history. Forward-only: the vault keeps opening with the same passphrase.
    version: 3,
    name: "drop-budgets",
    statements: [`DROP TABLE IF EXISTS budgets`],
  },
  {
    // Recurring rules were dropped from the product for the same reason: the
    // table from version 1 goes away forward-only, so existing vaults keep
    // opening with the same passphrase.
    version: 4,
    name: "drop-recurring-rules",
    statements: [`DROP TABLE IF EXISTS recurring_rules`],
  },
  {
    // Enable Banking (Phase 6). Credentials live in the encrypted vault, and
    // raw provider responses get their own store so a refresh can be audited
    // and re-normalized without calling the bank again.
    version: 5,
    name: "enable-banking",
    statements: [
      recordTable("bank_connections"),
      recordTable("bank_links"),
      `CREATE INDEX IF NOT EXISTS bank_links_connection_idx ON bank_links(ref_a)`,
      recordTable("bank_accounts"),
      `CREATE INDEX IF NOT EXISTS bank_accounts_link_idx ON bank_accounts(ref_a)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_provider_uid_idx
         ON bank_accounts(ref_a, ref_b)`,
      recordTable("bank_payloads"),
      `CREATE INDEX IF NOT EXISTS bank_payloads_account_idx ON bank_payloads(ref_a, ref_b)`,
    ],
  },
];

export const SCHEMA_VERSION = Math.max(...MIGRATIONS.map((migration) => migration.version));

export async function runMigrations(
  exec: AsyncSqlExecutor,
  migrations: Migration[] = MIGRATIONS,
  hooks: MigrationHooks = {},
): Promise<number[]> {
  await exec.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`);

  const rows = await exec.all<{ version: number }>("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.version));
  const executed: number[] = [];

  for (const migration of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(migration.version)) continue;
    await exec.exec("BEGIN IMMEDIATE");
    try {
      for (const statement of migration.statements) {
        await exec.exec(statement);
      }
      if (hooks.crashBeforeCommitOf === migration.version) {
        throw new SimulatedCrashError(
          `simulated crash before committing migration ${migration.version}`,
        );
      }
      await exec.run("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)", [
        migration.version,
        migration.name,
        new Date().toISOString(),
      ]);
      await exec.exec("COMMIT");
      executed.push(migration.version);
    } catch (error) {
      if (!(error instanceof SimulatedCrashError)) {
        try {
          await exec.exec("ROLLBACK");
        } catch {
          // The connection may already be unusable; reopening proves atomicity.
        }
      }
      throw error;
    }
  }

  return executed;
}
