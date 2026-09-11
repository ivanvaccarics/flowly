import type { VaultStatus } from "@flowly/web-contracts";

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
  create: <T>(csrf: string, kind: string, entity: unknown) =>
    request<{ entity: T }>(`/api/${kind}`, { method: "POST", csrf, body: { entity } }),
  update: <T>(csrf: string, kind: string, entity: { id: string }) =>
    request<{ entity: T }>(`/api/${kind}/${entity.id}`, { method: "PUT", csrf, body: { entity } }),
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
};
