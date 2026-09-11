#!/usr/bin/env node
/**
 * Generates TypeScript types and embedded schemas from `contracts/schemas`.
 * The JSON Schema files stay the single source of truth; this script never
 * invents behaviour and its output is committed.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const repoRoot = join(packageRoot, "..", "..");
const schemasDir = join(repoRoot, "contracts", "schemas");
const outDir = join(packageRoot, "src", "generated");

const BANNER = `/* eslint-disable */
/**
 * GENERATED FILE — do not edit by hand.
 * Source: contracts/schemas/*.schema.json
 * Regenerate with: pnpm contracts:generate
 */
`;

mkdirSync(outDir, { recursive: true });

const schemaFiles = readdirSync(schemasDir)
  .filter((file) => file.endsWith(".schema.json"))
  .sort();

if (schemaFiles.length === 0) {
  throw new Error(`no schemas found in ${schemasDir}`);
}

const schemas = {};
const typeChunks = [];
const schemaIds = [];

for (const file of schemaFiles) {
  const key = toCamelCase(file.replace(/\.schema\.json$/, ""));
  const schema = JSON.parse(readFileSync(join(schemasDir, file), "utf8"));
  if (!schema.title) throw new Error(`${file} is missing a title`);
  schemas[key] = schema;
  schemaIds.push({ key, title: schema.title, id: schema.$id });
  const generated = await compile(schema, schema.title, { bannerComment: "" });
  typeChunks.push(generated.trim());
}

writeFileSync(join(outDir, "types.ts"), `${BANNER}\n${typeChunks.join("\n\n")}\n`);

writeFileSync(
  join(outDir, "schemas.ts"),
  `${BANNER}
export const schemas = ${JSON.stringify(schemas, null, 2)} as const;

export const schemaIndex = ${JSON.stringify(schemaIds, null, 2)} as const;

export type ContractKey = keyof typeof schemas;
`,
);

console.log(`Generated ${schemaFiles.length} contract schemas into ${outDir}`);

function toCamelCase(value) {
  return value.replace(/-([a-z0-9])/g, (_match, character) => character.toUpperCase());
}
