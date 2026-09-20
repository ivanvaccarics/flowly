import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RulesView } from "./RulesView.js";

const RULE_ID = "018f2c1e-6d5b-7c3a-9f2e-5b3c4d5e6f70";
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
  formatVersion: 1,
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
function mockApi(): Call[] {
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
      if (path === "/api/tagging-rules") return json({ items: [rule] });
      if (path === "/api/tags") return json({ items: [tag] });
      if (path === `/api/tagging-rules/${RULE_ID}` && method === "PUT") {
        return json({ entity: { ...rule, ...(body?.entity ?? {}) } });
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
  it("edits an existing rule in the builder instead of rebuilding it", async () => {
    const calls = mockApi();
    render(<RulesView csrf="csrf-token" />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "New rule" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Edit rule Coffee rule" }));

    // The builder adopts the stored rule: name, combinator, condition and tags.
    expect(screen.getByRole("heading", { name: "Edit rule" })).toBeTruthy();
    const nameField = screen.getByLabelText("Rule name") as HTMLInputElement;
    expect(nameField.value).toBe("Coffee rule");
    expect((screen.getByLabelText("Value 1") as HTMLInputElement).value).toBe("Bar Centrale");
    expect((screen.getByLabelText("Field 1") as HTMLSelectElement).value).toBe("payee");
    expect((screen.getByRole("checkbox", { name: "Coffee" }) as HTMLInputElement).checked).toBe(
      true,
    );

    fireEvent.change(nameField, { target: { value: "Coffee and bars" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(screen.getByText('Updated "Coffee rule".')).toBeTruthy());
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

    // Saving leaves the builder ready for the next rule.
    expect(screen.getByRole("heading", { name: "New rule" })).toBeTruthy();
    expect((screen.getByLabelText("Rule name") as HTMLInputElement).value).toBe("");
  });

  it("can cancel an edit and go back to building a new rule", async () => {
    mockApi();
    render(<RulesView csrf="csrf-token" />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "New rule" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Edit rule Coffee rule" }));
    expect(screen.getByRole("heading", { name: "Edit rule" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("heading", { name: "New rule" })).toBeTruthy();
    expect((screen.getByLabelText("Rule name") as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("checkbox", { name: "Coffee" }) as HTMLInputElement).checked).toBe(
      false,
    );
  });
});
