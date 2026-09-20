import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
function mockVault(total: number): Array<{ offset: number; limit: number }> {
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
      if (path === "/api/dashboard") return json(emptyDashboard);
      if (path === "/api/accounts" || path === "/api/tags") return json({ items: [] });
      if (path === "/api/banking/status") {
        return json({ provider: "enable-banking", configured: false, links: [], sync: {} });
      }
      return json({ error: "not_found" }, 404);
    }),
  );
  return windows;
}

function renderDashboard() {
  return render(
    <DashboardView
      csrf="csrf"
      onNewTransaction={() => undefined}
      onSeeAllTransactions={() => undefined}
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
