import type { Dashboard, Transaction, VaultStatus } from "@flowly/web-contracts";

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

export interface Session {
  csrf: string;
}

export interface BankingConnectionPublic {
  id: string;
  provider: "enable-banking";
  appId: string;
  redirectUrl: string;
  environment: "SANDBOX" | "PRODUCTION";
  psuType: "personal" | "business";
  country: string;
  autoSync: boolean;
  appName?: string;
  keyFingerprint: string;
  createdAt: string;
  updatedAt: string;
}

export interface BankingAccountSummary {
  id: string;
  providerAccountUid: string;
  status: "unmapped" | "mapped" | "ignored";
  accountId?: string;
  accountName?: string;
  iban?: string;
  maskedIban?: string;
  providerName?: string;
  currency?: string;
  cashAccountType?: string;
  lastSyncedAt?: string;
  lastBalanceMinor?: number;
  lastBalanceCurrency?: string;
  lastBalanceAt?: string;
  transactionCount: number;
}

export interface BankLinkSummary {
  id: string;
  aspspName: string;
  aspspCountry: string;
  aspspLogo?: string;
  psuType: "personal" | "business";
  status: "pending" | "authorized" | "expired" | "revoked" | "failed" | "closed";
  accessValidUntil?: string;
  lastSyncedAt?: string;
  lastSyncError?: string;
  createdAt: string;
  accounts: BankingAccountSummary[];
}

export interface BankingSyncReport {
  startedAt: string;
  finishedAt: string;
  links: number;
  accounts: number;
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  errors: Array<{ linkId: string; accountId?: string; message: string }>;
  reconnectRequired: string[];
}

export interface BankingStatus {
  provider: "enable-banking";
  configured: boolean;
  connection?: BankingConnectionPublic;
  links: BankLinkSummary[];
  sync: { running: boolean; lastSyncAt?: string; lastReport?: BankingSyncReport };
  autoSync?: boolean;
}

export interface AspspSummary {
  name: string;
  country: string;
  logo?: string;
  bic?: string;
  beta: boolean;
  psuTypes: Array<"personal" | "business">;
  maximumConsentDays?: number;
  sandboxUsers: Array<{ username?: string; password?: string; otp?: string }>;
  methods: Array<{
    name?: string;
    approach: string;
    psuType: "personal" | "business";
    credentials: Array<{
      name: string;
      title?: string;
      required: boolean;
      description?: string;
      template?: string;
    }>;
  }>;
}

export interface BankingAuthorizationResult {
  link: BankLinkSummary;
  accounts: Array<{
    providerAccountUid: string;
    status: BankingAccountSummary["status"];
    suggestedName: string;
    suggestedType: string;
    suggestedCurrency?: string;
    currency?: string;
    iban?: string;
    maskedIban?: string;
    providerName?: string;
    cashAccountType?: string;
  }>;
  aspsp: { name: string; country: string };
  accessValidUntil?: string;
}

export interface BankingConfigInput {
  appId: string;
  /** Omitted when only settings change; the stored key is reused. */
  privateKeyPem?: string;
  redirectUrl: string;
  environment: "SANDBOX" | "PRODUCTION";
  psuType: "personal" | "business";
  country: string;
  autoSync: boolean;
}

export interface BankAccountMappingInput {
  mode: "create" | "pair" | "ignore";
  accountId?: string;
  name?: string;
  type?: string;
  currency?: string;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  csrf?: string;
  raw?: boolean;
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
  return (await response.json()) as T;
}

