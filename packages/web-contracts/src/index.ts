// `ajv` and `ajv-formats` are CommonJS packages whose default exports are not
// visible to the NodeNext resolver, so the named export and an explicit
// namespace interop are used instead of a synthetic default import.
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import * as addFormatsModule from "ajv-formats";
import type { FormatsPlugin } from "ajv-formats";
import { schemaIndex, schemas, type ContractKey } from "./generated/schemas.js";

export * from "./generated/schemas.js";
export type * from "./generated/types.js";

const addFormats = (addFormatsModule as unknown as { default: FormatsPlugin }).default;

// Schemas use JSON Schema union types (for example `["string", "number"]` and
// nullable fields), so strict mode needs them enabled explicitly.
const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);

const compiled: Record<ContractKey, ValidateFunction> = Object.fromEntries(
  (Object.keys(schemas) as ContractKey[]).map((key) => [key, ajv.compile(schemas[key])]),
) as Record<ContractKey, ValidateFunction>;

export type ValidationResult = { valid: true } | { valid: false; errors: readonly string[] };

/** Runtime validation. Generated types never replace this check. */
export function validateContract(key: ContractKey, value: unknown): ValidationResult {
  const validator = compiled[key];
  if (validator(value)) return { valid: true };
  const errors = (validator.errors ?? []).map(
    (error) =>
      `${error.instancePath === "" ? "/" : error.instancePath} ${error.message ?? "is invalid"}`,
  );
  return { valid: false, errors };
}

export const contractKeys = Object.keys(schemas) as readonly ContractKey[];
export { schemaIndex };
