import { hash, hashRaw } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { VaultCorruptError } from "./errors.js";

export interface KdfParams {
  algorithm: "argon2id";
  memoryCostKiB: number;
  timeCost: number;
  parallelism: number;
  outputLen: number;
}

/**
 * Default Argon2id parameters, measured in Phase 0 (19 MiB, t=2 → ~23 ms on an
 * Apple Silicon laptop). Stored with every vault so they can be raised later.
 */
export const DEFAULT_KDF_PARAMS: KdfParams = {
  algorithm: "argon2id",
  memoryCostKiB: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export function newSalt(bytes = 16): Buffer {
  return randomBytes(bytes);
}

export function isKdfParams(value: unknown): value is KdfParams {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate["algorithm"] === "argon2id" &&
    Number.isSafeInteger(candidate["memoryCostKiB"]) &&
    Number.isSafeInteger(candidate["timeCost"]) &&
    Number.isSafeInteger(candidate["parallelism"]) &&
    Number.isSafeInteger(candidate["outputLen"]) &&
    (candidate["outputLen"] as number) >= 16 &&
    (candidate["outputLen"] as number) <= 64
  );
}

/**
 * Derives the key-encryption key from the vault passphrase. The default
 * algorithm of `@node-rs/argon2` is Argon2id; the crypto test asserts it by
 * inspecting the PHC string, so no runtime enum is needed.
 */
export async function deriveKek(
  passphrase: string,
  salt: Buffer,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<Buffer> {
  if (passphrase.length === 0) {
    throw new VaultCorruptError("passphrase must not be empty");
  }
  if (salt.byteLength < 16) {
    throw new VaultCorruptError("KDF salt must be at least 16 bytes");
  }
  return hashRaw(passphrase.normalize("NFKC"), {
    memoryCost: params.memoryCostKiB,
    timeCost: params.timeCost,
    parallelism: params.parallelism,
    outputLen: params.outputLen,
    salt,
  });
}

/** Test helper: proves the default algorithm is Argon2id. */
export async function argon2idPhcString(passphrase: string, salt: Buffer): Promise<string> {
  return hash(passphrase, {
    memoryCost: 8192,
    timeCost: 1,
    parallelism: 1,
    outputLen: 32,
    salt,
  });
}
