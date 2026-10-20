#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateContract } from "../dist/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "..", "..", "..", "contracts", "fixtures");
const checks = [
  ["account", "account.json"],
  ["dashboard", "dashboard.json"],
  ["expenseDetails", "expense-details.json"],
  ["vaultStatus", "vault-status.json"],
];

for (const [contract, file] of checks) {
  const fixture = JSON.parse(readFileSync(join(fixtures, file), "utf8"));
  const result = validateContract(contract, fixture);
  if (!result.valid) {
    console.error(`${contract} failed in the Node ESM runtime: ${result.errors.join("; ")}`);
    process.exitCode = 1;
  } else {
    console.log(`${contract}: Node ESM validator passed`);
  }
}
