import { hash, hashRaw } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { FlowlySpikeError } from "../errors.ts";

export interface KdfParams {
  algorithm: "argon2id";
  memoryCostKiB: number;
  timeCost: number;
  parallelism: number;
  outputLen: number;
}

/** OWASP-aligned minimum, measured in Phase 0 (see REPORT.md). */
export const DEFAULT_KDF_PARAMS: KdfParams = {
  algorithm: "argon2id",
  memoryCostKiB: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export const INTERACTIVE_KDF_PARAMS: KdfParams = {
  algorithm: "argon2id",
  memoryCostKiB: 47104,
  timeCost: 1,
  parallelism: 1,
  outputLen: 32,
};

export function newSalt(bytes = 16): Buffer {
  return randomBytes(bytes);
}

/**
 * Derives the key-encryption key from the vault passphrase.
 *
 * `@node-rs/argon2` defaults to Argon2id; `crypto/kdf.test.ts` asserts the
 * default by inspecting the PHC string, so no runtime enum is required (the
 * package's `Algorithm` const enum is erased at runtime).
 */
export async function deriveKek(
  passphrase: string,
  salt: Buffer,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<Buffer> {
  if (params.algorithm !== "argon2id") {
    throw new FlowlySpikeError(`unsupported KDF algorithm: ${String(params.algorithm)}`);
  }
  if (salt.byteLength < 16) {
    throw new FlowlySpikeError("KDF salt must be at least 16 bytes");
  }
  return hashRaw(passphrase.normalize("NFKC"), {
    memoryCost: params.memoryCostKiB,
    timeCost: params.timeCost,
    parallelism: params.parallelism,
    outputLen: params.outputLen,
    salt,
  });
}

/** Used only by tests/benchmarks to prove the default algorithm is Argon2id. */
export async function argon2idPhcString(passphrase: string, salt: Buffer): Promise<string> {
  return hash(passphrase, {
    memoryCost: 8192,
    timeCost: 1,
    parallelism: 1,
    outputLen: 32,
    salt,
  });
}
