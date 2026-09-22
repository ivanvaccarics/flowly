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
  color: "#0f766e",
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

/** A ledger big enough to need paging: one distinct payee per row. */
function ledgerRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...transaction,
    id: `018f2c1e-6d5b-7c3a-9f2e-6b3c4d5e6f${String(index + 1).padStart(2, "0")}`,
    payee: `Payee ${index + 1}`,
    bookingDate: `2026-09-${String((index % 28) + 1).padStart(2, "0")}`,
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("transactions view", () => {
  it("opens on the filters a dashboard chart sent", async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
          "http://localhost",
        );
        if (url.pathname === "/api/accounts") return json({ items: [account] });
        if (url.pathname === "/api/tags") return json({ items: [tag] });
        if (url.pathname === "/api/transactions") {
          requested.push(url.search);
          return json({ items: [], total: 0, limit: 25, offset: 0 });
        }
        return json({ error: "not_found" });
      }),
    );

    // What a spent pie slice or a cash-flow week hands over.
    render(
      <TransactionsView
        csrf="csrf-token"
        seed={{ tagId: TAG_ID, from: "2026-09-01", to: "2026-09-07" }}
      />,
    );

    await waitFor(() => expect(requested.length).toBeGreaterThan(0));
    expect(requested[0]).toContain(`tags=${TAG_ID}`);
    expect(requested[0]).toContain("from=2026-09-01");
    expect(requested[0]).toContain("to=2026-09-07");

    // The filters are in the form, not hidden state: clearing them is a click.
    await waitFor(() =>
      expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("2026-09-01"),
    );
    expect((screen.getByLabelText("To") as HTMLInputElement).value).toBe("2026-09-07");
    expect((screen.getByLabelText("Tag") as HTMLSelectElement).value).toBe(TAG_ID);
  });

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
    expect(screen.getByText("-12,30 EUR")).toBeTruthy();
    expect(screen.getAllByText("Coffee").length).toBeGreaterThan(0);
    // The status of every row is visible, and it is switchable.
    expect(screen.getByRole("button", { name: /Set status for Bar Centrale/ })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Filter by status" })).toBeTruthy();

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
    fireEvent.click(screen.getByRole("button", { name: "Edit Bar Centrale" }));

    // The row opens the same dialog the composer uses, tags included.
    const editor = await screen.findByRole("dialog", { name: "Edit Bar Centrale" });
    fireEvent.click(within(editor).getByRole("button", { name: /Edit tags for Bar Centrale/ }));
    const picker = await screen.findByRole("dialog", { name: /Edit tags for Bar Centrale/ });
    const tagCheckbox = within(picker).getByRole("checkbox", {
      name: /Coffee/,
    }) as HTMLInputElement;
    expect(tagCheckbox.checked).toBe(true);
    fireEvent.click(tagCheckbox);
    fireEvent.click(within(picker).getByRole("button", { name: "Done" }));

    fireEvent.click(within(editor).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url).toBe(`/api/transactions/${transaction.id}`);
    expect(calls[0]?.body).toContain('"tagIds":[]');
  });

  it("edits payee and amount in the same dialog", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Edit Bar Centrale" }));

    // The dialog prefills the amount in the movement's own currency.
    const editor = await screen.findByRole("dialog", { name: "Edit Bar Centrale" });
    const amount = within(editor).getByLabelText("Amount (EUR)") as HTMLInputElement;
    expect(amount.value).toBe("-12,30");
    fireEvent.change(amount, { target: { value: "-15,00" } });
    fireEvent.change(within(editor).getByLabelText("Payee"), {
      target: { value: "Bar Centrale Roma" },
    });
    fireEvent.click(within(editor).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toContain('"amountMinor":-1500');
    expect(calls[0]?.body).toContain('"payee":"Bar Centrale Roma"');
  });

  it("opens the edit dialog on a double-click, and keeps the Edit button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const raw =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const parsed = new URL(raw, "http://localhost");
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

    // The hint says the cells are the shortcut, not another control to find.
    expect(screen.getByText(/double-click a cell to edit it in place/)).toBeTruthy();

    // A double-click on the payee opens the movement in a dialog.
    const payeeCell = screen.getByText("Bar Centrale");
    fireEvent.doubleClick(payeeCell);
    const editor = await screen.findByRole("dialog", { name: "Edit Bar Centrale" });
    expect((within(editor).getByLabelText("Payee") as HTMLInputElement).value).toBe("Bar Centrale");
    expect((within(editor).getByLabelText("Amount (EUR)") as HTMLInputElement).value).toBe(
      "-12,30",
    );
    expect((within(editor).getByLabelText("Note") as HTMLInputElement).value).toBe(
      "espresso with Luca",
    );
    expect(within(editor).getByRole("button", { name: /Edit tags for Bar Centrale/ })).toBeTruthy();

    // Cancel returns the read-only row, and the button still opens the editor.
    fireEvent.click(within(editor).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Edit Bar Centrale" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit Bar Centrale" }));
    expect(await screen.findByRole("dialog", { name: "Edit Bar Centrale" })).toBeTruthy();
  });

  it("pages through the ledger on the server and starts over when the filters change", async () => {
    const requests: string[] = [];
    const rows = ledgerRows(60);
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
          const limit = Number(parsed.searchParams.get("limit") ?? 100);
          const offset = Number(parsed.searchParams.get("offset") ?? 0);
          return json({
            items: rows.slice(offset, offset + limit),
            total: rows.length,
            limit,
            offset,
          });
        }
        return json({ error: "not_found" });
      }),
    );

    render(<TransactionsView csrf="csrf-token" />);
    await waitFor(() => expect(screen.getByText("Payee 1")).toBeTruthy());

    // The first load asks for one window of rows, not for the whole vault.
    expect(requests.some((url) => url.includes("limit=25") && url.includes("offset=0"))).toBe(true);
    expect(screen.getByText("Showing 1–25 of 60 transactions")).toBeTruthy();
    expect(screen.getByText("Page 1 / 3")).toBeTruthy();
    expect(screen.queryByText("Payee 26")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("Payee 26")).toBeTruthy());
    expect(requests.some((url) => url.includes("offset=25"))).toBe(true);
    expect(screen.getByText("Showing 26–50 of 60 transactions")).toBeTruthy();
    expect(screen.getByText("Page 2 / 3")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => expect(screen.getByText("Payee 1")).toBeTruthy());
    expect(screen.getByText("Page 1 / 3")).toBeTruthy();

    // A different query is a different result set: it opens on its own page 1.
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("Payee 26")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "espresso" } });
    await waitFor(() =>
      expect(requests.some((url) => url.includes("q=espresso") && url.includes("offset=0"))).toBe(
        true,
      ),
    );
    expect(screen.getByText("Page 1 / 3")).toBeTruthy();
  });

  it("folds back to the last page with rows when the current page empties", async () => {
    const requests: string[] = [];
    const rows = ledgerRows(26);
    // 26 matches, then the one row on page 2 is deleted between the two reads.
    let total = 26;
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
          const limit = Number(parsed.searchParams.get("limit") ?? 100);
          const offset = Number(parsed.searchParams.get("offset") ?? 0);
          if (offset > 0) {
            total = 25;
            return json({ items: [], total, limit, offset });
          }
          return json({ items: rows.slice(0, Math.min(limit, total)), total, limit, offset });
        }
        return json({ error: "not_found" });
      }),
    );

    render(<TransactionsView csrf="csrf-token" />);
    await waitFor(() => expect(screen.getByText("Payee 1")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("Showing 1–25 of 25 transactions")).toBeTruthy());
    expect(requests.some((url) => url.includes("offset=25"))).toBe(true);
    expect(screen.getByText("Page 1 / 1")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
