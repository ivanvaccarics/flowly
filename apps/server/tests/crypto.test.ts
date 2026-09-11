import { describe, expect, it } from "vitest";
import { VaultCorruptError, VaultKeyError } from "../src/crypto/errors.js";
import {
  createVaultHeader,
  deriveSubkey,
  isVaultHeader,
  rewrapVaultHeader,
  unlockVaultHeader,
  zeroize,
} from "../src/crypto/envelope.js";
import { argon2idPhcString, deriveKek, newSalt, type KdfParams } from "../src/crypto/kdf.js";

const FAST_KDF: KdfParams = {
  algorithm: "argon2id",
  memoryCostKiB: 8192,
  timeCost: 1,
  parallelism: 1,
  outputLen: 32,
};

describe("key derivation", () => {
  it("uses Argon2id and produces a 32-byte key", async () => {
    const phc = await argon2idPhcString("passphrase", newSalt());
    expect(phc.startsWith("$argon2id$")).toBe(true);
    const key = await deriveKek("passphrase", newSalt(), FAST_KDF);
    expect(key.byteLength).toBe(32);
  });

  it("rejects empty passphrases and short salts", async () => {
    await expect(deriveKek("", newSalt(), FAST_KDF)).rejects.toThrow(VaultCorruptError);
    await expect(deriveKek("passphrase", Buffer.alloc(8), FAST_KDF)).rejects.toThrow(
      VaultCorruptError,
    );
  });

  it("derives different keys for different salts", async () => {
    const keyA = await deriveKek("passphrase", newSalt(), FAST_KDF);
    const keyB = await deriveKek("passphrase", newSalt(), FAST_KDF);
    expect(keyA.equals(keyB)).toBe(false);
  });
});

describe("vault envelope", () => {
  it("wraps and unwraps the DEK under the passphrase", async () => {
    const { header, dek } = await createVaultHeader("correct horse", FAST_KDF);
    expect(isVaultHeader(header)).toBe(true);
    const unwrapped = await unlockVaultHeader(header, "correct horse");
    expect(unwrapped.equals(dek)).toBe(true);
    expect(JSON.stringify(header).includes("correct horse")).toBe(false);
  });

  it("fails closed on a wrong passphrase", async () => {
    const { header } = await createVaultHeader("correct horse", FAST_KDF);
    await expect(unlockVaultHeader(header, "wrong horse")).rejects.toThrow(VaultKeyError);
  });

  it("fails closed when the wrapped key is tampered with", async () => {
    const { header } = await createVaultHeader("correct horse", FAST_KDF);
    const ciphertext = Buffer.from(header.wrappedDek.ciphertext, "base64");
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 0xff;
    const tampered = {
      ...header,
      wrappedDek: { ...header.wrappedDek, ciphertext: ciphertext.toString("base64") },
    };
    await expect(unlockVaultHeader(tampered, "correct horse")).rejects.toThrow(VaultKeyError);
  });

  it("rejects unsupported headers", async () => {
    expect(isVaultHeader({ formatVersion: 2 })).toBe(false);
    await expect(unlockVaultHeader({ formatVersion: 2 } as never, "x")).rejects.toThrow(
      VaultCorruptError,
    );
  });

  it("re-wraps the same DEK under a new passphrase", async () => {
    const { header, dek } = await createVaultHeader("old passphrase", FAST_KDF);
    const rewrapped = await rewrapVaultHeader(header, dek, "new passphrase");
    await expect(unlockVaultHeader(header, "old passphrase")).resolves.toBeDefined();
    const recovered = await unlockVaultHeader(rewrapped, "new passphrase");
    expect(recovered.equals(dek)).toBe(true);
    await expect(unlockVaultHeader(rewrapped, "old passphrase")).rejects.toThrow(VaultKeyError);
  });
});

describe("subkeys and memory hygiene", () => {
  it("derives purpose-separated subkeys", async () => {
    const { dek } = await createVaultHeader("passphrase", FAST_KDF);
    const records = deriveSubkey(dek, "flowly/v1/records");
    const other = deriveSubkey(dek, "flowly/v1/other");
    expect(records.equals(other)).toBe(false);
    expect(records.equals(dek)).toBe(false);
    expect(deriveSubkey(dek, "flowly/v1/records").equals(records)).toBe(true);
  });

  it("zeroizes buffers in place", async () => {
    const key = await deriveKek("passphrase", newSalt(), FAST_KDF);
    zeroize(key);
    expect(key.every((byte) => byte === 0)).toBe(true);
  });
});
