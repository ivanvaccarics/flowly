import { SimulatedCrashError } from "../errors.ts";
import type { AsyncSqlExecutor } from "./sql.ts";

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

/**
 * Every table has the same shape: the payload holds the record itself, while
 * `ref_a`/`ref_b` carry non-sensitive indexes used for range queries.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial-schema",
    statements: [
      `CREATE TABLE IF NOT EXISTS accounts (
         id TEXT PRIMARY KEY,
         updated_at TEXT NOT NULL,
         ref_a TEXT,
         ref_b TEXT,
         payload BLOB NOT NULL
       )`,
      `CREATE TABLE IF NOT EXISTS transactions (
         id TEXT PRIMARY KEY,
         updated_at TEXT NOT NULL,
         ref_a TEXT,
         ref_b TEXT,
         payload BLOB NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS transactions_booking_idx ON transactions(ref_a, ref_b)`,
      `CREATE TABLE IF NOT EXISTS tags (
         id TEXT PRIMARY KEY,
         updated_at TEXT NOT NULL,
         ref_a TEXT,
         ref_b TEXT,
         payload BLOB NOT NULL
       )`,
    ],
  },
  {
    version: 2,
    name: "tagging-rules",
    statements: [
      `CREATE TABLE IF NOT EXISTS tagging_rules (
         id TEXT PRIMARY KEY,
         updated_at TEXT NOT NULL,
         ref_a TEXT,
         ref_b TEXT,
         payload BLOB NOT NULL
       )`,
    ],
  },
];

export interface MigrationHooks {
  /**
   * Simulates a process crash after the statements of the given version run but
   * before the transaction commits. Used to prove migrations are atomic.
   */
  crashBeforeCommitOf?: number;
}

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
      await exec.run(
        "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
        [migration.version, migration.name, new Date().toISOString()],
      );
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
