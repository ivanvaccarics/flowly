import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TagsView } from "./TagsView.js";

/** Eleven tags: more than one page of the directory, which shows eight. */
const TAGS = Array.from({ length: 11 }, (_unused, index) => ({
  formatVersion: 1,
  revision: 1,
  id: `018f2c1e-6d5b-7c3a-9f2e-8c4d5e6f70${String(index + 10)}`,
  name: `Tag ${String(index + 1).padStart(2, "0")}`,
  normalizedName: `tag ${String(index + 1).padStart(2, "0")}`,
  color: "#1e6f4e",
  createdAt: `2026-09-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
  updatedAt: `2026-09-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
  usage: { transactions: 11 - index, rules: index % 2 },
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mockApi(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(raw, "http://localhost").pathname;
      if (path === "/api/tags") return json({ items: TAGS });
      return json({ error: "not_found" }, 404);
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("tag directory", () => {
  it("counts the rows on the page, not the ones in the vault", async () => {
    mockApi();
    render(<TagsView csrf="csrf-token" />);

    // The first page holds eight of the eleven tags.
    await waitFor(() => expect(screen.getByText("1–8 of 11")).toBeTruthy());
    expect(screen.getByText("Tag 01")).toBeTruthy();
    expect(screen.getByText("Tag 08")).toBeTruthy();
    expect(screen.queryByText("Tag 09")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    // The last page holds the three that are left, and says so.
    await waitFor(() => expect(screen.getByText("9–11 of 11")).toBeTruthy());
    expect(screen.getByText("Tag 09")).toBeTruthy();
    expect(screen.getByText("Tag 11")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("narrows the directory by scope, search and first letter", async () => {
    mockApi();
    render(<TagsView csrf="csrf-token" />);

    await waitFor(() =>
      expect(screen.getByText("11 visible · 11 total · sorted for scanning")).toBeTruthy(),
    );

    // Every tag carries at least one movement in this vault, so "Unused" is empty.
    fireEvent.click(screen.getByRole("button", { name: "Unused" }));
    await waitFor(() =>
      expect(screen.getByText("0 visible · 11 total · sorted for scanning")).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    fireEvent.change(screen.getByLabelText("Search tags"), { target: { value: "Tag 1" } });
    await waitFor(() =>
      expect(screen.getByText("2 visible · 11 total · sorted for scanning")).toBeTruthy(),
    );
    expect(screen.getByText("Tag 10")).toBeTruthy();
    expect(screen.getByText("Tag 11")).toBeTruthy();
  });
});
