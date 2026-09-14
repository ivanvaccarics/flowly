import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView.js";
import { BankCallbackView } from "./BankCallbackView.js";
import { DashboardView } from "./DashboardView.js";

const unlockedStatus = {
  state: "unlocked" as const,
  vaultExists: true,
  vaultId: "018f2c1e-6d5b-7c3a-9f2e-7c4d5e6f7081",
  vaultFormatVersion: 1,
  exportFormatVersion: 1,
  storageEngine: "sqlcipher" as const,
  schemaVersion: 5,
  lastUnlockedAt: "2026-09-01T08:00:00.000Z",
};

const emptyDashboard = {
  range: { from: "2026-09-01", to: "2026-09-30" },
  generatedAt: "2026-09-30T18:00:00.000Z",
  balances: [],
  cashFlow: [],
  cashFlowBuckets: [],
  spendingByTag: [],
};

const CONNECTION = {
  id: "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f",
  provider: "enable-banking" as const,
  appId: "11111111-1111-4111-8111-111111111111",
  redirectUrl: "https://flowly.test/enablebanking/auth_callback",
  environment: "SANDBOX" as const,
  psuType: "personal" as const,
  country: "IT",
  autoSync: true,
  appName: "mytest-app",
  keyFingerprint: "abcdef0123456789abcdef0123456789",
  createdAt: "2026-09-11T08:00:00.000Z",
  updatedAt: "2026-09-11T08:00:00.000Z",
};

