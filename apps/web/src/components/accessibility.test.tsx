import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UnlockScreen } from "./UnlockScreen.js";
import { Workspace } from "./Workspace.js";

const unlockedStatus = {
  state: "unlocked" as const,
  vaultExists: true,
  vaultFormatVersion: 1,
  exportFormatVersion: 1,
  storageEngine: "sqlcipher" as const,
  schemaVersion: 2,
  lastUnlockedAt: "2026-09-01T08:00:00.000Z",
};

function assertAccessibleNames(container: HTMLElement): void {
  for (const field of container.querySelectorAll("input, select, textarea")) {
    const labelled =
      field.hasAttribute("aria-label") ||
      field.hasAttribute("aria-labelledby") ||
      (field.id !== "" && container.querySelector(`label[for="${field.id}"]`) !== null) ||
      field.closest("label") !== null;
    expect(labelled, `field ${field.outerHTML.slice(0, 60)} needs an accessible name`).toBe(true);
  }
  for (const button of container.querySelectorAll("button")) {
    const name = button.textContent?.trim() ?? "";
    expect(name.length > 0, "every button needs visible text").toBe(true);
  }
  for (const image of container.querySelectorAll("img")) {
    expect(image.hasAttribute("alt"), "every image needs an alt attribute").toBe(true);
  }
  expect(container.querySelectorAll("h1").length).toBe(1);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("accessibility structure", () => {
  it("labels every field on the unlock screen and exposes a single heading", () => {
    const { container } = render(
      <UnlockScreen
        status={{ ...unlockedStatus, state: "locked", schemaVersion: null, lastUnlockedAt: null }}
        busy={false}
        error={undefined}
        onUnlock={async () => true}
        onCreate={async () => true}
        onClearError={() => undefined}
      />,
    );
    assertAccessibleNames(container);
    expect(screen.getByLabelText("Passphrase")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces errors with a live region", () => {
    const { container } = render(
      <UnlockScreen
        status={unlockedStatus}
        busy={false}
        error="That passphrase did not unlock the vault."
        onUnlock={async () => false}
        onCreate={async () => false}
        onClearError={() => undefined}
      />,
    );
    assertAccessibleNames(container);
    expect(screen.getByRole("alert").textContent).toContain("did not unlock");
  });

  it("keeps the workspace navigable by role and labels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
          "http://localhost",
        ).pathname;
        const body = path === "/api/dashboard" ? null : { items: [] };
        return new Response(JSON.stringify(body ?? emptyDashboard), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const { container } = render(
      <Workspace
        csrf="csrf-token"
        status={unlockedStatus}
        busy={false}
        error={undefined}
        onLock={async () => undefined}
        onChangePassphrase={async () => true}
        onClearError={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.getByRole("tablist")).toBeTruthy());
    assertAccessibleNames(container);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.length).toBeGreaterThan(3);
    for (const tab of tabs) {
      expect(tab.getAttribute("aria-selected")).toMatch(/true|false/);
    }
    expect(screen.getByRole("tabpanel")).toBeTruthy();
  });
});

const emptyDashboard = {
  range: { from: "2026-09-01", to: "2026-09-30" },
  generatedAt: "2026-09-30T18:00:00.000Z",
  balances: [],
  cashFlow: [],
  spendingByTag: [],
  budgets: [],
};
