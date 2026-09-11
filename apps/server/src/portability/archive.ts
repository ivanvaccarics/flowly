import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tar from "tar";
import { validateContract } from "@flowly/web-contracts";
import { DEFAULT_KDF_PARAMS, deriveKek, isKdfParams, type KdfParams } from "../crypto/kdf.js";
import { ArchiveIntegrityError, ArchivePasswordError } from "./errors.js";

const MAGIC = Buffer.from("FLOWLYAR", "utf8");
const IV_LEN = 12;
const TAG_LEN = 16;
export const ARCHIVE_FORMAT_VERSION = 1;
export const MANIFEST_NAME = "manifest.json";

export interface ArchiveFile {
  name: string;
  content: Buffer;
}

export interface ArchiveManifestEntry {
  name: string;
  bytes: number;
  sha256: string;
}

export interface ArchiveManifest {
  formatVersion: 1;
  createdAt: string;
  vaultId: string;
  entries: ArchiveManifestEntry[];
}

export async function writeArchive(
  destination: string,
  password: string,
  vaultId: string,
  files: readonly ArchiveFile[],
  kdf: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<{ bytes: number; manifest: ArchiveManifest }> {
  const manifest: ArchiveManifest = {
    formatVersion: ARCHIVE_FORMAT_VERSION,
    createdAt: new Date().toISOString(),
    vaultId,
    entries: files.map((file) => ({
      name: file.name,
      bytes: file.content.byteLength,
      sha256: sha256(file.content),
    })),
  };
  const manifestCheck = validateContract("archiveManifest", manifest);
  if (!manifestCheck.valid) {
    throw new ArchiveIntegrityError(
      `generated manifest is invalid: ${manifestCheck.errors.join("; ")}`,
    );
  }

  const tarBytes = await packTar([
    ...files,
    { name: MANIFEST_NAME, content: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") },
  ]);

  const salt = randomBytes(16);
  const kek = await deriveKek(password, salt, kdf);
  const header = Buffer.from(
    JSON.stringify({
      formatVersion: ARCHIVE_FORMAT_VERSION,
      cipher: "aes-256-gcm",
      kdf,
      salt: salt.toString("base64"),
      createdAt: manifest.createdAt,
    }),
    "utf8",
  );
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", kek, iv);
  cipher.setAAD(Buffer.concat([MAGIC, header]));
  const ciphertext = Buffer.concat([cipher.update(tarBytes), cipher.final()]);
  kek.fill(0);

  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32BE(header.byteLength, 0);
  const container = Buffer.concat([
    MAGIC,
    lengthPrefix,
    header,
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]);
  writeFileSync(destination, container, { mode: 0o600 });
  return { bytes: container.byteLength, manifest };
}

export async function readArchive(
  source: string,
  password: string,
): Promise<{ manifest: ArchiveManifest; files: Map<string, Buffer> }> {
  const container = readFileSync(source);
  const minimum = MAGIC.byteLength + 4 + IV_LEN + TAG_LEN;
  if (container.byteLength <= minimum) {
    throw new ArchiveIntegrityError("archive is truncated");
  }
  if (!container.subarray(0, MAGIC.byteLength).equals(MAGIC)) {
    throw new ArchiveIntegrityError("archive magic bytes are invalid");
  }
  const headerLength = container.readUInt32BE(MAGIC.byteLength);
  const headerStart = MAGIC.byteLength + 4;
  const headerEnd = headerStart + headerLength;
  if (headerEnd + IV_LEN + TAG_LEN >= container.byteLength) {
    throw new ArchiveIntegrityError("archive header length is invalid");
  }
  const headerBytes = container.subarray(headerStart, headerEnd);
  const iv = container.subarray(headerEnd, headerEnd + IV_LEN);
  const tag = container.subarray(headerEnd + IV_LEN, headerEnd + IV_LEN + TAG_LEN);
  const ciphertext = container.subarray(headerEnd + IV_LEN + TAG_LEN);

  let header: { formatVersion: number; kdf: KdfParams; salt: string };
  try {
    header = JSON.parse(headerBytes.toString("utf8")) as typeof header;
  } catch (error) {
    throw new ArchiveIntegrityError("archive header is not valid JSON", { cause: error });
  }
  if (header.formatVersion !== ARCHIVE_FORMAT_VERSION || !isKdfParams(header.kdf)) {
    throw new ArchiveIntegrityError(`unsupported archive format: ${String(header.formatVersion)}`);
  }

  const kek = await deriveKek(password, Buffer.from(header.salt, "base64"), header.kdf);
  const decipher = createDecipheriv("aes-256-gcm", kek, iv);
  decipher.setAAD(Buffer.concat([MAGIC, headerBytes]));
  decipher.setAuthTag(tag);
  let tarBytes: Buffer;
  try {
    tarBytes = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new ArchivePasswordError();
  } finally {
    kek.fill(0);
  }

  const entries = await unpackTar(tarBytes);
  const manifestBytes = entries.get(MANIFEST_NAME);
  if (!manifestBytes) throw new ArchiveIntegrityError("archive is missing its manifest");
  let manifest: ArchiveManifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8")) as ArchiveManifest;
  } catch (error) {
    throw new ArchiveIntegrityError("archive manifest is not valid JSON", { cause: error });
  }
  const manifestCheck = validateContract("archiveManifest", manifest);
  if (!manifestCheck.valid) {
    throw new ArchiveIntegrityError(
      `archive manifest is invalid: ${manifestCheck.errors.join("; ")}`,
    );
  }

  const files = new Map<string, Buffer>();
  for (const entry of manifest.entries) {
    const content = entries.get(entry.name);
    if (!content) throw new ArchiveIntegrityError(`archive is missing ${entry.name}`);
    if (content.byteLength !== entry.bytes || sha256(content) !== entry.sha256) {
      throw new ArchiveIntegrityError(`checksum mismatch for ${entry.name}`);
    }
    files.set(entry.name, content);
  }
  return { manifest, files };
}

async function packTar(files: readonly ArchiveFile[]): Promise<Buffer> {
  const dir = mkdtempSync(join(tmpdir(), "flowly-archive-"));
  try {
    for (const file of files) {
      assertSafeName(file.name);
      writeFileSync(join(dir, file.name), file.content);
    }
    const tarPath = join(dir, "archive.tar.gz");
    await tar.create(
      { cwd: dir, file: tarPath, gzip: true, portable: true },
      files.map((file) => file.name),
    );
    return readFileSync(tarPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function unpackTar(tarBytes: Buffer): Promise<Map<string, Buffer>> {
  const dir = mkdtempSync(join(tmpdir(), "flowly-archive-"));
  const out = mkdtempSync(join(tmpdir(), "flowly-archive-out-"));
  try {
    const tarPath = join(dir, "archive.tar.gz");
    writeFileSync(tarPath, tarBytes);
    await tar.extract({ cwd: out, file: tarPath });
    const entries = new Map<string, Buffer>();
    for (const name of readdirSync(out)) {
      const path = join(out, name);
      if (!statSync(path).isFile()) {
        throw new ArchiveIntegrityError(`archive entry ${name} is not a regular file`);
      }
      assertSafeName(name);
      entries.set(name, readFileSync(path));
    }
    return entries;
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
}

function assertSafeName(name: string): void {
  if (name === "" || name.includes("/") || name.includes("\\") || name.includes("..")) {
    throw new ArchiveIntegrityError(`invalid archive entry name: ${name}`);
  }
}

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
