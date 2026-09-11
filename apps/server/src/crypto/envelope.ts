import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { VaultCorruptError, VaultKeyError } from "./errors.js";
import { DEFAULT_KDF_PARAMS, deriveKek, isKdfParams, newSalt, type KdfParams } from "./kdf.js";

const KEY_LEN = 32;
const IV_LEN = 12;
const CIPHER = "aes-256-gcm";

export interface WrappedKey {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  ciphertext: string;
  tag: string;
}

export interface VaultHeader {
  formatVersion: 1;
  vaultId: string;
  createdAt: string;
  kdf: KdfParams & { salt: string };
  wrappedDek: WrappedKey;
}

/** Purpose separation: subkeys are derived from the DEK instead of reused. */
export const SUBKEY_INFO = {
  records: "flowly/v1/records",
} as const;

export function vaultDekAad(vaultId: string): Buffer {
  return Buffer.from(`flowly/vault/${vaultId}/dek/v1`, "utf8");
}

export function deriveSubkey(dek: Buffer, info: string, length = KEY_LEN): Buffer {
  return Buffer.from(hkdfSync("sha256", dek, Buffer.alloc(0), Buffer.from(info, "utf8"), length));
}

export function zeroize(buffer: Buffer | null | undefined): void {
  buffer?.fill(0);
}

function wrapDek(dek: Buffer, kek: Buffer, aad: Buffer): WrappedKey {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(CIPHER, kek, iv);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function unwrapDek(wrapped: WrappedKey, kek: Buffer, aad: Buffer): Buffer {
  if (wrapped.version !== 1 || wrapped.algorithm !== "aes-256-gcm") {
    throw new VaultCorruptError(`unsupported wrapped key format: ${String(wrapped.version)}`);
  }
  const decipher = createDecipheriv(CIPHER, kek, Buffer.from(wrapped.iv, "base64"));
  decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(wrapped.tag, "base64"));
  try {
    return Buffer.concat([
      decipher.update(Buffer.from(wrapped.ciphertext, "base64")),
      decipher.final(),
    ]);
  } catch {
    throw new VaultKeyError("vault passphrase is incorrect or the wrapped key was tampered with");
  }
}

export function isVaultHeader(value: unknown): value is VaultHeader {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const kdf = candidate["kdf"] as Record<string, unknown> | undefined;
  const wrapped = candidate["wrappedDek"] as Record<string, unknown> | undefined;
  return (
    candidate["formatVersion"] === 1 &&
    typeof candidate["vaultId"] === "string" &&
    candidate["vaultId"].length > 0 &&
    typeof candidate["createdAt"] === "string" &&
    !!kdf &&
    isKdfParams(kdf) &&
    typeof kdf["salt"] === "string" &&
    !!wrapped &&
    wrapped["version"] === 1 &&
    wrapped["algorithm"] === "aes-256-gcm" &&
    typeof wrapped["iv"] === "string" &&
    typeof wrapped["ciphertext"] === "string" &&
    typeof wrapped["tag"] === "string"
  );
}

export async function createVaultHeader(
  passphrase: string,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<{ header: VaultHeader; dek: Buffer }> {
  const vaultId = randomUUID();
  const salt = newSalt();
  const kek = await deriveKek(passphrase, salt, params);
  const dek = randomBytes(KEY_LEN);
  const header: VaultHeader = {
    formatVersion: 1,
    vaultId,
    createdAt: new Date().toISOString(),
    kdf: { ...params, salt: salt.toString("base64") },
    wrappedDek: wrapDek(dek, kek, vaultDekAad(vaultId)),
  };
  zeroize(kek);
  return { header, dek };
}

export async function unlockVaultHeader(header: VaultHeader, passphrase: string): Promise<Buffer> {
  if (!isVaultHeader(header)) {
    throw new VaultCorruptError("vault header is not a supported format");
  }
  const kek = await deriveKek(passphrase, Buffer.from(header.kdf.salt, "base64"), {
    algorithm: header.kdf.algorithm,
    memoryCostKiB: header.kdf.memoryCostKiB,
    timeCost: header.kdf.timeCost,
    parallelism: header.kdf.parallelism,
    outputLen: header.kdf.outputLen,
  });
  try {
    return unwrapDek(header.wrappedDek, kek, vaultDekAad(header.vaultId));
  } finally {
    zeroize(kek);
  }
}

/** Re-wraps the same DEK under a new passphrase; data stays untouched. */
export async function rewrapVaultHeader(
  header: VaultHeader,
  dek: Buffer,
  nextPassphrase: string,
): Promise<VaultHeader> {
  const params: KdfParams = {
    algorithm: header.kdf.algorithm,
    memoryCostKiB: header.kdf.memoryCostKiB,
    timeCost: header.kdf.timeCost,
    parallelism: header.kdf.parallelism,
    outputLen: header.kdf.outputLen,
  };
  const salt = newSalt();
  const kek = await deriveKek(nextPassphrase, salt, params);
  const rewrapped: VaultHeader = {
    ...header,
    kdf: { ...params, salt: salt.toString("base64") },
    wrappedDek: wrapDek(dek, kek, vaultDekAad(header.vaultId)),
  };
  zeroize(kek);
  return rewrapped;
}