const LINK = {
  id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f70",
  aspspName: "UniCredit",
  aspspCountry: "IT",
  psuType: "personal" as const,
  status: "authorized" as const,
  createdAt: "2026-09-11T08:00:00.000Z",
  lastSyncedAt: "2026-09-11T09:00:00.000Z",
  accounts: [
    {
      id: "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7081",
      providerAccountUid: "0f7d3d1c-3f4e-4b0e-9f1a-2b3c4d5e6f70",
      status: "mapped" as const,
      accountId: "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7081",
      accountName: "Conto corrente",
      maskedIban: "····3456",
      currency: "EUR",
      transactionCount: 4,
      lastBalanceMinor: 123456,
      lastBalanceCurrency: "EUR",
      ledgerBalanceMinor: 100000,
      ledgerBalanceCurrency: "EUR",
    },
  ],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface RouteMap {
  [path: string]: (init?: RequestInit) => Response;
}

function mockFetch(routes: RouteMap) {
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(raw, "http://localhost").pathname;
      const method = init?.method ?? "GET";
      calls.push({
        path,
        method,
        body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });
      const handler = routes[path];
      if (!handler) return json({ error: "not_found" }, 404);
      return handler(init);
    }),
  );
  return calls;
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Enable Banking in Settings", () => {
  it("asks for the key, the application id and the callback URL", async () => {
    mockFetch({
      "/api/banking/status": () =>
        json({
          provider: "enable-banking",
          configured: false,
          links: [],
          sync: { running: false },
        }),
      "/api/accounts": () => json({ items: [] }),
    });
    render(
      <SettingsView
        csrf="csrf"
        busy={false}
        vaultStatus={unlockedStatus}
        onChangePassphrase={async () => true}
        onClearError={() => undefined}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Connect to Enable Banking" })).toBeTruthy(),
    );
    expect(screen.getByLabelText("Enable Banking application ID")).toBeTruthy();
    expect(screen.getByLabelText("Private key (.pem)")).toBeTruthy();
    expect(screen.getByLabelText("Callback URL")).toBeTruthy();
    expect(screen.getByLabelText(/Refresh my banks/)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /Verify and save/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("lists banks for the chosen country and shows sandbox credentials", async () => {
    mockFetch({
      "/api/banking/status": () =>
        json({
          provider: "enable-banking",
          configured: true,
          connection: CONNECTION,
          links: [],
          sync: { running: false },
          autoSync: true,
        }),
      "/api/accounts": () => json({ items: [] }),
      "/api/banking/enable-banking/aspsps": () =>
        json({
          items: [
            {
              name: "UniCredit",
              country: "IT",
              beta: false,
              bic: "UNCRITMM",
              psuTypes: ["personal", "business"],
              maximumConsentDays: 90,
              sandboxUsers: [{ username: "customera", password: "12345678", otp: "123456" }],
              methods: [],
            },
          ],
        }),
    });
    render(
      <SettingsView
        csrf="csrf"
        busy={false}
        vaultStatus={unlockedStatus}
        onChangePassphrase={async () => true}
        onClearError={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.getByText("mytest-app")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Load available banks/ }));
    const search = await screen.findByLabelText("Search your bank");
    expect(screen.getByText(/1 bank available in IT/)).toBeTruthy();
    fireEvent.change(search, { target: { value: "unicre" } });
    fireEvent.click(screen.getByRole("option", { name: /UniCredit/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Connect$/ })).toBeTruthy());
    expect(screen.getByText("customera")).toBeTruthy();
    expect(screen.getByText(/consent up to 90 days/)).toBeTruthy();
  });

  it("filters a long bank list instead of printing all of it", async () => {
    mockFetch({
      "/api/banking/status": () =>
        json({
          provider: "enable-banking",
          configured: true,
          connection: CONNECTION,
          links: [],
          sync: { running: false },
          autoSync: true,
        }),
      "/api/accounts": () => json({ items: [] }),
      "/api/banking/enable-banking/aspsps": () =>
        json({
          items: Array.from({ length: 120 }, (_, index) => ({
            name: `Bank ${index}`,
            country: "IT",
            beta: false,
            psuTypes: ["personal"],
            sandboxUsers: [],
            methods: [],
          })),
        }),
    });
    render(
      <SettingsView
        csrf="csrf"
        busy={false}
        vaultStatus={unlockedStatus}
        onChangePassphrase={async () => true}
        onClearError={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.getByText("mytest-app")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Load available banks/ }));
    const search = await screen.findByLabelText("Search your bank");

    // It never renders the whole list at once: nothing until you type, and a
    // short set of matches after.
    expect(screen.queryByRole("listbox", { name: "Matching banks" })).toBeNull();
    fireEvent.change(search, { target: { value: "Bank 11" } });
    const options = within(screen.getByRole("listbox", { name: "Matching banks" })).getAllByRole(
      "option",
    );
    expect(options.length).toBeLessThan(120);
    expect(options[0]?.textContent).toBe("Bank 11");
    expect(screen.getByText(/banks match/)).toBeTruthy();
  });

  it("shows the mapped accounts of a connected bank", async () => {
    mockFetch({
      "/api/banking/status": () =>
        json({
          provider: "enable-banking",
          configured: true,
          connection: CONNECTION,
          links: [LINK],
          sync: { running: false, lastSyncAt: "2026-09-11T09:00:00.000Z" },
          autoSync: true,
        }),
      "/api/accounts": () => json({ items: [] }),
    });
    render(
      <SettingsView
        csrf="csrf"
        busy={false}
        vaultStatus={unlockedStatus}
        onChangePassphrase={async () => true}
        onClearError={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.getByText("Conto corrente")).toBeTruthy());
    expect(screen.getByRole("button", { name: /Sync now/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Unlink/ })).toBeTruthy();
    expect(screen.getByText("1234.56 EUR")).toBeTruthy();
  });

  it("keeps the authorization recoverable: paste the redirect back into Flowly", async () => {
    const calls = mockFetch({
      "/api/banking/status": () =>
        json({
          provider: "enable-banking",
          configured: true,
          connection: CONNECTION,
          links: [],
          sync: { running: false },
          autoSync: true,
        }),
      "/api/accounts": () => json({ items: [] }),
      "/api/banking/enable-banking/aspsps": () =>
        json({
          items: [
            {
              name: "UniCredit",
              country: "IT",
              beta: false,
              psuTypes: ["personal", "business"],
              sandboxUsers: [],
              methods: [],
            },
          ],
        }),
      "/api/banking/enable-banking/authorize": () =>
        json({
          linkId: LINK.id,
          url: "https://auth.enablebanking.com/ais/start?sessionid=abc",
          state: "state-1",
          expiresAt: "2026-09-11T09:15:00.000Z",
        }),
      "/api/banking/enable-banking/callback": () =>
        json({
          link: LINK,
          accounts: [],
          aspsp: { name: "UniCredit", country: "IT" },
        }),
    });
    render(
      <SettingsView
        csrf="csrf"
        busy={false}
        vaultStatus={unlockedStatus}
        onChangePassphrase={async () => true}
        onClearError={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.getByText("mytest-app")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Load available banks/ }));
    const search = await screen.findByLabelText("Search your bank");
    fireEvent.change(search, { target: { value: "UniCredit" } });
    fireEvent.click(screen.getByRole("option", { name: /UniCredit/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Connect$/ }));

    // No navigation: the page stays, and the bank page is one link away.
    await waitFor(() =>
      expect(screen.getByText(/Finish the authorization at UniCredit/)).toBeTruthy(),
    );
    expect(
      screen.getByRole("link", { name: /Continue to the bank/ }).getAttribute("href"),
    ).toContain("auth.enablebanking.com");
    expect(
      screen.getByRole("link", { name: /Open in another tab/ }).getAttribute("href"),
    ).toContain("auth.enablebanking.com");

    // The paste fallback is there, but only for the browser that could not
    // come back on its own.
    fireEvent.click(screen.getByText("Bank did not come back automatically?"));
    const field = screen.getByLabelText("URL you were redirected to");
    fireEvent.change(field, {
      target: {
        value: "http://localhost:8443/enablebanking/auth_callback?code=abc&state=state-1",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /Complete connection/ }));
    await waitFor(() =>
      expect(screen.getByText(/UniCredit is connected\. Link its accounts below/)).toBeTruthy(),
    );
    const callback = calls.find((call) => call.path.endsWith("/callback"));
    expect(callback?.body).toEqual({ code: "abc", state: "state-1" });
  });

  it("re-opens the bank page from a pending link after a reload", async () => {
    mockFetch({
      "/api/banking/status": () =>
        json({
          provider: "enable-banking",
          configured: true,
          connection: CONNECTION,
          links: [
            {
              ...LINK,
              status: "pending",
              accounts: [],
              authorizationUrl: "https://auth.enablebanking.com/ais/start?sessionid=resume-me",
            },
          ],
          sync: { running: false },
          autoSync: true,
        }),
      "/api/accounts": () => json({ items: [] }),
    });
    render(
      <SettingsView
        csrf="csrf"
        busy={false}
        vaultStatus={unlockedStatus}
        onChangePassphrase={async () => true}
        onClearError={() => undefined}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/Finish the authorization at UniCredit/)).toBeTruthy(),
    );
    expect(
      screen.getByRole("link", { name: /Continue to the bank/ }).getAttribute("href"),
    ).toContain("sessionid=resume-me");
  });

  it("aligns the Flowly balance with the bank balance in one click", async () => {
    const account = {
      formatVersion: 1 as const,
      revision: 3,
      id: LINK.accounts[0]?.accountId ?? "",
      name: "Conto corrente",
      type: "checking" as const,
      defaultCurrency: "EUR",
      openingBalanceMinor: 0,
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T08:00:00.000Z",
    };
    const calls = mockFetch({
      "/api/banking/status": () =>
        json({
          provider: "enable-banking",
          configured: true,
          connection: CONNECTION,
          links: [LINK],
          sync: { running: false },
          autoSync: true,
        }),
      "/api/accounts": () => json({ items: [account] }),
      [`/api/accounts/${account.id}`]: () => json({ entity: account }),
    });
    vi.stubGlobal("confirm", () => true);
    render(
      <SettingsView
        csrf="csrf"
        busy={false}
        vaultStatus={unlockedStatus}
        onChangePassphrase={async () => true}
        onClearError={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.getByText("1234.56 EUR")).toBeTruthy());
    expect(screen.getByText("1000.00 EUR")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Align/ }));

    await waitFor(() =>
      expect(screen.getByText(/now matches the balance the bank reports/)).toBeTruthy(),
    );
    const update = calls.find((call) => call.method === "PUT");
    expect(update?.body).toEqual({
      entity: { ...account, openingBalanceMinor: 23456 },
    });
  });

  it("surfaces an Enable Banking error from the pasted redirect", async () => {
    const calls = mockFetch({
      "/api/banking/status": () =>
        json({
          provider: "enable-banking",
          configured: true,
          connection: CONNECTION,
          links: [{ ...LINK, status: "pending", accounts: [] }],
          sync: { running: false },
          autoSync: true,
        }),
      "/api/accounts": () => json({ items: [] }),
    });
    render(
      <SettingsView
        csrf="csrf"
        busy={false}
        vaultStatus={unlockedStatus}
        onChangePassphrase={async () => true}
        onClearError={() => undefined}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/Finish the authorization at UniCredit/)).toBeTruthy(),
    );
    fireEvent.change(screen.getByLabelText("URL you were redirected to"), {
      target: {
        value:
          "https://flowly.test/enablebanking/auth_callback?state=x&error=server_error&error_description=Bank%20failed",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /Complete connection/ }));
    await waitFor(() =>
      expect(
        screen.getByText(/Enable Banking reported an internal error at the bank/),
      ).toBeTruthy(),
    );
    expect(calls.some((call) => call.path.endsWith("/callback"))).toBe(false);
  });

  it("disconnects Enable Banking completely, keeping the transactions", async () => {
    const calls = mockFetch({
      "/api/banking/status": () =>
        json({
          provider: "enable-banking",
          configured: true,
          connection: CONNECTION,
          links: [LINK],
          sync: { running: false },
          autoSync: true,
        }),
      "/api/accounts": () => json({ items: [] }),
      "/api/banking/enable-banking/config": () => json({ deleted: true, deletedLinks: 1 }),
    });
    vi.stubGlobal("confirm", () => true);
    render(
      <SettingsView
        csrf="csrf"
        busy={false}
        vaultStatus={unlockedStatus}
        onChangePassphrase={async () => true}
        onClearError={() => undefined}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Disconnect Enable Banking/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Disconnect Enable Banking/ }));
    await waitFor(() =>
      expect(
        screen.getByText(/Enable Banking disconnected, 1 bank link\(s\) removed/),
      ).toBeTruthy(),
    );
    const removal = calls.find((call) => call.method === "DELETE");
    expect(removal?.path).toBe("/api/banking/enable-banking/config");
  });

  it("renders banks as cards, never as the 48px icon tile", async () => {
    mockFetch({
      "/api/banking/status": () =>
        json({
          provider: "enable-banking",
          configured: true,
          connection: CONNECTION,
          links: [LINK],
          sync: { running: false },
          autoSync: true,
        }),
      "/api/accounts": () => json({ items: [] }),
      "/api/banking/enable-banking/aspsps": () =>
        json({
          items: [
            {
              name: "UniCredit",
              country: "IT",
              beta: false,
              bic: "UNCRITMM",
              psuTypes: ["personal"],
              sandboxUsers: [],
              methods: [],
            },
          ],
        }),
    });
    const { container } = render(
      <SettingsView
        csrf="csrf"
        busy={false}
        vaultStatus={unlockedStatus}
        onChangePassphrase={async () => true}
        onClearError={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.getByText("Conto corrente")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Load available banks/ }));
    const search = await screen.findByLabelText("Search your bank");
    fireEvent.change(search, { target: { value: "UniCredit" } });
    fireEvent.click(screen.getByRole("option", { name: /UniCredit/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Connect$/ })).toBeTruthy());

    // `.tile` is the dashboard's 48x48 icon square: reusing it squeezed the
    // bank rows into overlapping 48px cells.
    expect(container.querySelectorAll(".tile")).toHaveLength(0);
    expect(container.querySelectorAll(".rule-tile").length).toBeGreaterThanOrEqual(2);
  });
});

