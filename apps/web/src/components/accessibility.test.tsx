import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell.js";
import { UnlockScreen } from "./UnlockScreen.js";

const unlockedStatus = {
  state: "unlocked" as const,
  vaultExists: true,
  vaultFormatVersion: 1,
  exportFormatVersion: 1,
  storageEngine: "sqlcipher" as const,
  schemaVersion: 3,
  lastUnlockedAt: "2026-09-01T08:00:00.000Z",
};

const emptyDashboard = {
  range: { from: "2026-09-01", to: "2026-09-30" },
  generatedAt: "2026-09-30T18:00:00.000Z",
  balances: [],
  cashFlow: [],
  spendingByTag: [],
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
    const name = (button.textContent?.trim() ?? "") || (button.getAttribute("aria-label") ?? "");
    expect(name.length > 0, "every button needs an accessible name").toBe(true);
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
  it("labels the unlock screen and exposes a single heading", () => {
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

  it("announces unlock errors with a live region", () => {
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

  it("keeps the vault shell navigable by role and label", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
          "http://localhost",
        ).pathname;
        const body = path === "/api/dashboard" ? emptyDashboard : { items: [] };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const { container } = render(
      <AppShell
        csrf="csrf-token"
        status={unlockedStatus}
        busy={false}
        error={undefined}
        onLock={async () => undefined}
        onChangePassphrase={async () => true}
        onClearError={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.getByRole("navigation", { name: "Sections" })).toBeTruthy());
    assertAccessibleNames(container);
    const current = container.querySelector('[aria-current="page"]');
    expect(current?.textContent).toContain("Dashboard");
    expect(screen.getByRole("button", { name: "Lock all sessions" })).toBeTruthy();
  });
});
