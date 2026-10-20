#!/usr/bin/env node
/**
 * Generates TypeScript types and embedded schemas from `contracts/schemas`.
 * The JSON Schema files stay the single source of truth; this script never
 * invents behaviour and its output is committed.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import addFormatsModule from "ajv-formats";
import { compile } from "json-schema-to-typescript";

const addFormats = addFormatsModule.default ?? addFormatsModule;
const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const repoRoot = join(packageRoot, "..", "..");
const schemasDir = join(repoRoot, "contracts", "schemas");
const outDir = join(packageRoot, "src", "generated");

const BANNER = `/* eslint-disable */
// @ts-nocheck
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
const contractKeys = [];

for (const file of schemaFiles) {
  const key = toCamelCase(file.replace(/\.schema\.json$/, ""));
  const schema = JSON.parse(readFileSync(join(schemasDir, file), "utf8"));
  if (!schema.title) throw new Error(`${file} is missing a title`);
  schemas[key] = schema;
  contractKeys.push(key);
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
export const contractKeys = ${JSON.stringify(contractKeys, null, 2)} as const;
`,
);

const ajv = new Ajv2020({
  allErrors: true,
  code: { source: true, esm: true },
  strict: true,
  allowUnionTypes: true,
});
addFormats(ajv);
const validatorRefs = {};
for (const key of contractKeys) {
  const schema = schemas[key];
  ajv.addSchema(schema, schema.$id);
  validatorRefs[key] = schema.$id;
}

const banking = schemas.banking;
const bankingDefinitions = Object.keys(banking.$defs);
const bankingValidatorNames = {};
for (const name of bankingDefinitions) {
  const validatorName = `banking${name}`;
  validatorRefs[validatorName] = `${banking.$id}#/$defs/${name}`;
  bankingValidatorNames[name] = validatorName;
}

const clientContractKeys = [
  "vaultStatus",
  "dashboard",
  "expenseDetails",
  "account",
  "tag",
  "transaction",
  "taggingRule",
];
const clientValidatorRefs = {
  ...Object.fromEntries(clientContractKeys.map((key) => [key, validatorRefs[key]])),
  ...Object.fromEntries(
    bankingDefinitions.map((name) => [
      bankingValidatorNames[name],
      validatorRefs[bankingValidatorNames[name]],
    ]),
  ),
};

function standaloneModule(refs) {
  const source = standaloneCode(ajv, refs)
    .replaceAll('require("ajv/dist/runtime/ucs2length").default', "ucs2length")
    .replaceAll('require("ajv-formats/dist/formats")', "formats");
  if (source.includes("require(")) {
    throw new Error("standalone validators still contain CommonJS require calls");
  }
  return `${BANNER}import ucs2lengthModule from "ajv/dist/runtime/ucs2length.js";
import formats from "ajv-formats/dist/formats.js";
// Ajv's helper is CommonJS: Node ESM exposes module.exports as default.
const ucs2length = ucs2lengthModule.default ?? ucs2lengthModule;
${source}`;
}

writeFileSync(
  join(outDir, "validators.ts"),
  `${standaloneModule(validatorRefs)}

export const contractValidators = {
${contractKeys.map((key) => `  ${JSON.stringify(key)}: ${key},`).join("\n")}
} as const;

export const bankingValidators = {
${bankingDefinitions
  .map((name) => `  ${JSON.stringify(name)}: ${bankingValidatorNames[name]},`)
  .join("\n")}
} as const;

export type BankingContractName = keyof typeof bankingValidators;
`,
);

writeFileSync(
  join(outDir, "client-validators.ts"),
  `${standaloneModule(clientValidatorRefs)}

export const bankingValidators = {
${bankingDefinitions
  .map((name) => `  ${JSON.stringify(name)}: ${bankingValidatorNames[name]},`)
  .join("\n")}
} as const;

export type BankingContractName = keyof typeof bankingValidators;
`,
);

console.log(`Generated ${schemaFiles.length} contract schemas into ${outDir}`);

function toCamelCase(value) {
  return value.replace(/-([a-z0-9])/g, (_match, character) => character.toUpperCase());
}
