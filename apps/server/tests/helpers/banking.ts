import { generateKeyPairSync } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/api/app.js";
import {
  EnableBankingError,
  type EnableBankingClient,
} from "../../src/banking/enable-banking-client.js";
import { fixedClock, type Clock } from "../../src/domain/clock.js";
import type { ServerConfig } from "../../src/config.js";
import { cleanup } from "./test-utils.js";
import type {
  EbAccountResource,
  EbApplication,
  EbAspsp,
  EbAuthorizeSessionResponse,
  EbBalance,
  EbSession,
  EbTransaction,
} from "../../src/banking/enable-banking-types.js";

/**
 * Synthetic provider identifiers. Never paste values copied from a real Enable
 * Banking response or control panel: an id is not a credential, but it points
 * at a real consent attempt and has no business travelling in a public repo.
 */
export const TEST_APP_ID = "11111111-1111-4111-8111-111111111111";
export const TEST_AUTHORIZATION_ID = "22222222-2222-4222-8222-222222222222";
export const TEST_REDIRECT_URL = "https://flowly.test/enablebanking/auth_callback";

let cachedKey: string | undefined;

/** A throwaway RSA key, generated once per test run and never committed. */
export function testPrivateKeyPem(): string {
  if (!cachedKey) {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    cachedKey = privateKey;
  }
  return cachedKey;
}

export function sampleAspsp(overrides: Partial<EbAspsp> = {}): EbAspsp {
  return {
    name: "UniCredit",
    country: "IT",
    logo: "https://enablebanking.com/brands/IT/UniCredit/",
    psu_types: ["personal", "business"],
    auth_methods: [
      { name: "MTA", title: "Mobile token", psu_type: "personal", approach: "REDIRECT" },
      { name: "MTA", psu_type: "business", approach: "REDIRECT" },
    ],
    maximum_consent_validity: 7776000,
    beta: false,
    bic: "UNCRITMM",
    sandbox: { users: [{ username: "customera", password: "12345678", otp: "123456" }] },
    ...overrides,
  };
}

export function sampleAccountResource(
  overrides: Partial<EbAccountResource> = {},
): EbAccountResource {
  return {
    account_id: { iban: "IT60X0542811101000000123456" },
    all_account_ids: [{ identification: "000000123456", scheme_name: "BBAN" }],
    account_servicer: { name: "UniCredit", bic_fi: "UNCRITMM" },
    name: "MARIO ROSSI",
    details: "Conto corrente",
    usage: "PRIV",
    cash_account_type: "CACC",
    product: "MyGenius",
    currency: "EUR",
    legal_age: true,
    uid: "0f7d3d1c-3f4e-4b0e-9f1a-2b3c4d5e6f70",
    identification_hash: "hash-cacc-eur",
    identification_hashes: ["hash-cacc-eur", "hash-bban"],
    ...overrides,
  };
}

export function sampleTransaction(overrides: Partial<EbTransaction> = {}): EbTransaction {
  return {
    entry_reference: "6a970267-0e42-a2f0-93b8-b7c9cf4b7862",
    merchant_category_code: "5499",
    transaction_amount: { currency: "EUR", amount: "3.75" },
    creditor: { name: "Bar Centrale" },
    debtor: { name: "MARIO ROSSI" },
    bank_transaction_code: { description: "CARD_PAYMENT", code: "CARD_PAYMENT", sub_code: null },
    credit_debit_indicator: "DBIT",
    status: "BOOK",
    booking_date: "2026-09-01",
    value_date: "2026-09-02",
    remittance_information: ["Bar Centrale Mas"],
    debtor_account_additional_identification: [
      { identification: "1061", scheme_name: "CPAN", issuer: "VISA" },
    ],
    transaction_id: null,
    ...overrides,
  };
}

export function sampleBalance(overrides: Partial<EbBalance> = {}): EbBalance {
  return {
    name: "Booked balance",
    balance_amount: { currency: "EUR", amount: "1234.56" },
    balance_type: "CLBD",
    reference_date: "2026-09-11",
    ...overrides,
  };
}

export interface FakeBankOptions {
  application?: Partial<EbApplication>;
  aspsps?: EbAspsp[];
  accounts?: EbAccountResource[];
  balances?: EbBalance[];
  transactions?: EbTransaction[] | EbTransaction[][];
  sessionStatus?: string;
  failSessionStatusOnce?: boolean;
}

/** The read on which the ASPSP starts refusing for its daily access cap. */
export type RateLimitCall = "getAccount" | "getBalances" | "getTransactions";

/**
 * In-memory stand-in for the Enable Banking API. Records every call so tests
 * can assert what was fetched, with when.
 */
