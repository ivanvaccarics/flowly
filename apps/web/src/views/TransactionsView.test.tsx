import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

    // The create form also renders a Coffee checkbox; the row's edit mode is the
    // one pre-checked because the transaction already carries the tag.
    const boxes = (await screen.findAllByRole("checkbox", {
      name: /Coffee/,
    })) as HTMLInputElement[];
    const tagCheckbox = boxes.find((box) => box.checked);
    if (!tagCheckbox) throw new Error("the edit row shows the current tags pre-selected");
    fireEvent.click(tagCheckbox);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.url).toBe(`/api/transactions/${transaction.id}`);
    expect(calls[0]?.body).toContain('"tagIds":[]');
  });
});
