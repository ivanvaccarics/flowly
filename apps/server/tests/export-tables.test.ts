import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { TRANSACTION_CSV_HEADER } from "../src/portability/csv.js";
import { crc32 } from "../src/portability/zip.js";
import {
  SAMPLE_ACCOUNT,
  SAMPLE_TAG,
  call,
  makeConfig,
  sampleRule,
  sampleTransaction,
  startHarness,
} from "./helpers/api.js";

/**
 * Independent ZIP reader: the test walks the central directory itself instead of
 * reusing the writer, so a corrupt header or a wrong offset cannot pass.
 */
function readZip(buffer: Buffer): Map<string, Buffer> {
  let endOfDirectory = -1;
  for (let index = buffer.length - 22; index >= 0; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      endOfDirectory = index;
      break;
    }
  }
  if (endOfDirectory < 0) throw new Error("the archive has no end of central directory");

  const count = buffer.readUInt16LE(endOfDirectory + 10);
  let offset = buffer.readUInt32LE(endOfDirectory + 16);
  const entries = new Map<string, Buffer>();

  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`entry ${index} has no central directory header`);
    }
    const method = buffer.readUInt16LE(offset + 10);
    const checksum = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`${name} has no local file header`);
    }
    const dataStart =
      localOffset +
      30 +
      buffer.readUInt16LE(localOffset + 26) +
      buffer.readUInt16LE(localOffset + 28);
    const payload = buffer.subarray(dataStart, dataStart + compressedSize);
    const content = method === 8 ? inflateRawSync(payload) : Buffer.from(payload);

    expect(content.length, `${name} uncompressed size`).toBe(size);
    expect(crc32(content), `${name} checksum`).toBe(checksum);
    entries.set(name, content);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

describe("plain-text table export", () => {
  it("computes the standard CRC-32 check value", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("ships every table as CSV inside one ZIP", async () => {
    const { config } = makeConfig();
    const harness = await startHarness(config);
    try {
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/accounts",
        payload: { entity: SAMPLE_ACCOUNT },
      });
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/tags",
        payload: { entity: SAMPLE_TAG },
      });
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/tagging-rules",
        payload: { entity: sampleRule() },
      });
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/transactions",
        payload: {
          entity: sampleTransaction({ payee: "Bar Centrale", userNote: "espresso with Luca" }),
        },
      });

      const response = await call(harness.app, harness.client, {
        method: "GET",
        url: "/api/export/tables.zip",
      });
      expect(response.statusCode).toBe(200);
      expect(String(response.headers["content-type"])).toContain("application/zip");
      expect(String(response.headers["content-disposition"])).toMatch(
        /^attachment; filename="flowly-export-\d{4}-\d{2}-\d{2}\.zip"$/,
      );

      const entries = readZip(response.rawPayload);
      const folder = [...entries.keys()][0]?.split("/")[0] ?? "";
      expect(folder).toMatch(/^flowly-export-\d{4}-\d{2}-\d{2}$/);
      expect([...entries.keys()].sort()).toEqual(
        [
          "README.txt",
          "accounts.csv",
          "manifest.json",
          "recurring_rules.csv",
          "tagging_rules.csv",
          "tags.csv",
          "transactions.csv",
        ]
          .map((name) => `${folder}/${name}`)
          .sort(),
      );

      const transactions = entries.get(`${folder}/transactions.csv`)?.toString("utf8") ?? "";
      expect(transactions.split("\r\n")[0]).toBe(TRANSACTION_CSV_HEADER.join(","));
      expect(transactions).toContain("Bar Centrale");
      // The tagging rule ran on create, so the row carries the tag by name.
      expect(transactions).toContain("Coffee");

      const rules = entries.get(`${folder}/tagging_rules.csv`)?.toString("utf8") ?? "";
      expect(rules.split("\r\n")[0]).toContain("conditions");
      expect(rules).toContain("Coffee");

      const manifest = JSON.parse(entries.get(`${folder}/manifest.json`)?.toString("utf8") ?? "{}");
      expect(manifest.encrypted).toBe(false);
      expect(manifest.counts).toEqual({
        accounts: 1,
        transactions: 1,
        tags: 1,
        taggingRules: 1,
        recurringRules: 0,
      });
      expect(manifest.files[0].sha256).toMatch(/^[0-9a-f]{64}$/);

      expect(entries.get(`${folder}/README.txt`)?.toString("utf8")).toContain("PLAIN TEXT");
    } finally {
      await harness.close();
    }
  });
});
