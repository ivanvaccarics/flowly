import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { VaultCorruptError, WrongPassphraseError } from "../errors.ts";
import { DEFAULT_KDF_PARAMS, deriveKek, newSalt, type KdfParams } from "./kdf.ts";

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

export const SUBKEY_INFO = {
  records: "flowly/v1/records",
} as const;

export function vaultDekAad(vaultId: string): Buffer {
  return Buffer.from(`flowly/vault/${vaultId}/dek/v1`, "utf8");
}

export function deriveSubkey(dek: Buffer, info: string, length = KEY_LEN): Buffer {
  return Buffer.from(hkdfSync("sha256", dek, Buffer.alloc(0), Buffer.from(info, "utf8"), length));
}

export function zeroize(buffer: Buffer): void {
  buffer.fill(0);
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
  } catch (error) {
    throw new WrongPassphraseError(
      "vault passphrase is incorrect or the wrapped key was tampered with",
      { cause: error },
    );
  }
}

export async function createVaultHeader(
  passphrase: string,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<{ header: VaultHeader; dek: Buffer }> {
  const vaultId = randomUUID();
  const salt = newSalt();
  const kek = await deriveKek(passphrase, salt, params);
  const dek = randomBytes(KEY_LEN);
  const aad = vaultDekAad(vaultId);
  const header: VaultHeader = {
    formatVersion: 1,
    vaultId,
    createdAt: new Date().toISOString(),
    kdf: { ...params, salt: salt.toString("base64") },
    wrappedDek: wrapDek(dek, kek, aad),
  };
  zeroize(kek);
  return { header, dek };
}

export async function unlockVaultHeader(
  header: VaultHeader,
  passphrase: string,
): Promise<Buffer> {
  if (header.formatVersion !== 1 || header.kdf.algorithm !== "argon2id") {
    throw new VaultCorruptError(
      `unsupported vault header: format ${String(header.formatVersion)}`,
    );
  }
  const kdf: KdfParams = {
    algorithm: header.kdf.algorithm,
    memoryCostKiB: header.kdf.memoryCostKiB,
    timeCost: header.kdf.timeCost,
    parallelism: header.kdf.parallelism,
    outputLen: header.kdf.outputLen,
  };
  const kek = await deriveKek(passphrase, Buffer.from(header.kdf.salt, "base64"), kdf);
  try {
    return unwrapDek(header.wrappedDek, kek, vaultDekAad(header.vaultId));
  } finally {
    zeroize(kek);
  }
}
