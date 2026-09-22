import { describe, expect, it } from "vitest";
import {
  SAMPLE_ACCOUNT,
  SAMPLE_TAG,
  call,
  makeConfig,
  sampleTransaction,
  startHarness,
} from "./helpers/api.js";

async function seed(harness: Awaited<ReturnType<typeof startHarness>>) {
  await call(harness.app, harness.client, {
    method: "POST",
    url: "/api/accounts",
    payload: { entity: SAMPLE_ACCOUNT },
  });
  await call(harness.app, harness.client, {
    method: "POST",
    url: "/api/tags",
    payload: { entity: SAMPLE_TAG },
  });
  await call(harness.app, harness.client, {
    method: "POST",
    url: "/api/transactions",
    payload: {
      entity: sampleTransaction({
        userNote: "espresso with Luca",
        bookingDate: "2026-09-10",
        tagIds: [SAMPLE_TAG.id],
      }),
    },
  });
}

describe("dashboard API", () => {
  it("scopes the response to the selected months and tags", async () => {
    const { config } = makeConfig();
    const harness = await startHarness(config);
    try {
      await seed(harness);
      // The selected month defines the window: October is never pulled in.
      const months = await call(harness.app, harness.client, {
        method: "GET",
        url: "/api/dashboard?months=2026-09",
      });
      expect(months.statusCode).toBe(200);
      expect(months.json<{ range: unknown; cashFlowBuckets: unknown[] }>()).toMatchObject({
        range: { from: "2026-09-01", to: "2026-09-30" },
        cashFlowBuckets: [expect.objectContaining({ label: "Sep 2026" })],
      });

      // A tag filter that matches nothing empties the flows but keeps the
      // categories, so the reader can switch the tag back on.
      const other = await call(harness.app, harness.client, {
        method: "GET",
        url: `/api/dashboard?months=2026-09&tags=${SAMPLE_TAG.id}`,
      });
      expect(other.json<{ cashFlow: unknown[] }>().cashFlow).toHaveLength(1);
      expect(other.json<{ spendingByTag: unknown[] }>().spendingByTag).toHaveLength(1);

      const malformed = await call(harness.app, harness.client, {
        method: "GET",
        url: "/api/dashboard?months=2026-13",
      });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json<{ error: string }>().error).toBe("invalid_date_range");
    } finally {
      await harness.close();
    }
  });

  it("returns balances, cash flow and spending for a range", async () => {
    const { config } = makeConfig();
    const harness = await startHarness(config);
    try {
      await seed(harness);
      const response = await call(harness.app, harness.client, {
        method: "GET",
        url: "/api/dashboard?from=2026-09-01&to=2026-09-30&reference=2026-09-30",
      });
      expect(response.statusCode).toBe(200);
      const dashboard = response.json<{
        range: { from: string; to: string };
        balances: Array<{ currency: string; balanceMinor: number }>;
        cashFlow: Array<{ currency: string; expensesMinor: number }>;
        spendingByTag: Array<{ tagName: string; spentMinor: number }>;
      }>();
      expect(dashboard.range).toEqual({ from: "2026-09-01", to: "2026-09-30" });
      expect(dashboard.balances[0]).toMatchObject({ currency: "EUR", balanceMinor: -1230 });
      expect(dashboard.cashFlow[0]).toMatchObject({ currency: "EUR", expensesMinor: 1230 });
      expect(dashboard.spendingByTag[0]).toMatchObject({ tagName: "Coffee", spentMinor: 1230 });
    } finally {
      await harness.close();
    }
  });

  it("defaults the range and rejects an invalid one", async () => {
    const { config } = makeConfig();
    const harness = await startHarness(config);
    try {
      const defaults = await call(harness.app, harness.client, {
        method: "GET",
        url: "/api/dashboard",
      });
      expect(defaults.statusCode).toBe(200);
      const range = defaults.json<{ range: { from: string; to: string } }>().range;
      expect(range.from).toMatch(/^\d{4}-\d{2}-01$/);
      expect(range.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const invalid = await call(harness.app, harness.client, {
        method: "GET",
        url: "/api/dashboard?from=2026-09-30&to=2026-09-01",
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json<{ error: string }>().error).toBe("invalid_date_range");

      const malformed = await call(harness.app, harness.client, {
        method: "GET",
        url: "/api/dashboard?from=2026-02-30&to=2026-03-01",
      });
      expect(malformed.statusCode).toBe(400);
    } finally {
      await harness.close();
    }
  });
});

describe("transaction search API", () => {
  it("filters through query parameters and reports the total", async () => {
    const { config } = makeConfig();
    const harness = await startHarness(config);
    try {
      await seed(harness);
      const all = await call(harness.app, harness.client, {
        method: "GET",
        url: "/api/transactions",
      });
      expect(all.json<{ total: number; items: unknown[] }>().total).toBe(1);

      const byText = await call(harness.app, harness.client, {
        method: "GET",
        url: "/api/transactions?q=ESPRESSO",
      });
      expect(byText.json<{ total: number }>().total).toBe(1);

      const byTag = await call(harness.app, harness.client, {
        method: "GET",
        url: `/api/transactions?tags=${SAMPLE_TAG.id}`,
      });
      expect(byTag.json<{ total: number }>().total).toBe(1);

      const noMatch = await call(harness.app, harness.client, {
        method: "GET",
        url: "/api/transactions?q=supermarket&accountId=018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e70",
      });
      expect(noMatch.json<{ total: number }>().total).toBe(0);
    } finally {
      await harness.close();
    }
  });
});
