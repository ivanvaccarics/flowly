import type {
  Account,
  AspspSummary,
  AuthorizationStartInput,
  BankLinkSummary,
  BankingAuthorizationResult,
  BankingConnectionPublic,
  BankingStatus,
  BankingSyncReport,
  Dashboard,
  ExpenseDetails,
  MapAccountInput,
  RawTransactionRecord,
  SaveConnectionInput,
  Tag,
  TaggingRule,
  Transaction,
  VaultStatus,
} from "@flowly/web-contracts";
import {
  validateBankingContract,
  validateClientContract,
  type BankingContractName,
  type ClientContractName,
} from "@flowly/web-contracts/client-validation";
import {
  validateArchiveImportResponse,
  validateBackfillResponse,
  validateChangedResponse,
  validateCollectionResponse,
  validateCsvImportResponse,
  validateCsvPreviewResponse,
  validateDeletedResponse,
  validateEntityResponse,
  validateLockResponse,
  validateRulePreviewResponse,
  validateRuleStatsResponse,
  validateSearchResponse,
  validateSessionResponse,
  type ResponseValidator,
} from "./response-validation.js";

export type {
  AspspSummary,
  BankLinkSummary,
  BankingAccountSummary,
  BankingAuthorizationResult,
  BankingConnectionPublic,
  BankingStatus,
  BankingSyncReport,
  RawTransactionRecord,
} from "@flowly/web-contracts";

export type BankingConfigInput = SaveConnectionInput;
export type BankAccountMappingInput = Omit<MapAccountInput, "providerAccountUid">;

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded === "" ? "" : `?${encoded}`;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/** What the vault says leans on a tag: movements that carry it, rules that apply it. */
export interface TagUsage {
  transactions: number;
  rules: number;
}

/**
 * The tag listing adds `usage`, which the server computes from the vault on
 * every read. It is never stored, so a tag is written back as the plain entity.
 */
export interface DirectoryTag extends Tag {
  usage: TagUsage;
}

/** What the stored rules cover, as the engine reads them right now. */
export interface TaggingRuleStats {
  /** Transactions the engine looked at. */
  evaluated: number;
  /** Transactions matched by at least one enabled rule. */
  matched: number;
  byRule: Array<{ ruleId: string; matches: number }>;
  byTag: Array<{ tagId: string; transactions: number }>;
}

/** What an unsaved condition set would cover on the most recent transactions. */
export interface TaggingRulePreview {
  evaluated: number;
  matched: number;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  csrf?: string;
  raw?: boolean;
  contract?: { key: ClientContractName } | { banking: BankingContractName };
  validate?: ResponseValidator;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.csrf) headers["x-flowly-csrf"] = options.csrf;

  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    credentials: "same-origin",
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (!response.ok) {
    let code = "request_failed";
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as { error?: string; message?: string };
      code = payload.error ?? code;
      message = payload.message ?? code;
    } catch {
      // Non-JSON error bodies keep the status text.
    }
    throw new ApiError(response.status, code, message);
  }
  if (options.raw) return (await response.arrayBuffer()) as T;
  if (response.status === 204) return undefined as T;
  const payload = (await response.json()) as unknown;
  const result = options.validate
    ? options.validate(payload)
    : options.contract
      ? "key" in options.contract
        ? validateClientContract(options.contract.key, payload)
        : validateBankingContract(options.contract.banking, payload)
      : undefined;
  if (result && !result.valid) {
    throw new ApiError(
      response.status,
      "contract_violation",
      `response did not match its contract: ${result.errors.join("; ")}`,
    );
  }
  return payload as T;
}

