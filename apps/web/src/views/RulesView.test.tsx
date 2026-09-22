import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RulesView } from "./RulesView.js";

const RULE_ID = "018f2c1e-6d5b-7c3a-9f2e-5b3c4d5e6f70";
const PAUSED_ID = "018f2c1e-6d5b-7c3a-9f2e-5b3c4d5e6f71";
const TAG_ID = "018f2c1e-6d5b-7c3a-9f2e-3c4d5e6f7081";

const tag = {
  formatVersion: 1,
  revision: 1,
  id: TAG_ID,
  name: "Coffee",
  normalizedName: "coffee",
  color: "#1e6f4e",
  createdAt: "2026-09-01T08:00:00.000Z",
  updatedAt: "2026-09-01T08:00:00.000Z",
};

const rule = {
  formatVersion: 2,
  revision: 1,
  id: RULE_ID,
  name: "Coffee rule",
  enabled: true,
  combinator: "and",
  conditions: [{ field: "payee", operator: "is", value: "Bar Centrale" }],
  tagIds: [TAG_ID],
  createdAt: "2026-09-02T08:00:00.000Z",
  updatedAt: "2026-09-02T08:00:00.000Z",
};

const pausedRule = { ...rule, id: PAUSED_ID, name: "Paused rule", enabled: false };

const emptyStats = { evaluated: 0, matched: 0, byRule: [], byTag: [] };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface Call {
  path: string;
  method: string;
  entity?: Record<string, unknown>;
}

