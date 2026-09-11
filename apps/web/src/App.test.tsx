import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { ApiError } from "./api/client.js";
import { describeError } from "./hooks/use-workspace.js";

const lockedStatus = {
  state: "locked",
  vaultExists: true,
  vaultId: "018f2c1e-6d5b-7c3a-9f2e-7c4d5e6f7081",
  vaultFormatVersion: 1,
  exportFormatVersion: 1,
  storageEngine: "sqlcipher",
  schemaVersion: null,
  lastUnlockedAt: null,
};

const unlockedStatus = { ...lockedStatus, state: "unlocked", schemaVersion: 3 };
const freshStatus = { ...lockedStatus, vaultExists: false };

const dashboard = {
  range: { from: "2026-09-01", to: "2026-09-30" },
  generatedAt: "2026-09-30T18:00:00.000Z",
  balances: [
    {
      accountId: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f",
      accountName: "Everyday",
      currency: "EUR",
      balanceMinor: 149500,
      isDefaultCurrency: true,
      transactionCount: 4,
    },
  ],
  cashFlow: [
    {
      currency: "EUR",
      incomeMinor: 250000,
      expensesMinor: 103000,
      netMinor: 147000,
      transactionCount: 5,
    },
  ],
  cashFlowBuckets: [
    {
      currency: "EUR",
      label: "Week 1",
      from: "2026-09-01",
      to: "2026-09-07",
      incomeMinor: 250000,
      expensesMinor: 1230,
    },
    {
      currency: "EUR",
      label: "Week 2",
      from: "2026-09-08",
      to: "2026-09-14",
      incomeMinor: 0,
      expensesMinor: 4000,
    },
  ],
  spendingByTag: [
    {
      tagId: "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7082",
      tagName: "Rent",
      currency: "EUR",
      spentMinor: 95000,
      transactionCount: 1,
    },
  ],
};

interface RouteMap {
  [path: string]: (init?: RequestInit) => Response;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function mockFetch(routes: RouteMap) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(raw, "http://localhost").pathname;
      const handler = routes[path];
      if (!handler) return json({ error: "not_found" }, 404);
      return handler(init);
    }),
  );
}

function unlockedRoutes(): RouteMap {
  return {
    "/api/vault/status": () => json(lockedStatus),
    "/api/vault/unlock": () =>
      json({ csrfToken: "csrf-token", vault: unlockedStatus }, 200, {
        "set-cookie": "flowly_sid=abc",
      }),
    "/api/dashboard": () => json(dashboard),
    "/api/accounts": () => json({ items: [] }),
    "/api/transactions": () => json({ items: [], total: 0, limit: 100, offset: 0 }),
    "/api/tags": () => json({ items: [] }),
    "/api/tagging-rules": () => json({ items: [] }),
  };
}

async function unlock(app = <App />) {
  render(app);
  await waitFor(() => expect(screen.getByLabelText("Passphrase")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Passphrase"), {
    target: { value: "correct horse battery staple" },
  });
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Unlock vault" }) as HTMLButtonElement).disabled,
    ).toBe(false),
  );
  screen.getByRole("button", { name: "Unlock vault" }).click();
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Flowly web client", () => {
  it("renders the locked vault screen from the server status", async () => {
    mockFetch({ "/api/vault/status": () => json(lockedStatus) });
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Vault locked"),
    );
    expect(screen.getByLabelText("Passphrase")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Unlock vault" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByText("sqlcipher")).toBeTruthy();
  });

  it("offers to create the vault on a fresh deployment", async () => {
    mockFetch({ "/api/vault/status": () => json(freshStatus) });
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Create your vault"),
    );
    expect(screen.getByRole("button", { name: "Create vault" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Unlock vault" })).toBeNull();
  });

  it("explains when the server cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("connection refused"),
    );
  });

  it("unlocks into the vault shell with every implemented section", async () => {
    mockFetch(unlockedRoutes());
    await unlock();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Financial overview" })).toBeTruthy(),
    );
    for (const section of ["Dashboard", "Accounts", "Transactions", "Tags", "Rules", "Settings"]) {
      expect(screen.getByRole("button", { name: section })).toBeTruthy();
    }
    await waitFor(() => expect(screen.getAllByText("Rent").length).toBeGreaterThan(0));
    expect(screen.getByRole("img", { name: /Income and expenses per week/ })).toBeTruthy();
  });

  it("keeps the passphrase change and portability controls inside Settings", async () => {
    mockFetch(unlockedRoutes());
    await unlock();

    await waitFor(() => expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy());
    screen.getByRole("button", { name: "Settings" }).click();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy());
    expect(screen.getByLabelText("Current passphrase")).toBeTruthy();
    expect(screen.getByLabelText("New passphrase")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export transactions CSV" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export complete archive" })).toBeTruthy();
  });

  it("surfaces a revision conflict in plain language", () => {
    expect(describeError(new ApiError(409, "revision_conflict", "conflict"))).toBe(
      "Someone else changed this record. Reload and try again.",
    );
    expect(describeError(new ApiError(401, "invalid_passphrase", "nope"))).toBe(
      "That passphrase did not unlock the vault.",
    );
    expect(describeError(new ApiError(429, "too_many_attempts", "slow down"))).toContain(
      "Too many unlock attempts",
    );
  });
});
