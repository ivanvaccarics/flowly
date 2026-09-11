import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { SimulatedCrashError } from "../src/errors.ts";
import { MIGRATIONS, runMigrations } from "../src/storage/migrations.ts";
import { SqlcipherDatabase } from "../src/storage/sql.ts";
import { cleanup, tempDir } from "./helpers/test-utils.ts";

const [initial, tagging] = MIGRATIONS;
assert.ok(initial && tagging);

test("migrations apply in order and are recorded", async () => {
  const dir = tempDir();
  const db = await SqlcipherDatabase.open(join(dir, "vault.db"), { rawKey: randomBytes(32) });
  try {
    assert.deepEqual(await runMigrations(db), [1, 2]);
    assert.deepEqual(await runMigrations(db), []);
    const rows = await db.all<{ version: number; name: string }>(
      "SELECT version, name FROM schema_migrations ORDER BY version",
    );
    assert.deepEqual(rows, [
      { version: 1, name: "initial-schema" },
      { version: 2, name: "tagging-rules" },
    ]);
  } finally {
    await db.close();
    cleanup(dir);
  }
});

test("a crash before commit rolls the whole migration back", async () => {
  const dir = tempDir();
  const file = join(dir, "vault.db");
  const key = randomBytes(32);
  const first = await SqlcipherDatabase.open(file, { rawKey: key });
  await runMigrations(first, [initial]);
  await first.run("INSERT INTO tags(id, updated_at, ref_a, ref_b, payload) VALUES (?,?,?,?,?)", [
    "tag-1",
    new Date().toISOString(),
    null,
    null,
    JSON.stringify({ id: "tag-1", name: "Existing" }),
  ]);
  await first.close();

  const crashed = await SqlcipherDatabase.open(file, { rawKey: key });
  await assert.rejects(
    () => runMigrations(crashed, [initial, tagging], { crashBeforeCommitOf: 2 }),
    SimulatedCrashError,
  );
  await crashed.close();

  const reopened = await SqlcipherDatabase.open(file, { rawKey: key });
  try {
    const applied = await reopened.all<{ version: number }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    );
    assert.deepEqual(applied, [{ version: 1 }]);
    const tables = await reopened.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tagging_rules'",
    );
    assert.deepEqual(tables, [], "half-applied migration must not leave the new table behind");
    const tags = await reopened.all("SELECT * FROM tags");
    assert.equal(tags.length, 1, "existing data survives the crashed migration");
  } finally {
    await reopened.close();
    cleanup(dir);
  }
});

test("the fallback engine applies the same migration history", async () => {
  const dir = tempDir();
  const db = new DatabaseSync(join(dir, "records.db"));
  try {
    const executor = {
      exec: async (sql: string) => void db.exec(sql),
      run: async (sql: string, params: unknown[] = []) =>
        void db.prepare(sql).run(...(params as never[])),
      all: async <T>(sql: string, params: unknown[] = []) =>
        db.prepare(sql).all(...(params as never[])) as T[],
    };
    assert.deepEqual(await runMigrations(executor), [1, 2]);
  } finally {
    db.close();
    cleanup(dir);
  }
});
