import { describe, expect, it } from "vitest";
import {
  SAMPLE_ACCOUNT,
  SAMPLE_TAG,
  call,
  makeConfig,
  sampleTransaction,
  startHarness,
} from "./helpers/api.js";

const BUDGET_ID = "018f2c1e-6d5b-7c3a-9f2e-5c4d5e6f7081";

function sampleBudget(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formatVersion: 1,
    revision: 1,
    id: BUDGET_ID,
    name: "Groceries",
    amountMinor: 10000,
    currency: "EUR",
    period: "monthly",
    startDate: "2026-01-01",
    tagIds: [SAMPLE_TAG.id],
    rollover: false,
    active: true,
    createdAt: "2026-01-01T08:00:00.000Z",
    updatedAt: "2026-01-01T08:00:00.000Z",
    ...overrides,
  };
}

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
  it("returns balances, cash flow, spending and budgets for a range", async () => {
    const { config } = makeConfig();
    const harness = await startHarness(config);
    try {
      await seed(harness);
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/budgets",
        payload: { entity: sampleBudget() },
      });

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
        budgets: Array<{ name: string; spentMinor: number; status: string }>;
      }>();
      expect(dashboard.range).toEqual({ from: "2026-09-01", to: "2026-09-30" });
      expect(dashboard.balances[0]).toMatchObject({ currency: "EUR", balanceMinor: -1230 });
      expect(dashboard.cashFlow[0]).toMatchObject({ currency: "EUR", expensesMinor: 1230 });
      expect(dashboard.spendingByTag[0]).toMatchObject({ tagName: "Coffee", spentMinor: 1230 });
      expect(dashboard.budgets[0]).toMatchObject({ name: "Groceries", spentMinor: 1230 });
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

describe("budget API", () => {
  it("creates budgets and reports their consumption", async () => {
    const { config } = makeConfig();
    const harness = await startHarness(config);
    try {
      await seed(harness);
      const created = await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/budgets",
        payload: { entity: sampleBudget() },
      });
      expect(created.statusCode).toBe(201);

      const consumption = await call(harness.app, harness.client, {
        method: "GET",
        url: "/api/budgets/consumption?reference=2026-09-15",
      });
      expect(consumption.statusCode).toBe(200);
      const items = consumption.json<{
        items: Array<{ name: string; spentMinor: number; limitMinor: number; status: string }>;
      }>().items;
      expect(items[0]).toMatchObject({
        name: "Groceries",
        spentMinor: 1230,
        limitMinor: 10000,
        status: "on-track",
      });

      const invalid = await call(harness.app, harness.client, {
        method: "GET",
        url: "/api/budgets/consumption?reference=2026-02-30",
      });
      expect(invalid.statusCode).toBe(400);

      const updated = await call(harness.app, harness.client, {
        method: "PUT",
        url: `/api/budgets/${BUDGET_ID}`,
        payload: { entity: { ...sampleBudget(), revision: 1, amountMinor: 1300 } },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json<{ entity: { revision: number } }>().entity.revision).toBe(2);

      const afterUpdate = await call(harness.app, harness.client, {
        method: "GET",
        url: "/api/budgets/consumption?reference=2026-09-15",
      });
      expect(afterUpdate.json<{ items: Array<{ status: string }> }>().items[0]?.status).toBe(
        "warning",
      );
    } finally {
      await harness.close();
    }
  });
});
