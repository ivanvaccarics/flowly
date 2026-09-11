import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KdfParams } from "../../src/crypto/kdf.js";

/** Fast Argon2id parameters so tests stay quick; production uses the defaults. */
export const TEST_KDF: KdfParams = {
  algorithm: "argon2id",
  memoryCostKiB: 8192,
  timeCost: 1,
  parallelism: 1,
  outputLen: 32,
};

export function tempDir(prefix = "flowly-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanup(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