export class FakeBank {
  application: EbApplication;
  aspsps: EbAspsp[];
  accounts: EbAccountResource[];
  balances: EbBalance[];
  transactionPages: EbTransaction[][];
  sessionStatus: string;
  failSessionStatusOnce: boolean;
  calls: string[] = [];
  deletedSessions: string[] = [];
  startAuthorizationBody: Record<string, unknown> | undefined;
  error429Once = false;
  /** Provider account uid the ASPSP refuses, and the read that first hits it. */
  rateLimitUid: string | undefined;
  rateLimitOn: RateLimitCall = "getTransactions";
  /** `Retry-After` the refusal carries, when the test wants one. */
  rateLimitRetryAfterMs?: number;

  constructor(options: FakeBankOptions = {}) {
    this.application = {
      name: "mytest-app",
      kid: TEST_APP_ID,
      environment: "SANDBOX",
      redirect_urls: [TEST_REDIRECT_URL],
      active: true,
      countries: ["IT"],
      services: ["AIS", "PIS"],
      ...options.application,
    };
    this.aspsps = options.aspsps ?? [sampleAspsp()];
    this.accounts = options.accounts ?? [sampleAccountResource()];
    this.balances = options.balances ?? [sampleBalance()];
    this.transactionPages =
      options.transactions === undefined
        ? [[sampleTransaction()]]
        : Array.isArray(options.transactions[0])
          ? (options.transactions as EbTransaction[][])
          : [options.transactions as EbTransaction[]];
    this.sessionStatus = options.sessionStatus ?? "AUTHORIZED";
    this.failSessionStatusOnce = options.failSessionStatusOnce ?? false;
  }

  asClient(): EnableBankingClient {
    return this as unknown as EnableBankingClient;
  }

  async getApplication(): Promise<EbApplication> {
    this.calls.push("getApplication");
    if (this.error429Once) {
      this.error429Once = false;
      throw new EnableBankingError("Too Many Requests", {
        status: 429,
        code: "ASPSP_RATE_LIMIT_EXCEEDED",
      });
    }
    return this.application;
  }

  async listAspsps(params: { country?: string; psuType?: string } = {}): Promise<EbAspsp[]> {
    this.calls.push(`listAspsps:${params.country ?? "*"}:${params.psuType ?? "*"}`);
    return this.aspsps.filter((aspsp) => !params.country || aspsp.country === params.country);
  }

  async startAuthorization(body: {
    aspspName: string;
    aspspCountry: string;
    state: string;
    redirectUrl: string;
    psuType: string;
    validUntil: string;
  }): Promise<{ url: string; authorization_id: string; psu_id_hash: string }> {
    this.calls.push("startAuthorization");
    this.startAuthorizationBody = body as unknown as Record<string, unknown>;
    return {
      url: `https://auth.enablebanking.com/ais/start?sessionid=${body.state.slice(0, 8)}`,
      authorization_id: TEST_AUTHORIZATION_ID,
      psu_id_hash: "psu-hash",
    };
  }

  async createSession(code: string): Promise<EbAuthorizeSessionResponse> {
    this.calls.push(`createSession:${code}`);
    if (code === "rejected") {
      throw new EnableBankingError("Wrong authorization code provided", {
        status: 400,
        code: "WRONG_AUTHORIZATION_CODE",
      });
    }
    return {
      session_id: "497f6eca-6276-4993-bfeb-53cbbbba6f08",
      accounts: this.accounts,
      aspsp: {
        name: this.aspsps[0]?.name ?? "UniCredit",
        country: this.aspsps[0]?.country ?? "IT",
      },
      psu_type: "personal",
      access: { valid_until: "2026-12-01T12:00:00.000000+00:00" },
    };
  }

