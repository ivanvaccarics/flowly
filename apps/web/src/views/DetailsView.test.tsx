import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExpenseDetails } from "@flowly/web-contracts";
import { DetailsView } from "./DetailsView.js";

const RENT_TAG = "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7082";
const GROCERIES_TAG = "018f2c1e-6d5b-7c3a-9f2e-4c4d5e6f7081";
const CHECKING = "018f2c1e-6d5b-7c3a-9f2e-1a2b3c4d5e6f";

const details: ExpenseDetails = {
  range: { from: "2020-09-01", to: "2020-09-30" },
  generatedAt: "2020-09-30T18:00:00.000Z",
  currency: "EUR",
  otherCurrencies: ["USD"],
  totals: {
    spentMinor: 116200,
    incomeMinor: 0,
    netMinor: -116200,
    transactionCount: 3,
    calendarDays: 30,
    activeDays: 2,
    averageDailyMinor: 3873,
    averageActiveDayMinor: 58100,
    averageTicketMinor: 38733,
    largestMinor: 95000,
    largestDate: "2020-09-12",
    largestPayee: "Landlord",
  },
  byCategory: [
    {
      tagId: RENT_TAG,
      tagName: "Rent",
      spentMinor: 95000,
      transactionCount: 1,
      averageMinor: 95000,
      largestMinor: 95000,
    },
    {
      tagId: GROCERIES_TAG,
      tagName: "Groceries",
      spentMinor: 21200,
      transactionCount: 2,
      averageMinor: 10600,
      largestMinor: 12000,
    },
  ],
  untagged: { spentMinor: 0, transactionCount: 0 },
  daily: [
    { date: "2020-09-01", selected: true, spentMinor: 0, transactionCount: 0 },
    { date: "2020-09-12", selected: true, spentMinor: 95000, transactionCount: 1 },
    { date: "2020-09-20", selected: true, spentMinor: 21200, transactionCount: 2 },
  ],
  weekly: [
    {
      label: "Week 1",
      from: "2020-09-01",
      to: "2020-09-07",
      spentMinor: 12000,
      transactionCount: 2,
    },
    {
      label: "Week 2",
      from: "2020-09-08",
      to: "2020-09-14",
      spentMinor: 95000,
      transactionCount: 1,
    },
  ],
  byAccount: [
    { accountId: CHECKING, accountName: "Everyday", spentMinor: 116200, transactionCount: 3 },
  ],
  bySource: [{ source: "manual", spentMinor: 116200, transactionCount: 3 }],
  amountBands: [
    {
      key: "10-50",
      label: "10 – 50",
      lowerMinor: 1000,
      upperMinor: 5000,
      count: 1,
      spentMinor: 1200,
    },
    {
      key: "over-500",
      label: "500 and over",
      lowerMinor: 50000,
      upperMinor: null,
      count: 1,
      spentMinor: 95000,
    },
  ],
};