/** The rules API, recording what the view sent so the PUT can be inspected. */
function mockApi(storedRules: Array<typeof rule> = [rule], stats: unknown = emptyStats): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(raw, "http://localhost").pathname;
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({
        path,
        method,
        ...(body?.entity ? { entity: body.entity as Record<string, unknown> } : {}),
      });
      if (path === "/api/tagging-rules/stats") return json(stats);
      if (path === "/api/tagging-rules/preview" && method === "POST") {
        return json({ evaluated: 4, matched: 2 });
      }
      if (path === "/api/tagging-rules" && method === "POST") {
        return json({ entity: { ...rule, ...(body?.entity ?? {}) } }, 201);
      }
      if (path === "/api/tagging-rules") return json({ items: storedRules });
      if (path === "/api/tags") return json({ items: [tag] });
      if (path.startsWith("/api/tagging-rules/") && method === "PUT") {
        return json({ entity: { ...rule, ...(body?.entity ?? {}) } });
      }
      if (path.startsWith("/api/tagging-rules/") && method === "DELETE") {
        return json({ deleted: true });
      }
      return json({ error: "not_found" }, 404);
    }),
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("rules view", () => {
  it("edits an existing rule in a dialog and leaves the composer alone", async () => {
    const calls = mockApi();
    render(<RulesView csrf="csrf-token" />);
    const card = await screen.findByRole("form", { name: "New rule" });
    // The composer is already holding a draft of its own.
    fireEvent.change(within(card).getByLabelText("Rule name"), {
      target: { value: "Rent rule" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit rule Coffee rule" }));

    // The dialog adopts the stored rule: name, combinator, condition and tags.
    const dialog = screen.getByRole("dialog", { name: "Edit rule Coffee rule" });
    const nameField = within(dialog).getByLabelText("Rule name") as HTMLInputElement;
    expect(nameField.value).toBe("Coffee rule");
    expect((within(dialog).getByLabelText("Value 1") as HTMLInputElement).value).toBe(
      "Bar Centrale",
    );
    expect((within(dialog).getByLabelText("Field 1") as HTMLSelectElement).value).toBe("payee");
    expect(within(dialog).getByRole("button", { name: "Coffee", pressed: true })).toBeTruthy();
    // Editing is not the composer: its draft and its heading never change.
    expect((within(card).getByLabelText("Rule name") as HTMLInputElement).value).toBe("Rent rule");
    expect(within(card).getByRole("heading", { name: "New categorisation rule" })).toBeTruthy();

    fireEvent.change(nameField, { target: { value: "Coffee and bars" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText('Updated "Coffee rule".')).toBeTruthy();
    const saved = calls.find((call) => call.method === "PUT");
    expect(saved?.path).toBe(`/api/tagging-rules/${RULE_ID}`);
    // The identity and the state come from the stored rule, not from the form.
    expect(saved?.entity).toMatchObject({
      id: RULE_ID,
      revision: 1,
      enabled: true,
      createdAt: rule.createdAt,
      name: "Coffee and bars",
      combinator: "and",
      conditions: [{ field: "payee", operator: "is", value: "Bar Centrale" }],
      tagIds: [TAG_ID],
    });

    // The composer behind kept its own draft, untouched by the edit.
    expect((within(card).getByLabelText("Rule name") as HTMLInputElement).value).toBe("Rent rule");
  });

  it("closes the edit dialog without touching the composer", async () => {
    const calls = mockApi();
    render(<RulesView csrf="csrf-token" />);
    const card = await screen.findByRole("form", { name: "New rule" });
    fireEvent.change(within(card).getByLabelText("Rule name"), {
      target: { value: "Rent rule" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Edit rule Coffee rule" }));
    expect(screen.getByRole("dialog", { name: "Edit rule Coffee rule" })).toBeTruthy();

    // Escape closes it: neither route writes anything.
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((within(card).getByLabelText("Rule name") as HTMLInputElement).value).toBe("Rent rule");

    fireEvent.click(screen.getByRole("button", { name: "Edit rule Coffee rule" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Edit rule Coffee rule" })).getByRole("button", {
        name: "Cancel",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((within(card).getByLabelText("Rule name") as HTMLInputElement).value).toBe("Rent rule");
    // Closing is not saving: nothing was written on either route.
    expect(calls.filter((call) => call.method !== "GET")).toEqual([]);
  });

  it("still creates a rule from the composer", async () => {
    const calls = mockApi();
    render(<RulesView csrf="csrf-token" />);
    const card = await screen.findByRole("form", { name: "New rule" });

    fireEvent.change(within(card).getByLabelText("Rule name"), { target: { value: "Bars" } });
    fireEvent.click(within(card).getByRole("button", { name: "Coffee" }));
    fireEvent.click(within(card).getByRole("button", { name: "Save rule" }));

    await waitFor(() => expect(screen.getByText('Created "Bars".')).toBeTruthy());
    const posted = calls.find((call) => call.method === "POST");
    expect(posted?.path).toBe("/api/tagging-rules");
    expect(posted?.entity).toMatchObject({
      name: "Bars",
      combinator: "and",
      enabled: true,
      tagIds: [TAG_ID],
    });
    expect((within(card).getByLabelText("Rule name") as HTMLInputElement).value).toBe("");
  });

  it("keeps a decimal amount condition in its currency", async () => {
    const calls = mockApi();
    render(<RulesView csrf="csrf-token" />);
    const card = await screen.findByRole("form", { name: "New rule" });

    fireEvent.change(within(card).getByLabelText("Rule name"), { target: { value: "Rent" } });
    fireEvent.change(within(card).getByLabelText("Field 1"), { target: { value: "amount" } });
    fireEvent.change(within(card).getByLabelText("Value 1"), { target: { value: "-5.10" } });
    fireEvent.change(within(card).getByLabelText("Currency 1"), { target: { value: "EUR" } });
    fireEvent.click(within(card).getByRole("button", { name: "Coffee" }));
    fireEvent.click(within(card).getByRole("button", { name: "Save rule" }));

    await waitFor(() => expect(screen.getByText('Created "Rent".')).toBeTruthy());
    const posted = calls.find(
      (call) => call.method === "POST" && call.path === "/api/tagging-rules",
    );
    expect(posted?.entity).toMatchObject({
      formatVersion: 2,
      conditions: [{ field: "amount", operator: "greaterThan", value: "-5.10", currency: "EUR" }],
    });
  });

  it("round-trips a stored amount condition through the edit dialog", async () => {
    const amountRule = {
      ...rule,
      conditions: [
        { field: "amount", operator: "lessThan", value: "-5.10", currency: "EUR" as const },
      ],
    };
    const calls = mockApi([amountRule]);
    render(<RulesView csrf="csrf-token" />);
    await waitFor(() => expect(screen.getByText("Coffee rule")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Edit rule Coffee rule" }));
    const dialog = screen.getByRole("dialog", { name: "Edit rule Coffee rule" });
    expect((within(dialog).getByLabelText("Field 1") as HTMLSelectElement).value).toBe("amount");
    expect((within(dialog).getByLabelText("Value 1") as HTMLInputElement).value).toBe("-5.10");
    expect((within(dialog).getByLabelText("Currency 1") as HTMLSelectElement).value).toBe("EUR");

    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const saved = calls.find((call) => call.method === "PUT");
    expect(saved?.entity?.conditions).toEqual([
      { field: "amount", operator: "lessThan", value: "-5.10", currency: "EUR" },
    ]);
  });

  it("refuses an amount that is not a number before calling the API", async () => {
    const calls = mockApi();
    render(<RulesView csrf="csrf-token" />);
    const card = await screen.findByRole("form", { name: "New rule" });

    fireEvent.change(within(card).getByLabelText("Rule name"), { target: { value: "Rent" } });
    fireEvent.change(within(card).getByLabelText("Field 1"), { target: { value: "amount" } });
    fireEvent.change(within(card).getByLabelText("Value 1"), { target: { value: "cinque" } });
    fireEvent.click(within(card).getByRole("button", { name: "Coffee" }));
    fireEvent.click(within(card).getByRole("button", { name: "Save rule" }));

    await waitFor(() =>
      expect(
        screen.getByText("Condition 1: write the amount as a number, like -5.10."),
      ).toBeTruthy(),
    );
    expect(
      calls.filter((call) => call.path === "/api/tagging-rules" && call.method === "POST"),
    ).toEqual([]);
  });

  it("shows what the rules cover, per tag and per rule", async () => {
    mockApi([rule, pausedRule], {
      evaluated: 10,
      matched: 4,
      byRule: [
        { ruleId: RULE_ID, matches: 4 },
        { ruleId: PAUSED_ID, matches: 0 },
      ],
      byTag: [{ tagId: TAG_ID, transactions: 4 }],
    });
    render(<RulesView csrf="csrf-token" />);

    await waitFor(() => expect(screen.getByText("Automation metrics")).toBeTruthy());
    expect(screen.getByText("Total matches")).toBeTruthy();
    expect(await screen.findByText("of 10 transactions covered")).toBeTruthy();
    expect(screen.getByText("40%")).toBeTruthy();
    expect(screen.getByText("4 transactions covered in this vault")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Transactions covered per tag: Coffee 4" }),
    ).toBeTruthy();

    // The registry carries the same count per rule, in the row.
    const row = within(screen.getByRole("table")).getByText("Coffee rule").closest("tr");
    expect(within(row as HTMLElement).getByText("4")).toBeTruthy();
  });

  it("previews a draft live, without saving anything", async () => {
    const calls = mockApi();
    render(<RulesView csrf="csrf-token" />);
    const card = await screen.findByRole("form", { name: "New rule" });

    fireEvent.change(within(card).getByLabelText("Rule name"), { target: { value: "Coffee" } });
    fireEvent.change(within(card).getByLabelText("Value 1"), { target: { value: "espresso" } });

    await waitFor(() =>
      expect(screen.getByText("Matches 2 of the 4 most recent transactions.")).toBeTruthy(),
    );
    expect(calls.some((call) => call.path === "/api/tagging-rules/preview")).toBe(true);
  });

  it("opens the editor from the row, and leaves the row's own controls alone", async () => {
    const calls = mockApi();
    render(<RulesView csrf="csrf-token" />);
    await waitFor(() => expect(screen.getByText("Coffee rule")).toBeTruthy());

    // The pause switch stays a switch: it never opens the dialog.
    fireEvent.click(screen.getByRole("button", { name: "Pause rule Coffee rule" }));
    await waitFor(() => expect(calls.some((call) => call.method === "PUT")).toBe(true));
    expect(screen.queryByRole("dialog")).toBeNull();

    // A click on the row itself opens the rule.
    fireEvent.click(screen.getByText("Coffee rule"));
    expect(screen.getByRole("dialog", { name: "Edit rule Coffee rule" })).toBeTruthy();
  });

  it("filters the registry and can flip every rule at once", async () => {
    const calls = mockApi([rule, pausedRule]);
    render(<RulesView csrf="csrf-token" />);
    await waitFor(() => expect(screen.getByText("Paused rule")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(screen.queryByText("Paused rule")).toBeNull();
    expect(screen.getByText("Coffee rule")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Paused rule")).toBeTruthy();

    // One rule is paused, so the header offers the flip that changes something.
    fireEvent.click(screen.getByRole("button", { name: "Enable all" }));
    await waitFor(() => expect(calls.filter((call) => call.method === "PUT")).toHaveLength(1));
  });
});
