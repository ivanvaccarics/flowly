import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from "fastify";
import { buildApp } from "../../src/api/app.js";
import { loadConfig, type ServerConfig } from "../../src/config.js";
import { cleanup, tempDir } from "./test-utils.js";

export interface ApiClient {
  cookie: string;
  csrf: string;
}

export interface ApiHarness {
  config: ServerConfig;
  app: FastifyInstance;
  client: ApiClient;
  close: () => Promise<void>;
}

export function makeConfig(overrides: Partial<ServerConfig> = {}): {
  config: ServerConfig;
  dir: string;
} {
  const dir = tempDir("flowly-api3-");
  const base = loadConfig({
    NODE_ENV: "test",
    FLOWLY_HOST: "127.0.0.1",
    FLOWLY_PORT: "8787",
    FLOWLY_VAULT_DIR: dir,
    FLOWLY_STORAGE_ENGINE: "sqlcipher",
    FLOWLY_LOG_LEVEL: "silent",
  });
  return { config: { ...base, ...overrides }, dir };
}

export async function startHarness(
  config: ServerConfig,
  passphrase = "test passphrase",
): Promise<ApiHarness> {
  const app = buildApp({ config });
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
    config,
    app,
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

export function call(
  app: FastifyInstance,
  client: ApiClient | undefined,
  options: {
    method: "GET" | "POST" | "PUT" | "DELETE";
    url: string;
    payload?: unknown;
    csrf?: boolean;
  },
): Promise<LightMyRequestResponse> {
  const headers: Record<string, string> = {};
  if (client) headers["cookie"] = client.cookie;
  if (client && options.csrf !== false && options.method !== "GET") {
    headers["x-flowly-csrf"] = client.csrf;
  }
  const request: InjectOptions = { method: options.method, url: options.url, headers };
  if (options.payload !== undefined) {
    request.payload = options.payload as NonNullable<InjectOptions["payload"]>;
  }
  return app.inject(request);
}

export const SAMPLE_ACCOUNT = {
  formatVersion: 1,
  revision: 1,
  id: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f",
  name: "Everyday",
  type: "checking",
  defaultCurrency: "EUR",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
};

export const SAMPLE_TAG = {
  formatVersion: 1,
  revision: 1,
  id: "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7081",
  name: "Coffee",
  normalizedName: "coffee",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
};

export function sampleTransaction(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    formatVersion: 1,
    revision: 1,
    id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f70",
    accountId: SAMPLE_ACCOUNT.id,
    bookingDate: "2026-09-03",
    amountMinor: -1230,
    currency: "EUR",
    status: "booked",
    source: "manual",
    tagIds: [],
    createdAt: "2026-09-03T08:00:00.000Z",
    updatedAt: "2026-09-03T08:00:00.000Z",
    ...overrides,
  };
}

export function sampleRule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formatVersion: 2,
    revision: 1,
    id: "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7081",
    name: "Coffee",
    enabled: true,
    combinator: "and",
    conditions: [{ field: "userNote", operator: "contains", value: "espresso" }],
    tagIds: [SAMPLE_TAG.id],
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}
