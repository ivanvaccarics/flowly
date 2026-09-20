import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "./DashboardView.js";

const emptyDashboard = {
  range: { from: "2026-09-01", to: "2026-09-30" },
  generatedAt: "2026-09-30T18:00:00.000Z",
  balances: [],
  cashFlow: [],
  cashFlowBuckets: [],
  spendingByTag: [],
};

const RENT_TAG = "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7081";
const GROCERIES_TAG = "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7082";

/** A period with two weeks and two tags, so both charts have something to say. */
const chartedDashboard = {
  ...emptyDashboard,
  cashFlow: [
    {
      currency: "EUR",
      incomeMinor: 300000,
      expensesMinor: 120000,
      netMinor: 180000,
      transactionCount: 6,
    },
  ],
  cashFlowBuckets: [
    {
      currency: "EUR",
      label: "Week 1",
      from: "2026-09-01",
      to: "2026-09-07",
      incomeMinor: 200000,
      expensesMinor: 50000,
    },
    {
      currency: "EUR",
      label: "Week 2",
      from: "2026-09-08",
      to: "2026-09-14",
      incomeMinor: 100000,
      expensesMinor: 70000,
    },
  ],
  spendingByTag: [
    {
      tagId: RENT_TAG,
      tagName: "Rent",
      currency: "EUR",
      spentMinor: 75000,
      transactionCount: 1,
    },
    {
      tagId: GROCERIES_TAG,
      tagName: "Groceries",
      currency: "EUR",
      spentMinor: 25000,
      transactionCount: 3,
    },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function row(index: number) {
  return {
    formatVersion: 1,
    revision: 1,
    id: `018f2c1e-6d5b-7c3a-9f2e-6b3c4d5e6f${String(index).padStart(2, "0")}`,
    accountId: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f",
    bookingDate: "2026-09-03",
    amountMinor: -1230,
    currency: "EUR",
    payee: `Payee ${index}`,
    status: "booked",
    source: "manual",
    tagIds: [],
    createdAt: "2026-09-03T08:00:00.000Z",
    updatedAt: "2026-09-03T08:00:00.000Z",
  };
}

/** A vault with `total` transactions, serving the window the view asks for. */
function mockVault(
  total: number,
  dashboard: unknown = emptyDashboard,
): Array<{ offset: number; limit: number }> {
  const windows: Array<{ offset: number; limit: number }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        "http://localhost",
      );
      const path = url.pathname;
      if (path === "/api/transactions") {
        const limit = Number(url.searchParams.get("limit"));
        const offset = Number(url.searchParams.get("offset"));
        windows.push({ offset, limit });
        const length = Math.max(0, Math.min(limit, total - offset));
        return json({
          items: Array.from({ length }, (_, position) => row(offset + position + 1)),
          total,
          limit,
          offset,
        });
      }
      if (path === "/api/dashboard") return json(dashboard);
      if (path === "/api/accounts" || path === "/api/tags") return json({ items: [] });
      if (path === "/api/banking/status") {
        return json({ provider: "enable-banking", configured: false, links: [], sync: {} });
      }
      return json({ error: "not_found" }, 404);
    }),
  );
  return windows;
}

function renderDashboard(options: { onSeeAllTransactions?: (seed?: unknown) => void } = {}) {
  return render(
    <DashboardView
      csrf="csrf"
      onNewTransaction={() => undefined}
      onSeeAllTransactions={options.onSeeAllTransactions ?? (() => undefined)}
      onExportData={() => undefined}
      onOpenSettings={() => undefined}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("dashboard recent transactions", () => {
  it("pages the ledger ten rows at a time", async () => {
    const windows = mockVault(42);
    renderDashboard();

    await waitFor(() => expect(screen.getByText("Showing 1–10 of 42 transactions")).toBeTruthy());
    expect(windows[0]).toEqual({ offset: 0, limit: 10 });
    expect(screen.getByText("42 records")).toBeTruthy();
    expect(screen.getByText("Payee 1")).toBeTruthy();
    expect(screen.getByText("Payee 10")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("Showing 11–20 of 42 transactions")).toBeTruthy());
    expect(windows.at(-1)).toEqual({ offset: 10, limit: 10 });
    expect(screen.getByText("Payee 11")).toBeTruthy();
    expect(screen.queryByText("Payee 1")).toBeNull();
    expect((screen.getByRole("button", { name: "Previous" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("keeps the pager out of the way when everything fits", async () => {
    mockVault(4);
    renderDashboard();

    await waitFor(() => expect(screen.getByText("4 records")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("does not repeat the vault status the shell already shows", async () => {
    mockVault(2);
    renderDashboard();

    await waitFor(() => expect(screen.getByText("Recent transactions")).toBeTruthy());
    expect(screen.queryByText("Local vault status")).toBeNull();
    expect(screen.queryByText("Vault id")).toBeNull();
  });
});

describe("dashboard charts", () => {
  it("reads a week out of the cash-flow chart, and walks it with the arrows", async () => {
    mockVault(2, chartedDashboard);
    renderDashboard();

    const firstWeek = await screen.findByRole("button", {
      name: /^Week 1 \(2026-09-01 to 2026-09-07\)/,
    });
    // Each point is one named stop, so the figures are readable without a mouse.
    expect(firstWeek.getAttribute("aria-label")).toBe(
      "Week 1 (2026-09-01 to 2026-09-07): income 2.000,00 EUR, expenses 500,00 EUR, net 1.500,00 EUR",
    );

    fireEvent.focus(firstWeek);
    expect(screen.getByText("Week 1 · 2026-09-01 → 2026-09-07")).toBeTruthy();
    expect(screen.getByText("1.500,00 EUR")).toBeTruthy();

    // Arrow keys move the readout instead of adding a tab stop per week.
    fireEvent.keyDown(firstWeek, { key: "ArrowRight" });
    expect(screen.getByText("Week 2 · 2026-09-08 → 2026-09-14")).toBeTruthy();
    expect(screen.getByText("300,00 EUR")).toBeTruthy();
  });

  it("opens the ledger on the week or the tag that was clicked", async () => {
    const onSeeAll = vi.fn();
    mockVault(2, chartedDashboard);
    renderDashboard({ onSeeAllTransactions: onSeeAll });

    fireEvent.click(
      await screen.findByRole("button", { name: /^Week 1 \(2026-09-01 to 2026-09-07\)/ }),
    );
    expect(onSeeAll).toHaveBeenCalledWith({ from: "2026-09-01", to: "2026-09-07" });

    fireEvent.click(screen.getByRole("button", { name: /Rent/ }));
    expect(onSeeAll).toHaveBeenCalledWith({
      tagId: RENT_TAG,
      from: expect.any(String),
      to: expect.any(String),
    });
  });

  it("shows the hovered tag in the middle of the donut", async () => {
    mockVault(2, chartedDashboard);
    renderDashboard();

    await waitFor(() => expect(screen.getByText("Spending breakdown")).toBeTruthy());
    // The hole shows the period total until a slice is pointed at.
    expect(screen.getByText("1.000,00")).toBeTruthy();

    fireEvent.focus(screen.getByRole("button", { name: /Groceries/ }));
    // The hole now reads the tag: its share, its amount and its currency.
    const centre = screen.getByText("EUR · 25,0% of spending").parentElement!;
    expect(within(centre).getByText("Groceries")).toBeTruthy();
    expect(within(centre).getByText("250,00")).toBeTruthy();
  });
});