describe("Enable Banking on the dashboard", () => {
  it("launches a manual sync and reports the result", async () => {
    mockFetch({
      "/api/banking/status": () =>
        json({
          provider: "enable-banking",
          configured: true,
          connection: CONNECTION,
          links: [LINK],
          sync: { running: false },
          autoSync: true,
        }),
      "/api/banking/sync": () =>
        json({
          report: {
            startedAt: "2026-09-11T09:00:00.000Z",
            finishedAt: "2026-09-11T09:00:05.000Z",
            links: 1,
            accounts: 1,
            fetched: 3,
            created: 2,
            updated: 1,
            unchanged: 0,
            skipped: 0,
            failed: 0,
            errors: [],
            reconnectRequired: [],
          },
          status: {
            provider: "enable-banking",
            configured: true,
            connection: CONNECTION,
            links: [LINK],
            sync: { running: false },
          },
        }),
      "/api/dashboard": () => json(emptyDashboard),
      "/api/accounts": () => json({ items: [] }),
      "/api/tags": () => json({ items: [] }),
      "/api/transactions": () => json({ items: [], total: 0, limit: 5, offset: 0 }),
    });
    render(
      <DashboardView
        vaultId={unlockedStatus.vaultId}
        status={unlockedStatus}
        csrf="csrf"
        onNewTransaction={() => undefined}
        onSeeAllTransactions={() => undefined}
        onExportData={() => undefined}
        onOpenSettings={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: /Sync now/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Sync now/ }));
    await waitFor(() => expect(screen.getByText(/Sync finished: 2 new, 1 updated/)).toBeTruthy());
  });

  it("points to Settings when no bank is connected", async () => {
    mockFetch({
      "/api/banking/status": () =>
        json({
          provider: "enable-banking",
          configured: false,
          links: [],
          sync: { running: false },
        }),
      "/api/dashboard": () => json(emptyDashboard),
      "/api/accounts": () => json({ items: [] }),
      "/api/tags": () => json({ items: [] }),
      "/api/transactions": () => json({ items: [], total: 0, limit: 5, offset: 0 }),
    });
    const opened = vi.fn();
    render(
      <DashboardView
        vaultId={null}
        status={unlockedStatus}
        csrf="csrf"
        onNewTransaction={() => undefined}
        onSeeAllTransactions={() => undefined}
        onExportData={() => undefined}
        onOpenSettings={opened}
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Connect to Enable Banking/ })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Connect to Enable Banking/ }));
    expect(opened).toHaveBeenCalled();
  });
});

