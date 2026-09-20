import { describe, expect, it } from "vitest";
import { EnableBankingClient } from "../src/banking/enable-banking-client.js";
import { TEST_APP_ID, testPrivateKeyPem } from "./helpers/banking.js";

/**
 * The connector has to treat the bank's own daily cap differently from a
 * transient throttling: waiting cannot refill an exhausted consent, and every
 * attempt spends the access the user still has.
 */
function client(fetchImpl: typeof globalThis.fetch): EnableBankingClient {
  return new EnableBankingClient({
    appId: TEST_APP_ID,
    privateKeyPem: testPrivateKeyPem(),
    baseUrl: "https://api.enablebanking.test",
    fetch: fetchImpl,
    sleep: async () => undefined,
  });
}

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("Enable Banking client retries", () => {
  it("does not retry the bank's daily access cap and keeps Retry-After", async () => {
    let calls = 0;
    const fetchImpl: typeof globalThis.fetch = async () => {
      calls += 1;
      return jsonResponse(
        {
          error: "ASPSP_RATE_LIMIT_EXCEEDED",
          message:
            "The access on the account has been exceeding the consented multiplicity per day",
        },
        429,
        { "retry-after": "3600" },
      );
    };

    await expect(client(fetchImpl).getTransactions("account-uid")).rejects.toMatchObject({
      code: "ASPSP_RATE_LIMIT_EXCEEDED",
      retryAfterMs: 3_600_000,
    });
    expect(calls).toBe(1);
  });

  it("still retries a temporary 429 with bounded backoff", async () => {
    let calls = 0;
    const fetchImpl: typeof globalThis.fetch = async () => {
      calls += 1;
      if (calls < 3) {
        return jsonResponse({ error: "RATE_LIMIT_EXCEEDED", message: "Too many requests" }, 429);
      }
      return jsonResponse({ balances: [] }, 200);
    };

    await expect(client(fetchImpl).getBalances("account-uid")).resolves.toEqual([]);
    expect(calls).toBe(3);
  });
});
