import { signEnableBankingJwt } from "./jwt.js";
import type {
  EbAccountResource,
  EbApplication,
  EbAspsp,
  EbAuthorizeSessionResponse,
  EbBalance,
  EbErrorBody,
  EbPsuType,
  EbSession,
  EbStartAuthorizationResponse,
  EbTransaction,
} from "./enable-banking-types.js";

export const ENABLE_BANKING_API_ORIGIN = "https://api.enablebanking.com";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RETRIES = 2;
const RETRY_BASE_MS = 250;
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const MAX_TRANSACTION_PAGES = 40;

/** PSU context forwarded to the ASPSP when the bank requires it. */
export interface PsuHeaders {
  psuIpAddress?: string;
  psuUserAgent?: string;
}

export interface EnableBankingClientOptions {
  appId: string;
  privateKeyPem: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  retries?: number;
  /** Injected by tests so backoff does not actually wait. */
  sleep?: (ms: number) => Promise<void>;
}

export interface TransactionPage {
  transactions: EbTransaction[];
  continuationKey?: string;
}

export class EnableBankingError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly detail?: unknown;

  constructor(
    message: string,
    options: { status: number; code?: string; detail?: unknown; cause?: unknown },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "EnableBankingError";
    this.status = options.status;
    if (options.code !== undefined) this.code = options.code;
    if (options.detail !== undefined) this.detail = options.detail;
  }

  /** True when the stored session cannot be used any more. */
  get needsReconnect(): boolean {
    return (
      this.status === 401 ||
      this.code === "EXPIRED_SESSION" ||
      this.code === "REVOKED_SESSION" ||
      this.code === "CLOSED_SESSION" ||
      this.code === "SESSION_DOES_NOT_EXIST" ||
      this.code === "WRONG_SESSION_STATUS"
    );
  }
}

/**
 * Thin Enable Banking API client. Every request is signed with a short-lived
 * JWT, time-bounded and retried with bounded backoff on transient failures.
 */
export class EnableBankingClient {
  private readonly appId: string;
  private readonly privateKeyPem: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: EnableBankingClientOptions) {
    this.appId = options.appId;
    this.privateKeyPem = options.privateKeyPem;
    this.baseUrl = (options.baseUrl ?? ENABLE_BANKING_API_ORIGIN).replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  token(issuedAt?: number): string {
    return signEnableBankingJwt({
      appId: this.appId,
      privateKeyPem: this.privateKeyPem,
      ...(issuedAt === undefined ? {} : { issuedAt }),
    });
  }

  getApplication(): Promise<EbApplication> {
    return this.request<EbApplication>("GET", "/application");
  }

  async listAspsps(params: { country?: string; psuType?: EbPsuType } = {}): Promise<EbAspsp[]> {
    const query = new URLSearchParams({ service: "AIS" });
    if (params.country) query.set("country", params.country.toUpperCase());
    if (params.psuType) query.set("psu_type", params.psuType);
    const response = await this.request<{ aspsps?: EbAspsp[] }>("GET", `/aspsps?${query}`);
    return response.aspsps ?? [];
  }

  startAuthorization(body: {
    aspspName: string;
    aspspCountry: string;
    state: string;
    redirectUrl: string;
    psuType: EbPsuType;
    validUntil: string;
    psuId?: string;
  }): Promise<EbStartAuthorizationResponse> {
    return this.request<EbStartAuthorizationResponse>("POST", "/auth", {
      access: {
        balances: true,
        transactions: true,
        valid_until: body.validUntil,
      },
      aspsp: { name: body.aspspName, country: body.aspspCountry.toUpperCase() },
      state: body.state,
      redirect_url: body.redirectUrl,
      psu_type: body.psuType,
      ...(body.psuId ? { psu_id: body.psuId } : {}),
    });
  }

  createSession(code: string): Promise<EbAuthorizeSessionResponse> {
    return this.request<EbAuthorizeSessionResponse>("POST", "/sessions", { code });
  }

  getSession(sessionId: string): Promise<EbSession> {
    return this.request<EbSession>("GET", `/sessions/${encodeURIComponent(sessionId)}`);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request<unknown>("DELETE", `/sessions/${encodeURIComponent(sessionId)}`);
  }

  getAccount(accountUid: string, psu: PsuHeaders = {}): Promise<EbAccountResource> {
    return this.request<EbAccountResource>(
      "GET",
      `/accounts/${encodeURIComponent(accountUid)}/details`,
      undefined,
      psu,
    );
  }

  async getBalances(accountUid: string, psu: PsuHeaders = {}): Promise<EbBalance[]> {
    const response = await this.request<{ balances?: EbBalance[] }>(
      "GET",
      `/accounts/${encodeURIComponent(accountUid)}/balances`,
      undefined,
      psu,
    );
    return response.balances ?? [];
  }

  /** Fetches every page of transactions in the window, honouring `date_from`. */
  async getTransactions(
    accountUid: string,
    params: { dateFrom?: string; dateTo?: string; psu?: PsuHeaders } = {},
  ): Promise<TransactionPage[]> {
    const pages: TransactionPage[] = [];
    let continuationKey: string | undefined;
    for (let page = 0; page < MAX_TRANSACTION_PAGES; page += 1) {
      const query = new URLSearchParams({ strategy: "default" });
      if (params.dateFrom) query.set("date_from", params.dateFrom);
      if (params.dateTo) query.set("date_to", params.dateTo);
      if (continuationKey) query.set("continuation_key", continuationKey);
      const response = await this.request<{
        transactions?: EbTransaction[];
        continuation_key?: string | null;
      }>(
        "GET",
        `/accounts/${encodeURIComponent(accountUid)}/transactions?${query}`,
        undefined,
        params.psu ?? {},
      );
      const next = response.continuation_key ?? undefined;
      pages.push({
        transactions: response.transactions ?? [],
        ...(next ? { continuationKey: next } : {}),
      });
      if (!next) break;
      continuationKey = next;
    }
    return pages;
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
    psu: PsuHeaders = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: "application/json",
      authorization: `Bearer ${this.token()}`,
    };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (psu.psuIpAddress) headers["psu-ip-address"] = psu.psuIpAddress;
    if (psu.psuUserAgent) headers["psu-user-agent"] = psu.psuUserAgent;

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      if (attempt > 0) await this.sleep(RETRY_BASE_MS * 4 ** (attempt - 1));
      try {
        const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers,
          signal: AbortSignal.timeout(this.timeoutMs),
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        if (response.ok) {
          if (response.status === 204) return undefined as T;
          const text = await response.text();
          return (text === "" ? undefined : JSON.parse(text)) as T;
        }
        const error = await toError(response);
        if (!RETRYABLE_STATUS.has(response.status) || attempt === this.retries) throw error;
        lastError = error;
      } catch (cause) {
        if (cause instanceof EnableBankingError) throw cause;
        lastError = new EnableBankingError(
          cause instanceof Error ? cause.message : "Enable Banking request failed",
          { status: 0, cause },
        );
        if (attempt === this.retries) throw lastError;
      }
    }
    throw lastError;
  }
}

async function toError(response: Response): Promise<EnableBankingError> {
  let parsed: EbErrorBody = {};
  try {
    parsed = (await response.json()) as EbErrorBody;
  } catch {
    // A non-JSON error body still carries the status code.
  }
  return new EnableBankingError(
    parsed.message ?? `Enable Banking responded with ${response.status}`,
    {
      status: response.status,
      ...(parsed.error === undefined ? {} : { code: parsed.error }),
      ...(parsed.detail === undefined ? {} : { detail: parsed.detail }),
    },
  );
}
