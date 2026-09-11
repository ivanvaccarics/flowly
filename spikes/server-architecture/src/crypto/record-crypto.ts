import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { VaultCorruptError } from "../errors.ts";

const BLOB_VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = 1 + IV_LEN + TAG_LEN;

export function encryptRecord(key: Buffer, aad: string, value: unknown): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(value), "utf8")),
    cipher.final(),
  ]);
  return Buffer.concat([Buffer.from([BLOB_VERSION]), iv, cipher.getAuthTag(), ciphertext]);
}

export function decryptRecord<T>(key: Buffer, aad: string, blob: Buffer): T {
  if (blob.byteLength < HEADER_LEN) {
    throw new VaultCorruptError("encrypted record is truncated");
  }
  if (blob.readUInt8(0) !== BLOB_VERSION) {
    throw new VaultCorruptError(`unsupported record blob version: ${blob.readUInt8(0)}`);
  }
  const iv = blob.subarray(1, 1 + IV_LEN);
  const tag = blob.subarray(1 + IV_LEN, HEADER_LEN);
  const ciphertext = blob.subarray(HEADER_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch (error) {
    throw new VaultCorruptError("encrypted record failed authentication", { cause: error });
  }
}
