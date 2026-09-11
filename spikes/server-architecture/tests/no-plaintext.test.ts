import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { Vault } from "../src/vault/vault.ts";
import { cleanup, sampleAccount, sampleTransaction, tempDir, TEST_KDF } from "./helpers/test-utils.ts";

const SECRETS = ["Bar Centrale", "espresso with Luca", "Acme Corp", "CARD PURCHASE"];

function readAllFiles(dir: string): Buffer[] {
  const files: Buffer[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...readAllFiles(path));
    else if (entry.isFile() && statSync(path).size > 0) files.push(readFileSync(path));
  }
  return files;
}

test("SQLCipher vault leaves no plaintext and no SQLite header on disk", async () => {
  const dir = tempDir();
  try {
    const vault = await Vault.create(dir, "correct horse battery staple", {
      engine: "sqlcipher",
      kdf: TEST_KDF,
    });
    await vault.putAccount(sampleAccount());
    await vault.putTransaction(sampleTransaction({ userNote: "espresso with Luca" }));
    await vault.lock();

    const files = readAllFiles(dir);
    assert.ok(files.length >= 2, "vault header and database must exist");
    for (const secret of SECRETS) {
      for (const file of files) {
        assert.equal(
          file.includes(Buffer.from(secret, "utf8")),
          false,
          `plaintext ${JSON.stringify(secret)} leaked into the vault directory`,
        );
      }
    }
    for (const file of files) {
      assert.equal(
        file.includes(Buffer.from("SQLite format 3", "utf8")),
        false,
        "SQLCipher database must not expose the SQLite header",
      );
    }
  } finally {
    cleanup(dir);
  }
});

test("record-encryption fallback hides payloads but not the SQLite structure", async () => {
  const dir = tempDir();
  try {
    const vault = await Vault.create(dir, "correct horse battery staple", {
      engine: "record-encryption",
      kdf: TEST_KDF,
    });
    await vault.putAccount(sampleAccount());
    await vault.putTransaction(sampleTransaction({ userNote: "espresso with Luca" }));
    await vault.lock();

    const files = readAllFiles(dir);
    for (const secret of ["Bar Centrale", "espresso with Luca", "CARD PURCHASE"]) {
      for (const file of files) {
        assert.equal(file.includes(Buffer.from(secret, "utf8")), false);
      }
    }
    const database = readFileSync(join(dir, Vault.databaseFile));
    assert.ok(
      database.includes(Buffer.from("SQLite format 3", "utf8")),
      "the fallback keeps a plain SQLite structure, which is exactly its documented trade-off",
    );
    assert.ok(
      database.includes(Buffer.from("11111111-1111-4111-8111-111111111111", "utf8")),
      "the fallback leaves record ids visible, so SQLCipher stays the primary engine",
    );
  } finally {
    cleanup(dir);
  }
});