const emptyDetails: ExpenseDetails = {
  ...details,
  currency: null,
  otherCurrencies: [],
  totals: {
    ...details.totals,
    spentMinor: 0,
    incomeMinor: 0,
    netMinor: 0,
    transactionCount: 0,
    activeDays: 0,
    averageDailyMinor: 0,
    averageActiveDayMinor: 0,
    averageTicketMinor: 0,
    largestMinor: 0,
    largestDate: null,
    largestPayee: null,
  },
  byCategory: [],
  untagged: { spentMinor: 0, transactionCount: 0 },
  daily: [],
  weekly: [],
  byAccount: [],
  bySource: [],
  amountBands: [],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockVault(body: ExpenseDetails = details) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        "http://localhost",
      );
      if (url.pathname === "/api/analytics/expenses") return json(body);
      if (url.pathname === "/api/tags") return json({ items: [] });
      return json({ error: "not_found" }, 404);
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("expense details", () => {
  it("reads the period's figures and its categories", async () => {
    mockVault();
    render(<DetailsView onSeeAllTransactions={() => undefined} onExportData={() => undefined} />);

    await waitFor(() => expect(screen.getByText("Distribution by category")).toBeTruthy());
    expect(screen.getByText("Spent in this period")).toBeTruthy();
    expect(screen.getAllByText("1.162,00").length).toBeGreaterThan(0);
    expect(screen.getByText("Largest expense")).toBeTruthy();
    expect(screen.getByText(/Landlord/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show Rent in the ledger" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show Groceries in the ledger" })).toBeTruthy();
    // A currency left out is named, never blended into the totals.
    expect(screen.getByText(/USD also carry spending/)).toBeTruthy();
  });

  it("names every week of the bar chart and reads one out on focus", async () => {
    mockVault();
    render(<DetailsView onSeeAllTransactions={() => undefined} onExportData={() => undefined} />);

    const firstWeek = await screen.findByRole("button", {
      name: /^Week 1 \(2020-09-01 to 2020-09-07\)/,
    });
    expect(firstWeek.getAttribute("aria-label")).toBe(
      "Week 1 (2020-09-01 to 2020-09-07): 120,00 EUR",
    );

    fireEvent.focus(firstWeek);
    expect(screen.getByText("Week 1 · 2020-09-01 → 2020-09-07")).toBeTruthy();
    expect(screen.getByText("120,00 EUR")).toBeTruthy();
  });

  it("walks the weeks with the arrow keys", async () => {
    mockVault();
    render(<DetailsView onSeeAllTransactions={() => undefined} onExportData={() => undefined} />);

    const firstWeek = await screen.findByRole("button", {
      name: /^Week 1 \(2020-09-01 to 2020-09-07\)/,
    });
    firstWeek.focus();
    fireEvent.keyDown(firstWeek, { key: "ArrowRight" });
    expect(screen.getByText("Week 2 · 2020-09-08 → 2020-09-14")).toBeTruthy();
  });

  it("reads a day out of the cumulative trajectory on hover", async () => {
    mockVault();
    render(<DetailsView onSeeAllTransactions={() => undefined} onExportData={() => undefined} />);

    const day = await screen.findByRole("button", {
      name: "12 Sep 2020: 950,00 EUR spent, 950,00 EUR cumulative",
    });
    fireEvent.pointerEnter(day);
    expect(screen.getByText("12 Sep 2020 · day 2 of 3")).toBeTruthy();
    expect(screen.getByText("Cumulative")).toBeTruthy();
    expect(screen.getAllByText("950,00 EUR").length).toBeGreaterThan(1);
  });

  it("reads a day out of the heatmap on hover", async () => {
    mockVault();
    render(<DetailsView onSeeAllTransactions={() => undefined} onExportData={() => undefined} />);

    const cell = await screen.findByRole("button", {
      name: "12 Sep 2020: 950,00 EUR across 1 movement",
    });
    fireEvent.pointerEnter(cell);
    expect(screen.getByText("12 Sep 2020")).toBeTruthy();
    expect(screen.getByText("Share of period")).toBeTruthy();
  });

  it("opens the ledger on the day a heatmap cell stands for", async () => {
    const onSeeAll = vi.fn();
    mockVault();
    render(<DetailsView onSeeAllTransactions={onSeeAll} onExportData={() => undefined} />);

    const cell = await screen.findByRole("button", {
      name: "20 Sep 2020: 212,00 EUR across 2 movements",
    });
    fireEvent.click(cell);
    expect(onSeeAll).toHaveBeenCalledWith({ from: "2020-09-20", to: "2020-09-20" });
  });

  it("opens the ledger on the tag that was clicked", async () => {
    const onSeeAll = vi.fn();
    mockVault();
    render(<DetailsView onSeeAllTransactions={onSeeAll} onExportData={() => undefined} />);

    fireEvent.click(await screen.findByRole("button", { name: "Show Rent in the ledger" }));
    expect(onSeeAll).toHaveBeenCalledWith({
      tagId: RENT_TAG,
      from: expect.any(String),
      to: expect.any(String),
    });
  });

  it("says so when the period holds no booked spending", async () => {
    mockVault(emptyDetails);
    render(<DetailsView onSeeAllTransactions={() => undefined} onExportData={() => undefined} />);

    await waitFor(() =>
      expect(screen.getByText("No booked spending in this period.")).toBeTruthy(),
    );
    expect(screen.queryByText("Spent in this period")).toBeNull();
  });
});
