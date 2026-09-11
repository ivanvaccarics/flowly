import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TransactionsPanel } from "./TransactionsPanel.js";

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

describe("transactions panel", () => {
  it("asks the server to filter instead of filtering in the browser", async () => {
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

    render(<TransactionsPanel csrf="csrf-token" />);

    await waitFor(() => expect(screen.getByText("Bar Centrale")).toBeTruthy());
    expect(screen.getAllByText("Coffee").length).toBeGreaterThan(0);
    expect(screen.getByText("-12.30 EUR")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "espresso" } });
    await waitFor(() => expect(requests.some((url) => url.includes("q=espresso"))).toBe(true));

    fireEvent.change(screen.getByLabelText("Filter by account"), { target: { value: ACCOUNT_ID } });
    await waitFor(() =>
      expect(requests.some((url) => url.includes(`accountId=${ACCOUNT_ID}`))).toBe(true),
    );
  });
});
