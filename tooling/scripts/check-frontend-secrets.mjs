#!/usr/bin/env node
/**
 * Fails the build when a frontend environment variable looks like a secret.
 * Vite inlines every VITE_* value into the shipped bundle, so a secret there is
 * a leak by construction.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SECRET_PATTERN = /(SECRET|TOKEN|PASSWORD|PASSPHRASE|PRIVATE|CREDENTIAL|API_?KEY)/i;
const SCANNED_ROOTS = ["apps/web"];
const IGNORED_DIRS = new Set(["node_modules", "dist", "coverage"]);

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile() && statSync(path).size > 0) files.push(path);
  }
  return files;
}

const violations = [];
for (const root of SCANNED_ROOTS) {
  for (const file of walk(root)) {
    const content = readFileSync(file, "utf8");
    for (const match of content.matchAll(/VITE_[A-Z0-9_]+/g)) {
      if (SECRET_PATTERN.test(match[0])) violations.push(`${file}: ${match[0]}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Secret-looking frontend variables are not allowed:");
  for (const violation of violations) console.error(`  - ${violation}`);
  process.exit(1);
}

console.log("Frontend secret check passed: no secret-looking VITE_* variables.");
