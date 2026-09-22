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
    // The lock screen states the vault state, not the storage engine.
    expect(screen.getByText("locked")).toBeTruthy();
    expect(screen.queryByText("sqlcipher")).toBeNull();
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
    // The shell states the vault state, not its storage engine or schema.
    for (const label of ["Storage engine", "Vault format", "Export format"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    await waitFor(() => expect(screen.getAllByText("Rent").length).toBeGreaterThan(0));
    expect(screen.getByRole("img", { name: /Income and expenses per week/ })).toBeTruthy();
    // The legend carries the tag filter, so the dashboard can be narrowed.
    expect(screen.getByRole("checkbox", { name: "Include Rent" })).toBeTruthy();
  });

  it("draws one donut per currency, never adding unlike ones", async () => {
    const twoTags = {
      ...dashboard,
      spendingByTag: [
        {
          tagId: "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7082",
          tagName: "Rent",
          currency: "EUR",
          spentMinor: 75000,
          transactionCount: 1,
        },
        {
          tagId: "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7083",
          tagName: "Groceries",
          currency: "EUR",
          spentMinor: 25000,
          transactionCount: 3,
        },
        {
          tagId: "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7084",
          tagName: "Travel",
          currency: "USD",
          spentMinor: 10000,
          transactionCount: 1,
        },
      ],
    };
    mockFetch({ ...unlockedRoutes(), "/api/dashboard": () => json(twoTags) });
    await unlock();

    // One donut per currency, never a total that adds unlike currencies.
    await waitFor(() =>
      expect(
        screen.getByRole("img", { name: "Spending by tag in EUR: Rent 75%, Groceries 25%" }),
      ).toBeTruthy(),
    );
    expect(screen.getByRole("img", { name: "Spending by tag in USD: Travel 100%" })).toBeTruthy();
    expect(screen.getByText("75,0%")).toBeTruthy();
    expect(screen.getByText("25,0%")).toBeTruthy();
    for (const tag of ["Rent", "Groceries", "Travel"]) {
      expect(screen.getByRole("checkbox", { name: `Include ${tag}` })).toBeTruthy();
    }
    expect(
      screen.getByText("3 of 3 tags included · untick a category to leave it out of every figure"),
    ).toBeTruthy();
  });

  it("resumes an open vault from its session cookie instead of asking again", async () => {
    mockFetch({
      "/api/vault/status": () => json(unlockedStatus),
      "/api/session": () => json({ csrfToken: "csrf-token", vault: unlockedStatus }),
      "/api/dashboard": () => json(dashboard),
      "/api/accounts": () => json({ items: [] }),
      "/api/transactions": () => json({ items: [], total: 0, limit: 100, offset: 0 }),
      "/api/tags": () => json({ items: [] }),
      "/api/tagging-rules": () => json({ items: [] }),
    });
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Financial overview" })).toBeTruthy(),
    );
    expect(screen.queryByLabelText("Passphrase")).toBeNull();
  });

  it("names where a dashboard row came from instead of its provider row id", async () => {
    const imported = {
      formatVersion: 1,
      revision: 1,
      id: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f",
      accountId: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f",
      bookingDate: "2026-09-16",
      amountMinor: -186,
      currency: "EUR",
      status: "pending",
      source: "enable-banking",
      payee: "Deepseerwea",
      description: "Deepseerwea",
      providerTransactionId: "00000000-1111-4222-8333-444444444444",
      tagIds: [],
      userNote: null,
    };
    mockFetch({
      ...unlockedRoutes(),
      "/api/transactions": () => json({ items: [imported], total: 1, limit: 100, offset: 0 }),
    });
    await unlock();

    await waitFor(() => expect(screen.getByText("Deepseerwea")).toBeTruthy());
    // The row says where it came from; the provider's own id stays in Raw.
    expect(screen.getByText("enable-banking")).toBeTruthy();
    expect(screen.queryByText(/00000000-1111/)).toBeNull();
  });

  it("asks for the passphrase again only when the session cookie is gone", async () => {
    mockFetch({
      "/api/vault/status": () => json(unlockedStatus),
      "/api/session": () => json({ error: "session_required" }, 401),
    });
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("Passphrase")).toBeTruthy());
    expect(screen.getByText(/session expired/i)).toBeTruthy();
  });

  it("keeps the passphrase change and portability controls inside Settings", async () => {
    mockFetch(unlockedRoutes());
    await unlock();

    await waitFor(() => expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy());
    screen.getByRole("button", { name: "Settings" }).click();

    await waitFor(() => expect(screen.getByRole("heading", { name: /Settings/ })).toBeTruthy());
    expect(screen.getByLabelText("Current passphrase")).toBeTruthy();
    expect(screen.getByLabelText("New passphrase")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export transactions CSV" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export complete archive" })).toBeTruthy();
    // Imports use the styled file field, not the browser's native control.
    expect(screen.getByLabelText("Transaction CSV")).toBeTruthy();
    expect(screen.getByLabelText("Complete archive (.flowly)")).toBeTruthy();
  });

  it("previews a tag colour before it is saved", async () => {
    mockFetch(unlockedRoutes());
    await unlock();

    await waitFor(() => expect(screen.getByRole("button", { name: "Tags" })).toBeTruthy());
    screen.getByRole("button", { name: "Tags" }).click();

    await waitFor(() => expect(screen.getByLabelText("Custom colour")).toBeTruthy());
    expect(screen.getByText("Tag preview")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Groceries" } });
    await waitFor(() => expect(screen.getByText("Groceries")).toBeTruthy());
  });

  it("takes the dashboard's Export data shortcut to the export section", async () => {
    mockFetch(unlockedRoutes());
    await unlock();

    // Export lives in Settings; the dashboard hero is the only shortcut to it.
    await waitFor(() => expect(screen.getByRole("button", { name: "Export data" })).toBeTruthy());
    screen.getByRole("button", { name: "Export data" }).click();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Export transactions CSV" })).toBeTruthy(),
    );
    expect(document.activeElement?.id).toBe("settings-export");
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
