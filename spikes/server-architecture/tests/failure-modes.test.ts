import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, truncateSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { VaultCorruptError, WrongPassphraseError } from "../src/errors.ts";
import { Vault } from "../src/vault/vault.ts";
import { cleanup, sampleTransaction, tempDir, TEST_KDF } from "./helpers/test-utils.ts";

const PASSPHRASE = "correct horse battery staple";
const worker = fileURLToPath(new URL("./helpers/vault-worker.ts", import.meta.url));

test("a tampered wrapped key is rejected instead of silently accepted", async () => {
  const dir = tempDir();
  try {
    const vault = await Vault.create(dir, PASSPHRASE, { kdf: TEST_KDF });
    await vault.lock();
    const headerPath = join(dir, Vault.headerFile);
    const header = JSON.parse(readFileSync(headerPath, "utf8")) as {
      wrappedDek: { ciphertext: string };
    };
    const ciphertext = Buffer.from(header.wrappedDek.ciphertext, "base64");
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 0xff;
    header.wrappedDek.ciphertext = ciphertext.toString("base64");
    writeFileSync(headerPath, JSON.stringify(header));

    await assert.rejects(() => Vault.open(dir, PASSPHRASE, { kdf: TEST_KDF }), WrongPassphraseError);
  } finally {
    cleanup(dir);
  }
});

test("a corrupted database fails closed for both engines", async () => {
  for (const engine of ["sqlcipher", "record-encryption"] as const) {
    const dir = tempDir();
    try {
      const vault = await Vault.create(dir, PASSPHRASE, { engine, kdf: TEST_KDF });
      await vault.putTransaction(sampleTransaction());
      await vault.lock();

      const databasePath = join(dir, Vault.databaseFile);
      const size = statSync(databasePath).size;
      const handle = readFileSync(databasePath);
      handle.fill(0x42, 32, Math.min(handle.byteLength, 512));
      writeFileSync(databasePath, handle);

      await assert.rejects(async () => {
        const reopened = await Vault.open(dir, PASSPHRASE, { engine });
        await reopened.listTransactions();
      });
      assert.ok(size > 0);
    } finally {
      cleanup(dir);
    }
  }
});

test("a truncated database never reports an empty, healthy vault", async () => {
  const dir = tempDir();
  try {
    const vault = await Vault.create(dir, PASSPHRASE, { kdf: TEST_KDF });
    await vault.putTransaction(sampleTransaction());
    await vault.lock();
    truncateSync(join(dir, Vault.databaseFile), 64);

    await assert.rejects(async () => {
      const reopened = await Vault.open(dir, PASSPHRASE, { kdf: TEST_KDF });
      const transactions = await reopened.listTransactions();
      if (transactions.length === 0) throw new VaultCorruptError("silently empty vault");
    });
  } finally {
    cleanup(dir);
  }
});

test("a restarted process reopens the same vault without shared memory", () => {
  const dir = tempDir();
  try {
    const write = execFileSync(
      process.execPath,
      [
        "--no-warnings",
        "--experimental-strip-types",
        "--experimental-sqlite",
        worker,
        dir,
        PASSPHRASE,
        "write",
      ],
      { encoding: "utf8" },
    );
    const written = JSON.parse(write.trim()) as { ok: boolean; vaultId: string };
    assert.equal(written.ok, true);

    const read = execFileSync(
      process.execPath,
      [
        "--no-warnings",
        "--experimental-strip-types",
        "--experimental-sqlite",
        worker,
        dir,
        PASSPHRASE,
        "read",
      ],
      { encoding: "utf8" },
    );
    const readBack = JSON.parse(read.trim()) as { ok: boolean; transactions: number };
    assert.deepEqual(readBack, { ok: true, transactions: 1 });
  } finally {
    cleanup(dir);
  }
});
