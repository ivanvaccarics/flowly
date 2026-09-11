import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contractKeys, schemaIndex, validateContract, type ContractKey } from "../src/index.js";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const schemasDir = join(repoRoot, "contracts", "schemas");
const fixturesDir = join(repoRoot, "contracts", "fixtures");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

const fixtureFor: Record<string, ContractKey> = {
  account: "account",
  transaction: "transaction",
  tag: "tag",
  "tagging-rule": "taggingRule",
  "vault-status": "vaultStatus",
  dashboard: "dashboard",
};

describe("canonical contracts", () => {
  it("indexes every schema file", () => {
    const files = readdirSync(schemasDir).filter((file) => file.endsWith(".schema.json"));
    expect(files.length).toBeGreaterThan(0);
    expect(contractKeys.length).toBe(files.length);
    for (const entry of schemaIndex) {
      expect(entry.id).toMatch(/^https:\/\/flowly\.local\/contracts\/schemas\//);
    }
  });

  it.each(Object.entries(fixtureFor))("accepts the %s fixture", (fixtureName, key) => {
    const fixture = readJson(join(fixturesDir, `${fixtureName}.json`));
    const result = validateContract(key, fixture);
    expect(result.valid, JSON.stringify(result)).toBe(true);
  });

  it("rejects unknown properties and wrong format versions", () => {
    const account = readJson(join(fixturesDir, "account.json")) as Record<string, unknown>;
    expect(validateContract("account", { ...account, surprise: true }).valid).toBe(false);
    expect(validateContract("account", { ...account, formatVersion: 2 }).valid).toBe(false);
    expect(validateContract("account", { ...account, id: "not-a-uuid" }).valid).toBe(false);
  });

  it("rejects a tagging rule without tags or conditions", () => {
    const rule = readJson(join(fixturesDir, "tagging-rule.json")) as Record<string, unknown>;
    expect(validateContract("taggingRule", { ...rule, tagIds: [] }).valid).toBe(false);
    expect(validateContract("taggingRule", { ...rule, conditions: [] }).valid).toBe(false);
    expect(
      validateContract("taggingRule", {
        ...rule,
        conditions: [{ field: "userNote", operator: "greaterThan", value: 3 }],
      }).valid,
    ).toBe(false);
  });

  it("reports readable validation errors", () => {
    const result = validateContract("vaultStatus", { state: "open" });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((error) => error.includes("state"))).toBe(true);
    }
  });
});
