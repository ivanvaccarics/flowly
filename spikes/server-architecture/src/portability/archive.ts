import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tar from "tar";
import { deriveKek, type KdfParams, DEFAULT_KDF_PARAMS } from "../crypto/kdf.ts";
import { ArchiveIntegrityError, ArchivePasswordError, FlowlySpikeError } from "../errors.ts";

const MAGIC = Buffer.from("FLOWLYAR", "utf8");
const IV_LEN = 12;
const TAG_LEN = 16;
const MANIFEST = "manifest.json";

export interface ArchiveFile {
  name: string;
  content: Buffer;
}

export interface ArchiveManifest {
  formatVersion: 1;
  createdAt: string;
  files: Array<{ name: string; bytes: number; sha256: string }>;
}

export interface ArchiveWriteResult {
  bytes: number;
  manifest: ArchiveManifest;
}

export async function writeArchive(
  destination: string,
  password: string,
  files: readonly ArchiveFile[],
  kdf: KdfParams = DEFAULT_KDF_PARAMS,
): Promise<ArchiveWriteResult> {
  const manifest: ArchiveManifest = {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    files: files.map((file) => ({
      name: file.name,
      bytes: file.content.byteLength,
      sha256: createHash("sha256").update(file.content).digest("hex"),
    })),
  };

  const tarBytes = await packTar([
    ...files,
    { name: MANIFEST, content: Buffer.from(JSON.stringify(manifest, null, 2)) },
  ]);

  const salt = randomBytes(16);
  const kek = await deriveKek(password, salt, kdf);
  const header = Buffer.from(
    JSON.stringify({
      formatVersion: 1,
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
  const container = Buffer.concat([MAGIC, lengthPrefix, header, iv, cipher.getAuthTag(), ciphertext]);
  writeFileSync(destination, container);
  return { bytes: container.byteLength, manifest };
}

export async function readArchive(
  source: string,
  password: string,
): Promise<{ manifest: ArchiveManifest; files: Map<string, Buffer> }> {
  const container = readFileSync(source);
  if (container.byteLength < MAGIC.byteLength + 4 + IV_LEN + TAG_LEN) {
    throw new ArchiveIntegrityError("archive is truncated");
  }
  if (!container.subarray(0, MAGIC.byteLength).equals(MAGIC)) {
    throw new ArchiveIntegrityError("archive magic bytes are invalid");
  }
  const headerLength = container.readUInt32BE(MAGIC.byteLength);
  const headerStart = MAGIC.byteLength + 4;
  const headerEnd = headerStart + headerLength;
  const headerBytes = container.subarray(headerStart, headerEnd);
  const iv = container.subarray(headerEnd, headerEnd + IV_LEN);
  const tag = container.subarray(headerEnd + IV_LEN, headerEnd + IV_LEN + TAG_LEN);
  const ciphertext = container.subarray(headerEnd + IV_LEN + TAG_LEN);

  let header: { kdf: KdfParams; salt: string; formatVersion: number };
  try {
    header = JSON.parse(headerBytes.toString("utf8")) as typeof header;
  } catch (error) {
    throw new ArchiveIntegrityError("archive header is not valid JSON", { cause: error });
  }
  if (header.formatVersion !== 1) {
    throw new ArchiveIntegrityError(`unsupported archive format: ${header.formatVersion}`);
  }

  const kek = await deriveKek(password, Buffer.from(header.salt, "base64"), header.kdf);
  const decipher = createDecipheriv("aes-256-gcm", kek, iv);
  decipher.setAAD(Buffer.concat([MAGIC, headerBytes]));
  decipher.setAuthTag(tag);
  let tarBytes: Buffer;
  try {
    tarBytes = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    throw new ArchivePasswordError(
      "archive password is incorrect or the archive was tampered with",
      { cause: error },
    );
  } finally {
    kek.fill(0);
  }

  const entries = await unpackTar(tarBytes);
  const manifestBytes = entries.get(MANIFEST);
  if (!manifestBytes) throw new ArchiveIntegrityError("archive is missing its manifest");
  let manifest: ArchiveManifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8")) as ArchiveManifest;
  } catch (error) {
    throw new ArchiveIntegrityError("archive manifest is not valid JSON", { cause: error });
  }

  const files = new Map<string, Buffer>();
  for (const entry of manifest.files) {
    const content = entries.get(entry.name);
    if (!content) throw new ArchiveIntegrityError(`archive is missing ${entry.name}`);
    const sha256 = createHash("sha256").update(content).digest("hex");
    if (sha256 !== entry.sha256 || content.byteLength !== entry.bytes) {
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
      if (file.name.includes("/") || file.name.includes("..")) {
        throw new FlowlySpikeError(`invalid archive entry name: ${file.name}`);
      }
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
      entries.set(name, readFileSync(join(out, name)));
    }
    return entries;
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
}
