import { afterEach, describe, expect, it, vi } from "vitest";
import type { Transaction } from "@flowly/web-contracts";
import { api, type ApiError } from "./client.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("API contract validation", () => {
  it("accepts a valid vault status response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          state: "locked",
          vaultExists: false,
          vaultId: null,
          vaultFormatVersion: 1,
          exportFormatVersion: 1,
          storageEngine: "sqlcipher",
          schemaVersion: null,
          lastUnlockedAt: null,
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await expect(api.status()).resolves.toMatchObject({ state: "locked" });
  });

  it("rejects a malformed banking response before it reaches the UI", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ provider: "enable-banking", configured: "yes" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(api.bankingStatus()).rejects.toMatchObject({
      name: "ApiError",
      code: "contract_violation",
    } satisfies Partial<ApiError>);
  });

  it("rejects a malformed entity inside a collection", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            {
              formatVersion: 1,
              revision: 1,
              id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f70",
              accountId: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f",
              bookingDate: "2026-09-03",
              amountMinor: -1230,
              currency: "EUR",
              status: "booked",
              source: "manual",
              tagIds: [],
              createdAt: "2026-09-03T08:00:00.000Z",
            },
          ],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    await expect(api.list<Transaction>("transactions")).rejects.toMatchObject({
      code: "contract_violation",
      message: expect.stringContaining("/items/0"),
    } satisfies Partial<ApiError>);
  });

  it("rejects a session whose vault payload is malformed", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ csrfToken: "csrf", vault: { state: "open" } }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(api.session()).rejects.toMatchObject({
      code: "contract_violation",
    } satisfies Partial<ApiError>);
  });
});
