import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { ImportExportService } from "../src/application/import-export-service.js";
import { TaggingRuleService } from "../src/application/tagging-rule-service.js";
import { generateId } from "../src/domain/ids.js";
import { readArchive, writeArchive } from "../src/portability/archive.js";
import { Vault } from "../src/vault/vault.js";
import { TEST_APP_ID, TEST_REDIRECT_URL, testPrivateKeyPem } from "./helpers/banking.js";
import { TEST_KDF } from "./helpers/test-utils.js";

const NOW = "2026-09-11T08:00:00.000Z";

/** Reads one entry out of a Flowly ZIP using its local file header. */
function readZipEntry(zip: Buffer, name: string): Buffer {
  for (let offset = 0; offset + 30 < zip.length; offset += 1) {
    if (zip.readUInt32LE(offset) !== 0x04034b50) continue;
    const method = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 18);
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const entryName = zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    if (!entryName.endsWith(`/${name}`) && entryName !== name) continue;
    const start = offset + 30 + nameLength + extraLength;
    const body = zip.subarray(start, start + compressedSize);
    return method === 8 ? inflateRawSync(body) : Buffer.from(body);
  }
  throw new Error(`zip entry ${name} not found`);
}

async function seededVault(dir: string, passphrase: string): Promise<Vault> {
  const vault = await Vault.create(dir, passphrase, { kdf: TEST_KDF });
  await vault.bankConnections.create({
    formatVersion: 1,
    revision: 1,
    id: generateId(),
    provider: "enable-banking",
    appId: TEST_APP_ID,
    privateKeyPem: testPrivateKeyPem(),
    redirectUrl: TEST_REDIRECT_URL,
    environment: "SANDBOX",
    psuType: "personal",
    country: "IT",
    autoSync: true,
    appName: "mytest-app",
    createdAt: NOW,
    updatedAt: NOW,
  });
  await vault.bankPayloads.create({
    formatVersion: 1,
    revision: 1,
    id: generateId(),
    connectionId: generateId(),
    linkId: generateId(),
    providerAccountUid: "0f7d3d1c-3f4e-4b0e-9f1a-2b3c4d5e6f70",
    kind: "transactions",
    fetchedAt: NOW,
    json: { transactions: [{ entry_reference: "secret-entry" }] },
    createdAt: NOW,
    updatedAt: NOW,
  });
  return vault;
}

function serviceFor(vault: Vault): ImportExportService {
  return new ImportExportService({
    vault,
    taggingRules: new TaggingRuleService(vault),
    newId: generateId,
  });
}

describe("Enable Banking portability", () => {
  it("carries the connector and raw payloads in the encrypted archive", async () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "flowly-bank-src-"));
    const destinationDir = mkdtempSync(join(tmpdir(), "flowly-bank-dst-"));
    try {
      const source = await seededVault(sourceDir, "source passphrase");
      const archive = join(sourceDir, "vault.flowly");
      await serviceFor(source).exportArchive(archive, "archive password");

      const destination = await Vault.create(destinationDir, "destination passphrase", {
        kdf: TEST_KDF,
      });
      const report = await serviceFor(destination).importArchive(archive, "archive password");
      expect(report).toMatchObject({ bankConnections: 1, bankPayloads: 1 });
      const connections = await destination.bankConnections.list();
      expect(connections[0]?.privateKeyPem).toContain("PRIVATE KEY");
      expect((await destination.bankPayloads.list())[0]?.json).toMatchObject({
        transactions: [{ entry_reference: "secret-entry" }],
      });

      await source.lock();
      await destination.lock();
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
      rmSync(destinationDir, { recursive: true, force: true });
    }
  });

  it("redacts the private key in the plain ZIP", async () => {
    const dir = mkdtempSync(join(tmpdir(), "flowly-bank-zip-"));
    try {
      const vault = await seededVault(dir, "source passphrase");
      const tables = await serviceFor(vault).exportTablesZip();
      expect(tables.counts["bankConnections"]).toBe(1);
      const banking = JSON.parse(readZipEntry(tables.content, "banking.json").toString("utf8")) as {
        connections: Array<{ privateKeyPem: string | null; appId: string }>;
      };
      expect(banking.connections[0]?.appId).toBe(TEST_APP_ID);
      expect(banking.connections[0]?.privateKeyPem).toBeNull();
      expect(tables.content.includes(Buffer.from("PRIVATE KEY", "utf8"))).toBe(false);
      await vault.lock();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses an archive whose Enable Banking key was redacted", async () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "flowly-bank-redact-src-"));
    const destinationDir = mkdtempSync(join(tmpdir(), "flowly-bank-redact-dst-"));
    try {
      const source = await seededVault(sourceDir, "source passphrase");
      const archive = join(sourceDir, "vault.flowly");
      await serviceFor(source).exportArchive(archive, "archive password");

      const { manifest, files } = await readArchive(archive, "archive password");
      const banking = JSON.parse(files.get("banking.json")?.toString("utf8") ?? "{}") as {
        connections: Array<Record<string, unknown>>;
      };
      banking.connections = banking.connections.map((connection) => ({
        ...connection,
        privateKeyPem: null,
      }));
      const redacted = join(sourceDir, "redacted.flowly");
      await writeArchive(
        redacted,
        "archive password",
        manifest.vaultId,
        [...files.entries()]
          .filter(([name]) => name !== "manifest.json")
          .map(([name, content]) => ({
            name,
            content:
              name === "banking.json" ? Buffer.from(JSON.stringify(banking), "utf8") : content,
          })),
      );

      const destination = await Vault.create(destinationDir, "destination passphrase", {
        kdf: TEST_KDF,
      });
      await expect(
        serviceFor(destination).importArchive(redacted, "archive password"),
      ).rejects.toThrow(/redacted/i);

      await source.lock();
      await destination.lock();
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
      rmSync(destinationDir, { recursive: true, force: true });
    }
  });
});