export const api = {
  status: () => request<VaultStatus>("/api/vault/status"),
  createVault: (passphrase: string) =>
    request<{ csrfToken: string; vault: VaultStatus }>("/api/vault/create", {
      method: "POST",
      body: { passphrase },
    }),
  unlock: (passphrase: string) =>
    request<{ csrfToken: string; vault: VaultStatus }>("/api/vault/unlock", {
      method: "POST",
      body: { passphrase },
    }),
  lock: (csrf: string, scope: "current" | "all") =>
    request<{ locked: string }>("/api/vault/lock", { method: "POST", csrf, body: { scope } }),
  changePassphrase: (csrf: string, currentPassphrase: string, nextPassphrase: string) =>
    request<{ changed: boolean }>("/api/vault/passphrase", {
      method: "POST",
      csrf,
      body: { currentPassphrase, nextPassphrase },
    }),
  list: <T>(kind: string) => request<{ items: T[] }>(`/api/${kind}`),
  dashboard: (params: { from?: string; to?: string; reference?: string } = {}) =>
    request<Dashboard>(`/api/dashboard${queryString(params)}`),
  searchTransactions: (params: {
    accountId?: string;
    from?: string;
    to?: string;
    tags?: string;
    currency?: string;
    status?: string;
    q?: string;
    minAmountMinor?: number;
    maxAmountMinor?: number;
    limit?: number;
    offset?: number;
  }) =>
    request<{ items: Transaction[]; total: number; limit: number; offset: number }>(
      `/api/transactions${queryString(params)}`,
    ),
  create: <T>(csrf: string, kind: string, entity: unknown) =>
    request<{ entity: T }>(`/api/${kind}`, { method: "POST", csrf, body: { entity } }),
  update: <T>(csrf: string, kind: string, id: string, entity: unknown) =>
    request<{ entity: T }>(`/api/${kind}/${id}`, { method: "PUT", csrf, body: { entity } }),
  remove: (csrf: string, kind: string, id: string, revision: number) =>
    request<{ deleted: boolean }>(`/api/${kind}/${id}?revision=${revision}`, {
      method: "DELETE",
      csrf,
    }),
  cascadeRemove: (csrf: string, kind: string, id: string, revision: number) =>
    request<{ deleted: boolean }>(`/api/${kind}/${id}?revision=${revision}&cascade=true`, {
      method: "DELETE",
      csrf,
    }),
  archiveAccount: (csrf: string, id: string, revision: number) =>
    request<{ entity: unknown }>(`/api/accounts/${id}/archive`, {
      method: "POST",
      csrf,
      body: { revision },
    }),
  restoreAccount: (csrf: string, id: string, revision: number) =>
    request<{ entity: unknown }>(`/api/accounts/${id}/restore`, {
      method: "POST",
      csrf,
      body: { revision },
    }),
  backfill: (
    csrf: string,
    scope: { accountId?: string; fromDate?: string; toDate?: string } = {},
  ) =>
    request<{ evaluated: number; changed: number }>("/api/tagging-rules/backfill", {
      method: "POST",
      csrf,
      body: scope,
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
    }>("/api/import/csv/preview", { method: "POST", csrf, body: { content } }),
  importCsv: (csrf: string, content: string) =>
    request<{
      created: number;
      skippedDuplicates: number;
      invalid: number;
      tagsCreated: number;
      transactionsTaggedByRules: number;
    }>("/api/import/csv", { method: "POST", csrf, body: { content } }),
  importArchive: (csrf: string, password: string, contentBase64: string) =>
    request<{ accounts: number; transactions: number; tags: number; taggingRules: number }>(
      "/api/import/archive",
      { method: "POST", csrf, body: { password, contentBase64 } },
    ),

  // --- Enable Banking -------------------------------------------------------

  bankingStatus: () => request<BankingStatus>("/api/banking/status"),
  saveBankingConfig: (csrf: string, body: BankingConfigInput) =>
    request<{ connection: BankingConnectionPublic; status: BankingStatus }>(
      "/api/banking/enable-banking/config",
      { method: "PUT", csrf, body },
    ),
  deleteBankingConfig: (csrf: string) =>
    request<{ deleted: boolean }>("/api/banking/enable-banking/config", {
      method: "DELETE",
      csrf,
    }),
  listAspsps: (params: { country?: string; psuType?: "personal" | "business" } = {}) =>
    request<{ items: AspspSummary[] }>(`/api/banking/enable-banking/aspsps${queryString(params)}`),
  startBankingAuthorization: (
    csrf: string,
    body: { aspspName: string; aspspCountry: string; psuType: "personal" | "business" },
  ) =>
    request<{ linkId: string; url: string; state: string; expiresAt: string }>(
      "/api/banking/enable-banking/authorize",
      { method: "POST", csrf, body },
    ),
  completeBankingAuthorization: (csrf: string, body: { code: string; state: string }) =>
    request<BankingAuthorizationResult>("/api/banking/enable-banking/callback", {
      method: "POST",
      csrf,
      body,
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
    }),
  unlinkBank: (csrf: string, linkId: string) =>
    request<{ deleted: boolean; deletedAccounts: number }>(
      `/api/banking/enable-banking/links/${linkId}`,
      { method: "DELETE", csrf },
    ),
  syncBanking: (csrf: string, linkId?: string) =>
    request<{ report: BankingSyncReport; status: BankingStatus }>("/api/banking/sync", {
      method: "POST",
      csrf,
      body: linkId ? { linkId } : {},
    }),
};