describe("Enable Banking callback", () => {
  it("exchanges the code, maps the account and finishes", async () => {
    window.history.replaceState({}, "", "/enablebanking/auth_callback?code=abc&state=xyz");
    const calls = mockFetch({
      "/api/banking/enable-banking/callback": () =>
        json({
          link: {
            ...LINK,
            accounts: [
              {
                id: "018f2c1e-6d5b-7c3a-9f2e-5c4d5e6f7082",
                providerAccountUid: "0f7d3d1c-3f4e-4b0e-9f1a-2b3c4d5e6f70",
                status: "unmapped",
                providerName: "Conto corrente",
                currency: "EUR",
                maskedIban: "····3456",
                cashAccountType: "CACC",
                transactionCount: 0,
              },
            ],
          },
          accounts: [
            {
              providerAccountUid: "0f7d3d1c-3f4e-4b0e-9f1a-2b3c4d5e6f70",
              status: "unmapped",
              suggestedName: "Conto corrente",
              suggestedType: "checking",
              suggestedCurrency: "EUR",
            },
          ],
          aspsp: { name: "UniCredit", country: "IT" },
          accessValidUntil: "2026-12-01T00:00:00.000Z",
        }),
      "/api/banking/enable-banking/links/018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f70/accounts": () =>
        json({
          ...LINK,
          accounts: [
            {
              id: "018f2c1e-6d5b-7c3a-9f2e-5c4d5e6f7082",
              providerAccountUid: "0f7d3d1c-3f4e-4b0e-9f1a-2b3c4d5e6f70",
              status: "mapped",
              accountId: "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7081",
              accountName: "Conto corrente",
              currency: "EUR",
              transactionCount: 0,
            },
          ],
        }),
      "/api/accounts": () => json({ items: [] }),
    });

    const finished = vi.fn();
    render(<BankCallbackView csrf="csrf" onFinished={finished} />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /UniCredit is connected/ })).toBeTruthy(),
    );
    expect(calls.some((call) => call.path.endsWith("/callback") && call.method === "POST")).toBe(
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: /Create account and link/ }));
    await waitFor(() =>
      expect(screen.getByText("Saved. You can link another account or finish.")).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole("button", { name: /^Finish$/ }));
    expect(finished).toHaveBeenCalled();
  });

  it("explains a bank refusal without calling the API", async () => {
    window.history.replaceState(
      {},
      "",
      "/enablebanking/auth_callback?error=access_denied&error_description=Denied%20data%20sharing",
    );
    const calls = mockFetch({});
    render(<BankCallbackView csrf="csrf" onFinished={() => undefined} />);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Denied data sharing"),
    );
    expect(calls).toHaveLength(0);
  });
});