  async getSession(sessionId: string): Promise<EbSession> {
    this.calls.push(`getSession:${sessionId}`);
    if (this.failSessionStatusOnce) {
      this.failSessionStatusOnce = false;
      throw new EnableBankingError("Session is expired", {
        status: 401,
        code: "EXPIRED_SESSION",
      });
    }
    return {
      session_id: sessionId,
      status: this.sessionStatus,
      accounts: this.accounts.map((account) => account.uid as string),
      aspsp: { name: "UniCredit", country: "IT" },
      psu_type: "personal",
      access: { valid_until: "2026-12-01T12:00:00.000000+00:00" },
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.calls.push(`deleteSession:${sessionId}`);
    this.deletedSessions.push(sessionId);
  }

  async getAccount(accountUid: string): Promise<EbAccountResource> {
    this.calls.push(`getAccount:${accountUid}`);
    const account = this.accounts.find((candidate) => candidate.uid === accountUid);
    if (!account)
      throw new EnableBankingError("No account", { status: 404, code: "ACCOUNT_DOES_NOT_EXIST" });
    this.refuseWhenRateLimited(accountUid, "getAccount");
    return account;
  }

  async getBalances(accountUid: string): Promise<EbBalance[]> {
    this.calls.push(`getBalances:${accountUid}`);
    this.refuseWhenRateLimited(accountUid, "getBalances");
    return this.balances;
  }

  async getTransactions(
    accountUid: string,
    params: { dateFrom?: string; dateTo?: string } = {},
  ): Promise<Array<{ transactions: EbTransaction[]; continuationKey?: string }>> {
    this.calls.push(`getTransactions:${accountUid}:${params.dateFrom ?? "*"}`);
    this.refuseWhenRateLimited(accountUid, "getTransactions");
    return this.transactionPages.map((transactions, index) => ({
      transactions,
      ...(index < this.transactionPages.length - 1 ? { continuationKey: `page-${index + 1}` } : {}),
    }));
  }

  /** The ASPSP answer when the consent has spent the day's accesses. */
  private refuseWhenRateLimited(accountUid: string, call: RateLimitCall): void {
    if (this.rateLimitUid !== accountUid || this.rateLimitOn !== call) return;
    throw new EnableBankingError(
      "The access on the account has been exceeding the consented multiplicity per day",
      {
        status: 429,
        code: "ASPSP_RATE_LIMIT_EXCEEDED",
        ...(this.rateLimitRetryAfterMs === undefined
          ? {}
          : { retryAfterMs: this.rateLimitRetryAfterMs }),
      },
    );
  }
}

export interface BankingHarness {
  app: FastifyInstance;
  config: ServerConfig;
  client: { cookie: string; csrf: string };
  bank: FakeBank;
  close: () => Promise<void>;
}

export const TEST_NOW = "2026-09-11T08:00:00.000Z";

/**
 * Boots the real app with a fake Enable Banking client and a fixed clock, then
 * creates a vault and returns a logged-in session.
 */
export async function startBankingHarness(
  config: ServerConfig,
  bank = new FakeBank(),
  passphrase = "test passphrase",
  clock: Clock = fixedClock(TEST_NOW),
): Promise<BankingHarness> {
  const app = buildApp({
    config,
    banking: {
      clientFor: () => bank.asClient(),
      sleep: async () => undefined,
      clock,
    },
  });
  const response = await app.inject({
    method: "POST",
    url: "/api/vault/create",
    payload: { passphrase },
  });
  if (response.statusCode !== 201) {
    throw new Error(`vault create failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json<{ csrfToken: string }>();
  return {
    app,
    config,
    bank,
    client: {
      cookie: (response.headers["set-cookie"] as string).split(";")[0] ?? "",
      csrf: body.csrfToken,
    },
    close: async () => {
      await app.close();
      cleanup(config.vaultDir);
    },
  };
}

/** Connects the fake app and returns the created link id. */
export async function connectBank(
  harness: BankingHarness,
  options: { aspspName?: string; aspspCountry?: string; autoSync?: boolean } = {},
): Promise<{ linkId: string; state: string; url: string }> {
  const saved = await put(harness, "/api/banking/enable-banking/config", {
    appId: TEST_APP_ID,
    privateKeyPem: testPrivateKeyPem(),
    redirectUrl: TEST_REDIRECT_URL,
    environment: "SANDBOX",
    psuType: "personal",
    country: "IT",
    autoSync: options.autoSync ?? true,
  });
  if (saved.statusCode !== 200) throw new Error(`config failed: ${saved.body}`);
  const started = await post(harness, "/api/banking/enable-banking/authorize", {
    aspspName: options.aspspName ?? "UniCredit",
    aspspCountry: options.aspspCountry ?? "IT",
    psuType: "personal",
  });
  if (started.statusCode !== 200) throw new Error(`authorize failed: ${started.body}`);
  const body = started.json<{ linkId: string; state: string; url: string }>();
  const completed = await post(harness, "/api/banking/enable-banking/callback", {
    code: "sandbox-code",
    state: body.state,
  });
  if (completed.statusCode !== 200) throw new Error(`callback failed: ${completed.body}`);
  return { linkId: body.linkId, state: body.state, url: body.url };
}

export async function post(
  harness: BankingHarness,
  url: string,
  payload: unknown,
): Promise<{ statusCode: number; body: string; json: <T>() => T }> {
  const response = await harness.app.inject({
    method: "POST",
    url,
    payload: payload as Record<string, unknown>,
    headers: { cookie: harness.client.cookie, "x-flowly-csrf": harness.client.csrf },
  });
  return {
    statusCode: response.statusCode,
    body: response.body,
    json: <T>() => response.json<T>(),
  };
}

export async function put(
  harness: BankingHarness,
  url: string,
  payload: unknown,
): Promise<{ statusCode: number; body: string; json: <T>() => T }> {
  const response = await harness.app.inject({
    method: "PUT",
    url,
    payload: payload as Record<string, unknown>,
    headers: { cookie: harness.client.cookie, "x-flowly-csrf": harness.client.csrf },
  });
  return {
    statusCode: response.statusCode,
    body: response.body,
    json: <T>() => response.json<T>(),
  };
}

export async function get(
  harness: BankingHarness,
  url: string,
): Promise<{ statusCode: number; body: string; json: <T>() => T }> {
  const response = await harness.app.inject({
    method: "GET",
    url,
    headers: { cookie: harness.client.cookie },
  });
  return {
    statusCode: response.statusCode,
    body: response.body,
    json: <T>() => response.json<T>(),
  };
}
