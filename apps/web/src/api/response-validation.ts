import {
  validateBankingContract,
  validateClientContract,
  type BankingContractName,
  type ClientContractName,
  type ValidationResult,
} from "@flowly/web-contracts/client-validation";

export type ResponseValidator = (value: unknown) => ValidationResult;

export type ApiResponseContract =
  | { kind: "client"; key: ClientContractName }
  | { kind: "banking"; name: BankingContractName }
  | { kind: "session" }
  | { kind: "lock" }
  | { kind: "changed" }
  | { kind: "deleted" }
  | { kind: "collection"; resource: string }
  | { kind: "entity"; resource: string }
  | { kind: "search" }
  | { kind: "backfill" }
  | { kind: "rule-stats" }
  | { kind: "rule-preview" }
  | { kind: "csv-preview" }
  | { kind: "csv-import" }
  | { kind: "archive-import" };

const invalid = (path: string, message: string): ValidationResult => ({
  valid: false,
  errors: [`${path || "/"} ${message}`],
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

function prefix(result: ValidationResult, path: string): ValidationResult {
  if (result.valid) return result;
  return {
    valid: false,
    errors: result.errors.map((error) => `${path}${error === "/" ? "" : error}`),
  };
}

function validateItem(
  contract: ClientContractName,
  value: unknown,
  path: string,
): ValidationResult {
  return prefix(validateClientContract(contract, value), path);
}

function validateCollectionItems(
  path: string,
  items: unknown,
  validate: (value: unknown, itemPath: string) => ValidationResult,
): ValidationResult {
  if (!Array.isArray(items)) return invalid(`${path}/items`, "must be an array");
  for (const [index, item] of items.entries()) {
    const result = validate(item, `${path}/items/${index}`);
    if (!result.valid) return result;
  }
  return { valid: true };
}

function validateStringArray(value: unknown, path: string): ValidationResult {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return invalid(path, "must be an array of strings");
  }
  return { valid: true };
}

function validateCountRows(
  value: unknown,
  path: string,
  idField: string,
  countField: string,
): ValidationResult {
  if (!Array.isArray(value)) return invalid(path, "must be an array");
  for (const [index, row] of value.entries()) {
    if (!isRecord(row) || typeof row[idField] !== "string" || !isCount(row[countField])) {
      return invalid(`${path}/${index}`, `must contain ${idField} and ${countField}`);
    }
  }
  return { valid: true };
}

const entityContract = {
  accounts: "account",
  transactions: "transaction",
  tags: "tag",
  "tagging-rules": "taggingRule",
} as const satisfies Record<string, ClientContractName>;

type EntityKind = keyof typeof entityContract;

function isEntityKind(kind: string): kind is EntityKind {
  return kind in entityContract;
}

export function validateEntityResponse(kind: string): ResponseValidator {
  return (value) => {
    if (!isRecord(value)) return invalid("/", "must be an object");
    if (!isEntityKind(kind)) return invalid("/entity", `unknown entity kind: ${kind}`);
    return validateItem(entityContract[kind], value["entity"], "/entity");
  };
}

export function validateCollectionResponse(kind: string): ResponseValidator {
  return (value) => {
    if (!isRecord(value)) return invalid("/", "must be an object");
    if (!isEntityKind(kind)) return invalid("/items", `unknown entity kind: ${kind}`);
    return validateCollectionItems("/", value["items"], (item, path) => {
      if (kind !== "tags") return validateItem(entityContract[kind], item, path);
      if (!isRecord(item)) return invalid(path, "must be an object");
      const { usage, ...tag } = item;
      const base = validateItem("tag", tag, path);
      if (!base.valid) return base;
      if (
        usage !== undefined &&
        (!isRecord(usage) || !isCount(usage["transactions"]) || !isCount(usage["rules"]))
      ) {
        return invalid(`${path}/usage`, "must contain non-negative transaction and rule counts");
      }
      return { valid: true };
    });
  };
}

export function validateSearchResponse(value: unknown): ValidationResult {
  if (!isRecord(value)) return invalid("/", "must be an object");
  if (!isCount(value["total"]) || !isCount(value["limit"]) || !isCount(value["offset"])) {
    return invalid("/", "total, limit and offset must be non-negative integers");
  }
  return validateCollectionItems("/", value["items"], (item, path) =>
    validateItem("transaction", item, path),
  );
}

export function validateSessionResponse(value: unknown): ValidationResult {
  if (!isRecord(value)) return invalid("/", "must be an object");
  if (typeof value["csrfToken"] !== "string" || value["csrfToken"].length === 0) {
    return invalid("/csrfToken", "must be a non-empty string");
  }
  return prefix(validateClientContract("vaultStatus", value["vault"]), "/vault");
}

export function validateLockResponse(value: unknown): ValidationResult {
  if (!isRecord(value)) return invalid("/", "must be an object");
  if (value["locked"] !== "current" && value["locked"] !== "all") {
    return invalid("/locked", "must be current or all");
  }
  if (value["sessions"] !== undefined && !isCount(value["sessions"])) {
    return invalid("/sessions", "must be a non-negative integer");
  }
  return { valid: true };
}

export function validateChangedResponse(value: unknown): ValidationResult {
  if (!isRecord(value) || value["changed"] !== true) {
    return invalid("/changed", "must be true");
  }
  return { valid: true };
}

export function validateDeletedResponse(value: unknown): ValidationResult {
  if (!isRecord(value) || value["deleted"] !== true) {
    return invalid("/deleted", "must be true");
  }
  return { valid: true };
}

export function validateBackfillResponse(value: unknown): ValidationResult {
  if (!isRecord(value) || !isCount(value["evaluated"]) || !isCount(value["changed"])) {
    return invalid("/", "evaluated and changed must be non-negative integers");
  }
  return { valid: true };
}

export function validateRuleStatsResponse(value: unknown): ValidationResult {
  if (!isRecord(value) || !isCount(value["evaluated"]) || !isCount(value["matched"])) {
    return invalid("/", "evaluated and matched must be non-negative integers");
  }
  return combine(
    validateCountRows(value["byRule"], "/byRule", "ruleId", "matches"),
    validateCountRows(value["byTag"], "/byTag", "tagId", "transactions"),
  );
}

export function validateRulePreviewResponse(value: unknown): ValidationResult {
  if (!isRecord(value) || !isCount(value["evaluated"]) || !isCount(value["matched"])) {
    return invalid("/", "evaluated and matched must be non-negative integers");
  }
  return { valid: true };
}

export function validateCsvPreviewResponse(value: unknown): ValidationResult {
  if (!isRecord(value)) return invalid("/", "must be an object");
  for (const field of ["rows", "valid", "duplicates"] as const) {
    if (!isCount(value[field])) return invalid(`/${field}`, "must be a non-negative integer");
  }
  if (!Array.isArray(value["errors"])) return invalid("/errors", "must be an array");
  for (const [index, error] of value["errors"].entries()) {
    if (!isRecord(error) || !isCount(error["line"]) || typeof error["message"] !== "string") {
      return invalid(`/errors/${index}`, "must contain line and message");
    }
  }
  return combine(
    validateStringArray(value["newTags"], "/newTags"),
    validateStringArray(value["unknownAccounts"], "/unknownAccounts"),
  );
}

export function validateCsvImportResponse(value: unknown): ValidationResult {
  if (!isRecord(value)) return invalid("/", "must be an object");
  for (const field of [
    "created",
    "skippedDuplicates",
    "invalid",
    "tagsCreated",
    "transactionsTaggedByRules",
  ] as const) {
    if (!isCount(value[field])) return invalid(`/${field}`, "must be a non-negative integer");
  }
  return { valid: true };
}

export function validateArchiveImportResponse(value: unknown): ValidationResult {
  if (!isRecord(value)) return invalid("/", "must be an object");
  for (const field of ["accounts", "transactions", "tags", "taggingRules"] as const) {
    if (!isCount(value[field])) return invalid(`/${field}`, "must be a non-negative integer");
  }
  return { valid: true };
}

export function validateApiResponse(
  contract: ApiResponseContract,
  value: unknown,
): ValidationResult {
  switch (contract.kind) {
    case "client":
      return validateClientContract(contract.key, value);
    case "banking":
      return validateBankingContract(contract.name, value);
    case "session":
      return validateSessionResponse(value);
    case "lock":
      return validateLockResponse(value);
    case "changed":
      return validateChangedResponse(value);
    case "deleted":
      return validateDeletedResponse(value);
    case "collection":
      return validateCollectionResponse(contract.resource)(value);
    case "entity":
      return validateEntityResponse(contract.resource)(value);
    case "search":
      return validateSearchResponse(value);
    case "backfill":
      return validateBackfillResponse(value);
    case "rule-stats":
      return validateRuleStatsResponse(value);
    case "rule-preview":
      return validateRulePreviewResponse(value);
    case "csv-preview":
      return validateCsvPreviewResponse(value);
    case "csv-import":
      return validateCsvImportResponse(value);
    case "archive-import":
      return validateArchiveImportResponse(value);
  }
}

function combine(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap((result) => (result.valid ? [] : result.errors));
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