export const api = {
  status: () =>
    request<VaultStatus>("/api/vault/status", {
      contract: { key: "vaultStatus" },
    }),
  /**
   * Resumes the browser session from its cookie: the server returns a fresh
   * CSRF token and the vault status, so a reload never asks for the passphrase
   * again while the session lives.
   */
  session: () =>
    request<{ csrfToken: string; vault: VaultStatus }>("/api/session", {
      validate: validateSessionResponse,
    }),
  createVault: (passphrase: string) =>
    request<{ csrfToken: string; vault: VaultStatus }>("/api/vault/create", {
      method: "POST",
      body: { passphrase },
      validate: validateSessionResponse,
    }),
  unlock: (passphrase: string) =>
    request<{ csrfToken: string; vault: VaultStatus }>("/api/vault/unlock", {
      method: "POST",
      body: { passphrase },
      validate: validateSessionResponse,
    }),
  lock: (csrf: string, scope: "current" | "all") =>
    request<{ locked: "current" | "all"; sessions: number }>("/api/vault/lock", {
      method: "POST",
      csrf,
      body: { scope },
      validate: validateLockResponse,
    }),
  changePassphrase: (csrf: string, currentPassphrase: string, nextPassphrase: string) =>
    request<{ changed: boolean }>("/api/vault/passphrase", {
      method: "POST",
      csrf,
      body: { currentPassphrase, nextPassphrase },
      validate: validateChangedResponse,
    }),
  list: <T>(kind: string) =>
    request<{ items: T[] }>(`/api/${kind}`, { validate: validateCollectionResponse(kind) }),
  dashboard: (
    params: {
      from?: string;
      to?: string;
      /** `YYYY-MM` months to include; takes precedence over from/to. */
      months?: string;
      /** Tag ids the aggregates consider, comma separated. */
      tags?: string;
      reference?: string;
    } = {},
  ) =>
    request<Dashboard>(`/api/dashboard${queryString(params)}`, {
      contract: { key: "dashboard" },
    }),
  /**
   * The expense detail view for a period. It takes the same `months` scope as
   * the dashboard and answers one currency's figures plus the ones it left out.
   */
  expenseDetails: (params: { months?: string; from?: string; to?: string } = {}) =>
    request<ExpenseDetails>(`/api/analytics/expenses${queryString(params)}`, {
      contract: { key: "expenseDetails" },
    }),
  searchTransactions: (params: {
    accountId?: string;
    from?: string;
    to?: string;
    months?: string;
    tags?: string;
    currency?: string;
    status?: string;
    source?: string;
    transfer?: boolean;
    q?: string;
    minAmountMinor?: number;
    maxAmountMinor?: number;
    limit?: number;
    offset?: number;
  }) => {
    // `transfer` is the one boolean in the set; the query string carries the
    // word the server parses, like every other filter.
    const { transfer, ...rest } = params;
    return request<{ items: Transaction[]; total: number; limit: number; offset: number }>(
      `/api/transactions${queryString({
        ...rest,
        ...(transfer === undefined ? {} : { transfer: String(transfer) }),
      })}`,
      { validate: validateSearchResponse },
    );
  },
  create: <T>(csrf: string, kind: string, entity: unknown) =>
    request<{ entity: T }>(`/api/${kind}`, {
      method: "POST",
      csrf,
      body: { entity },
      validate: validateEntityResponse(kind),
    }),
  update: <T>(csrf: string, kind: string, id: string, entity: unknown) =>
    request<{ entity: T }>(`/api/${kind}/${id}`, {
      method: "PUT",
      csrf,
      body: { entity },
      validate: validateEntityResponse(kind),
    }),
  remove: (csrf: string, kind: string, id: string, revision: number) =>
    request<{ deleted: boolean }>(`/api/${kind}/${id}?revision=${revision}`, {
      method: "DELETE",
      csrf,
      validate: validateDeletedResponse,
    }),
  cascadeRemove: (csrf: string, kind: string, id: string, revision: number) =>
    request<{ deleted: boolean }>(`/api/${kind}/${id}?revision=${revision}&cascade=true`, {
      method: "DELETE",
      csrf,
      validate: validateDeletedResponse,
    }),
  archiveAccount: (csrf: string, id: string, revision: number) =>
    request<{ entity: Account }>(`/api/accounts/${id}/archive`, {
      method: "POST",
      csrf,
      body: { revision },
      validate: validateEntityResponse("accounts"),
    }),
  restoreAccount: (csrf: string, id: string, revision: number) =>
    request<{ entity: Account }>(`/api/accounts/${id}/restore`, {
      method: "POST",
      csrf,
      body: { revision },
      validate: validateEntityResponse("accounts"),
    }),
  backfill: (
    csrf: string,
    scope: { accountId?: string; fromDate?: string; toDate?: string } = {},
  ) =>
    request<{ evaluated: number; changed: number }>("/api/tagging-rules/backfill", {
      method: "POST",
      csrf,
      body: scope,
      validate: validateBackfillResponse,
    }),
  ruleStats: () =>
    request<TaggingRuleStats>("/api/tagging-rules/stats", {
      validate: validateRuleStatsResponse,
    }),
  previewRule: (
    csrf: string,
    core: { combinator: "and" | "or"; conditions: TaggingRule["conditions"] },
  ) =>
    request<TaggingRulePreview>("/api/tagging-rules/preview", {
      method: "POST",
      csrf,
      body: core,
      validate: validateRulePreviewResponse,
    }),
  exportCsv: async () => {
    const response = await fetch("/api/export/transactions.csv", { credentials: "same-origin" });
    if (!response.ok) throw new ApiError(response.status, "export_failed", "export failed");
    return response.text();
  },
  exportTablesZip: async () => {
    const response = await fetch("/api/export/tables.zip", { credentials: "same-origin" });
    if (!response.ok) throw new ApiError(response.status, "export_failed", "export failed");
    const disposition = response.headers.get("content-disposition") ?? "";
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "flowly-export.zip";
    return { content: await response.arrayBuffer(), filename };
  },
  exportArchive: async (csrf: string, password: string) => {
    const response = await fetch("/api/export/archive", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "x-flowly-csrf": csrf },
      body: JSON.stringify({ password }),
    });
    if (!response.ok) throw new ApiError(response.status, "export_failed", "export failed");
    return response.arrayBuffer();
  },
  previewCsv: (csrf: string, content: string) =>
    request<{
      rows: number;
      valid: number;
      duplicates: number;
      errors: Array<{ line: number; message: string }>;
      newTags: string[];
      unknownAccounts: string[];
    }>("/api/import/csv/preview", {
      method: "POST",
      csrf,
      body: { content },
      validate: validateCsvPreviewResponse,
    }),
  importCsv: (csrf: string, content: string) =>
    request<{
      created: number;
      skippedDuplicates: number;
      invalid: number;
      tagsCreated: number;
      transactionsTaggedByRules: number;
    }>("/api/import/csv", {
      method: "POST",
      csrf,
      body: { content },
      validate: validateCsvImportResponse,
    }),
  importArchive: (csrf: string, password: string, contentBase64: string) =>
    request<{ accounts: number; transactions: number; tags: number; taggingRules: number }>(
      "/api/import/archive",
      {
        method: "POST",
        csrf,
        body: { password, contentBase64 },
        validate: validateArchiveImportResponse,
      },
    ),

  // --- Enable Banking -------------------------------------------------------

  bankingStatus: () =>
    request<BankingStatus>("/api/banking/status", {
      contract: { banking: "BankingStatus" },
    }),
  saveBankingConfig: (csrf: string, body: BankingConfigInput) =>
    request<{ connection: BankingConnectionPublic; status: BankingStatus }>(
      "/api/banking/enable-banking/config",
      { method: "PUT", csrf, body, contract: { banking: "SaveConnectionResponse" } },
    ),
  deleteBankingConfig: (csrf: string) =>
    request<{ deleted: boolean; deletedLinks: number }>("/api/banking/enable-banking/config", {
      method: "DELETE",
      csrf,
      contract: { banking: "DeleteConnectionResponse" },
    }),
  listAspsps: (params: { country?: string; psuType?: "personal" | "business" } = {}) =>
    request<{ items: AspspSummary[] }>(`/api/banking/enable-banking/aspsps${queryString(params)}`, {
      contract: { banking: "AspspsResponse" },
    }),
  startBankingAuthorization: (csrf: string, body: AuthorizationStartInput) =>
    request<{ linkId: string; url: string; state: string; expiresAt: string }>(
      "/api/banking/enable-banking/authorize",
      { method: "POST", csrf, body, contract: { banking: "AuthorizeStartResponse" } },
    ),
  completeBankingAuthorization: (csrf: string, body: { code: string; state: string }) =>
    request<BankingAuthorizationResult>("/api/banking/enable-banking/callback", {
      method: "POST",
      csrf,
      body,
      contract: { banking: "BankingAuthorizationResult" },
    }),
  mapBankAccount: (
    csrf: string,
    linkId: string,
    body: BankAccountMappingInput & { providerAccountUid: string },
  ) =>
    request<BankLinkSummary>(`/api/banking/enable-banking/links/${linkId}/accounts`, {
      method: "POST",
      csrf,
      body,
      contract: { banking: "BankLinkSummary" },
    }),
  unlinkBank: (csrf: string, linkId: string) =>
    request<{ deleted: boolean; deletedAccounts: number; deletedPayloads: number }>(
      `/api/banking/enable-banking/links/${linkId}`,
      { method: "DELETE", csrf, contract: { banking: "UnlinkResponse" } },
    ),
  syncBanking: (csrf: string, linkId?: string) =>
    request<{ report: BankingSyncReport; status: BankingStatus }>("/api/banking/sync", {
      method: "POST",
      csrf,
      body: linkId ? { linkId } : {},
      contract: { banking: "SyncResponse" },
    }),

  /** The raw provider record behind one transaction, for the ledger's Raw view. */
  transactionRaw: (id: string) =>
    request<RawTransactionRecord>(`/api/transactions/${encodeURIComponent(id)}/raw`, {
      contract: { banking: "RawTransactionRecord" },
    }),
};
