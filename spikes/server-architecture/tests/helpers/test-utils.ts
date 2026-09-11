import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Account, Tag, Transaction } from "../../src/domain/types.ts";
import type { KdfParams } from "../../src/crypto/kdf.ts";

/** Fast Argon2id parameters so tests stay quick; the bench measures production ones. */
export const TEST_KDF: KdfParams = {
  algorithm: "argon2id",
  memoryCostKiB: 8192,
  timeCost: 1,
  parallelism: 1,
  outputLen: 32,
};

export function tempDir(prefix = "flowly-spike-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

export function sampleAccount(overrides: Partial<Account> = {}): Account {
  const now = new Date().toISOString();
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Acme Corp Checking",
    type: "checking",
    defaultCurrency: "EUR",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function sampleTag(overrides: Partial<Tag> = {}): Tag {
  const now = new Date().toISOString();
  return {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Groceries",
    normalizedName: "groceries",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function sampleTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const now = new Date().toISOString();
  return {
    id: "33333333-3333-4333-8333-333333333333",
    accountId: "11111111-1111-4111-8111-111111111111",
    bookingDate: "2026-09-01",
    amountMinor: -1230,
    currency: "EUR",
    payee: "Bar Centrale",
    description: "CARD PURCHASE",
    userNote: "espresso with Luca",
    status: "booked",
    source: "manual",
    tagIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
