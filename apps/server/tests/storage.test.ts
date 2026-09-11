import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ConflictError,
  RecordExistsError,
  RecordNotFoundError,
  SimulatedCrashError,
} from "../src/storage/errors.js";
import { MIGRATIONS, runMigrations, type Migration } from "../src/storage/migrations.js";
import { openStore, type StorageEngine, type VaultStore } from "../src/storage/store.js";
import { SqlcipherDatabase } from "../src/storage/sqlcipher-driver.js";
import { cleanup, tempDir, TEST_KDF } from "./helpers/test-utils.js";
import { createVaultHeader } from "../src/crypto/envelope.js";

const engines: StorageEngine[] = ["sqlcipher", "record-encryption"];

interface Record {
  id: string;
  revision: number;
  updatedAt: string;
  name: string;
}

describe.each(engines)("vault store contract (%s)", (engine) => {
  let dir: string;
  let store: VaultStore;
  let dek: Buffer;

  beforeAll(async () => {
    dir = tempDir(`flowly-store-${engine}-`);
    const created = await createVaultHeader("test passphrase", TEST_KDF);
    dek = created.dek;
    store = await openStore(engine, join(dir, "vault.db"), dek);
    await store.migrate();
  });

  afterAll(async () => {
    await store.close();
    cleanup(dir);
  });

  it("applies migrations once and reports the schema version", async () => {
    expect(await store.appliedMigrations()).toEqual([1, 2, 3, 4, 5]);
    expect(await store.migrate()).toEqual([]);
  });

  it("inserts, reads and lists records", async () => {
    const record: Record = {
      id: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f",
      revision: 1,
      updatedAt: "2026-09-01T08:00:00.000Z",
      name: "Everyday",
    };
    await store.insert("accounts", record.id, record);
    expect(await store.read<Record>("accounts", record.id)).toEqual(record);
    expect(await store.count("accounts")).toBe(1);
    expect(await store.list<Record>("accounts")).toHaveLength(1);
    await expect(store.insert("accounts", record.id, record)).rejects.toThrow(RecordExistsError);
  });

  it("bumps the revision on update and rejects stale writes", async () => {
    const id = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f";
    const revision = await store.replace(
      "accounts",
      id,
      { id, revision: 1, updatedAt: "2026-09-02T08:00:00.000Z", name: "Renamed" },
      1,
    );
    expect(revision).toBe(2);
    const stored = await store.read<Record>("accounts", id);
    expect(stored?.revision).toBe(2);
    expect(stored?.name).toBe("Renamed");

    await expect(
      store.replace("accounts", id, { id, revision: 1, updatedAt: "", name: "Stale" }, 1),
    ).rejects.toThrow(ConflictError);
  });

  it("reports missing records and keeps deletion revision-checked", async () => {
    await expect(store.read("accounts", "missing")).resolves.toBeUndefined();
    const id = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f";
    await expect(store.remove("accounts", id, 1)).rejects.toThrow(ConflictError);
    await store.remove("accounts", id, 2);
    expect(await store.count("accounts")).toBe(0);
    await expect(store.remove("accounts", id, 2)).rejects.toThrow(RecordNotFoundError);
  });

  it("filters by the reference column", async () => {
    await store.insert(
      "transactions",
      "tx-1",
      { id: "tx-1", revision: 1, updatedAt: "a", account: "a" },
      { refA: "account-1", refB: "2026-09-01" },
    );
    await store.insert(
      "transactions",
      "tx-2",
      { id: "tx-2", revision: 1, updatedAt: "b", account: "b" },
      { refA: "account-2", refB: "2026-09-02" },
    );
    const filtered = await store.list<{ id: string }>("transactions", { refA: "account-1" });
    expect(filtered.map((row) => row.id)).toEqual(["tx-1"]);
    expect(await store.list("transactions")).toHaveLength(2);
  });

  it("opens the same data after a restart", async () => {
    await store.checkpoint();
    await store.close();
    store = await openStore(engine, join(dir, "vault.db"), dek);
    expect(await store.appliedMigrations()).toEqual([1, 2, 3, 4, 5]);
    expect(await store.count("transactions")).toBe(2);
  });
});

describe("migration atomicity", () => {
  it("drops the removed tables from a vault created before the removals", async () => {
    const dir = tempDir("flowly-migration-budgets-");
    const key = randomBytes(32);
    const file = join(dir, "vault.db");
    const db = await SqlcipherDatabase.open(file, key);
    // A vault that had already applied versions 1 and 2, budgets included.
    expect(await runMigrations(db, MIGRATIONS.slice(0, 2))).toEqual([1, 2]);
    await db.run(
      "INSERT INTO accounts(id, updated_at, revision, ref_a, ref_b, payload) VALUES (?,?,?,?,?,?)",
      [
        "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f",
        "2026-09-01T08:00:00.000Z",
        1,
        null,
        null,
        JSON.stringify({ id: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f", name: "Keep me" }),
      ],
    );
    for (const table of ["budgets", "recurring_rules"]) {
      expect(
        await db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]),
      ).toHaveLength(1);
    }
    await db.close();

    const store = await openStore("sqlcipher", file, Buffer.from(key));
    try {
      expect(await store.migrate()).toEqual([3, 4, 5]);
      expect((await store.migrate()).length, "migrations stay idempotent after the drop").toBe(0);
      expect(await store.count("accounts")).toBe(1);
      const remaining = await store.list<{ name: string }>("accounts");
      expect(remaining[0]?.name).toBe("Keep me");
    } finally {
      await store.close();
      cleanup(dir);
    }
  });

  it("rolls back a migration that crashes before commit", async () => {
    const dir = tempDir("flowly-migration-");
    const { dek } = await createVaultHeader("test passphrase", TEST_KDF);
    const store = await openStore("sqlcipher", join(dir, "vault.db"), dek);
    try {
      await store.migrate({ crashBeforeCommitOf: 1 });
      throw new Error("the simulated crash should have been thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SimulatedCrashError);
    }
    await store.close();

    const reopened = await openStore("sqlcipher", join(dir, "vault.db"), dek);
    expect(await reopened.appliedMigrations()).toEqual([]);
    await expect(reopened.count("accounts")).rejects.toBeDefined();
    await reopened.close();
    cleanup(dir);
  });

  it("applies a custom migration list in order", async () => {
    const dir = tempDir("flowly-migration-order-");
    const db = await SqlcipherDatabase.open(join(dir, "custom.db"), randomBytes(32));
    const custom: Migration[] = [
      ...MIGRATIONS,
      { version: 6, name: "later", statements: ["CREATE TABLE later(id TEXT PRIMARY KEY)"] },
    ];
    expect(await runMigrations(db, custom)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await runMigrations(db, custom)).toEqual([]);
    await db.close();
    cleanup(dir);
  });
});
