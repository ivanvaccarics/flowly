import { afterEach, describe, expect, it, vi } from "vitest";
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
});
