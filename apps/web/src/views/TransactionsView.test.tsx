import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionsView } from "./TransactionsView.js";

const ACCOUNT_ID = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f";
const TAG_ID = "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7081";

const account = {
  formatVersion: 1,
  revision: 1,
  id: ACCOUNT_ID,
  name: "Everyday",
  type: "checking",
  defaultCurrency: "EUR",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
};

const tag = {
  formatVersion: 1,
  revision: 1,
  id: TAG_ID,
  name: "Coffee",
  normalizedName: "coffee",
  color: "#4648d4",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
};

const transaction = {
  formatVersion: 1,
  revision: 1,
  id: "018f2c1e-6d5b-7c3a-9f2e-2b3c4d5e6f70",
  accountId: ACCOUNT_ID,
  bookingDate: "2026-09-03",
  amountMinor: -1230,
  currency: "EUR",
  payee: "Bar Centrale",
  userNote: "espresso with Luca",
  status: "booked",
  source: "manual",
  tagIds: [TAG_ID],
  createdAt: "2026-09-03T08:00:00.000Z",
  updatedAt: "2026-09-03T08:00:00.000Z",
};

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("transactions view", () => {
  it("shows the raw provider record behind a row as tables", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const raw =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const path = new URL(raw, "http://localhost").pathname;
        if (path === "/api/accounts") return json({ items: [account] });
        if (path === "/api/tags") return json({ items: [tag] });
        if (path === "/api/transactions") {
          return json({
            items: [
              {
                ...transaction,
                source: "enable-banking",
                provider: "enable-banking",
                providerTransactionId: "entry-1",
              },
            ],
            total: 1,
            limit: 100,
            offset: 0,
          });
        }
        if (path.endsWith("/raw")) {
          return json({
            provider: "enable-banking",
            linkId: "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7081",
            aspspName: "UniCredit",
            providerAccountUid: "uid-1",
            fetchedAt: "2026-09-15T10:00:00.000Z",
            requestFrom: "2026-06-06",
            requestTo: "2026-09-14",
            matchedBy: "provider-transaction-id",
            raw: {
              entry_reference: "entry-1",
              transaction_amount: { amount: "-12.30", currency: "EUR" },
              creditor: { name: "Bar Centrale" },
              status: "BOOK",
            },
          });
        }
        return json({ error: "not_found" });
      }),
    );

    render(<TransactionsView csrf="csrf-token" />);
    await waitFor(() => expect(screen.getByText("Bar Centrale")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Raw/ }));

    await waitFor(() => expect(screen.getByText("What the bank sent")).toBeTruthy());
    expect(screen.getByText("What Flowly stored")).toBeTruthy();
    // The provider JSON arrives flattened, one field per row.
    expect(screen.getByText("transaction_amount.amount")).toBeTruthy();
    expect(screen.getByText("-12.30")).toBeTruthy();
    expect(screen.getByText("creditor.name")).toBeTruthy();
    expect(
      within(screen.getByLabelText("Raw provider record")).getByText("UniCredit"),
    ).toBeTruthy();
    expect(screen.getByText(/matched by/).textContent).toContain("its provider id");
  });

  it("explains when a transaction has no provider record", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const raw =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const path = new URL(raw, "http://localhost").pathname;
        if (path === "/api/accounts") return json({ items: [account] });
        if (path === "/api/tags") return json({ items: [tag] });
        if (path === "/api/transactions") {
          return json({ items: [transaction], total: 1, limit: 100, offset: 0 });
        }
        if (path.endsWith("/raw")) {
          return new Response(
            JSON.stringify({
              error: "raw_record_not_found",
              message: "Flowly has no provider record for this transaction.",
            }),
            { status: 404, headers: { "content-type": "application/json" } },
          );
        }
        return json({ error: "not_found" });
      }),
    );

    render(<TransactionsView csrf="csrf-token" />);
    await waitFor(() => expect(screen.getByText("Bar Centrale")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Raw/ }));

    await waitFor(() =>
      expect(screen.getByText(/has no provider record for this transaction/)).toBeTruthy(),
    );
  });

  it("renders the ledger and asks the server to filter", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const raw =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const parsed = new URL(raw, "http://localhost");
        requests.push(`${parsed.pathname}${parsed.search}`);
        if (parsed.pathname === "/api/accounts") return json({ items: [account] });
        if (parsed.pathname === "/api/tags") return json({ items: [tag] });
        if (parsed.pathname === "/api/transactions") {
          return json({ items: [transaction], total: 1, limit: 100, offset: 0 });
        }
        return json({ error: "not_found" });
      }),
    );

    render(<TransactionsView csrf="csrf-token" />);

    await waitFor(() => expect(screen.getByText("Bar Centrale")).toBeTruthy());
    expect(screen.getByText("-12.30 EUR")).toBeTruthy();
    expect(screen.getAllByText("Coffee").length).toBeGreaterThan(0);
    // The status of every row is visible, and it is switchable.
    expect(screen.getByRole("button", { name: /Set status for Bar Centrale/ })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Status" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "espresso" } });
    await waitFor(() => expect(requests.some((url) => url.includes("q=espresso"))).toBe(true));

    fireEvent.change(screen.getByLabelText("Filter by account"), {
      target: { value: ACCOUNT_ID },
    });
    await waitFor(() =>
      expect(requests.some((url) => url.includes(`accountId=${ACCOUNT_ID}`))).toBe(true),
    );
  });

  it("edits note and tags together, without the old ± tag control", async () => {
    const calls: Array<{ method: string; url: string; body: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const raw =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const parsed = new URL(raw, "http://localhost");
        if (parsed.pathname === "/api/accounts") return json({ items: [account] });
        if (parsed.pathname === "/api/tags") return json({ items: [tag] });
        if (parsed.pathname === "/api/transactions" && (init?.method ?? "GET") === "GET") {
          return json({ items: [transaction], total: 1, limit: 100, offset: 0 });
        }
        if (parsed.pathname.startsWith("/api/transactions/")) {
          calls.push({
            method: init?.method ?? "GET",
            url: parsed.pathname,
            body: String(init?.body ?? ""),
          });
          return json({ entity: { ...transaction, revision: 2, tagIds: [] } });
        }
        return json({ error: "not_found" });
      }),
    );

    render(<TransactionsView csrf="csrf-token" />);
    await waitFor(() => expect(screen.getByText("Bar Centrale")).toBeTruthy());

    expect(screen.queryByText("± tag")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    // Tags are chosen from the compact picker, not from an inline checkbox list.
    fireEvent.click(await screen.findByRole("button", { name: /Edit tags for Bar Centrale/ }));
    const dialog = await screen.findByRole("dialog", { name: /Edit tags for Bar Centrale/ });
    const tagCheckbox = within(dialog).getByRole("checkbox", {
      name: /Coffee/,
    }) as HTMLInputElement;
    expect(tagCheckbox.checked).toBe(true);
    fireEvent.click(tagCheckbox);
    fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url).toBe(`/api/transactions/${transaction.id}`);
    expect(calls[0]?.body).toContain('"tagIds":[]');
  });

  it("edits payee and amount in the same inline save", async () => {
    const calls: Array<{ body: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const raw =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const parsed = new URL(raw, "http://localhost");
        if (parsed.pathname === "/api/accounts") return json({ items: [account] });
        if (parsed.pathname === "/api/tags") return json({ items: [tag] });
        if (parsed.pathname === "/api/transactions" && (init?.method ?? "GET") === "GET") {
          return json({ items: [transaction], total: 1, limit: 100, offset: 0 });
        }
        if (parsed.pathname.startsWith("/api/transactions/")) {
          calls.push({ body: String(init?.body ?? "") });
          return json({ entity: { ...transaction, revision: 2 } });
        }
        return json({ error: "not_found" });
      }),
    );

    render(<TransactionsView csrf="csrf-token" />);
    await waitFor(() => expect(screen.getByText("Bar Centrale")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    // The row prefills the amount in its own currency, editable as a decimal.
    const amount = (await screen.findByLabelText("Amount in EUR")) as HTMLInputElement;
    expect(amount.value).toBe("-12.30");
    fireEvent.change(amount, { target: { value: "-15.00" } });
    fireEvent.change(screen.getByLabelText(`Payee for ${transaction.id}`), {
      target: { value: "Bar Centrale Roma" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toContain('"amountMinor":-1500');
    expect(calls[0]?.body).toContain('"payee":"Bar Centrale Roma"');
  });
});
