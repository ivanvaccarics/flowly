import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { ApiError } from "./api/client.js";
import { describeError } from "./hooks/use-workspace.js";

const lockedStatus = {
  state: "locked",
  vaultFormatVersion: 1,
  exportFormatVersion: 1,
  storageEngine: "sqlcipher",
  schemaVersion: null,
  lastUnlockedAt: null,
};

const unlockedStatus = { ...lockedStatus, state: "unlocked", schemaVersion: 1 };

interface RouteMap {
  [path: string]: (init?: RequestInit) => Response;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function mockFetch(routes: RouteMap) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      const handler = routes[path];
      if (!handler) return json({ error: "not_found" }, 404);
      return handler(init);
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Flowly web client", () => {
  it("renders the locked shell from the server status", async () => {
    mockFetch({ "/api/vault/status": () => json(lockedStatus) });
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Vault locked"),
    );
    expect(screen.getByLabelText("Passphrase").hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "Unlock vault" }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByText("sqlcipher")).toBeTruthy();
  });

  it("explains when the server cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );
    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("connection refused"),
    );
  });

  it("unlocks and shows the workspace with real data", async () => {
    mockFetch({
      "/api/vault/status": () => json(lockedStatus),
      "/api/vault/unlock": () =>
        json({ csrfToken: "csrf-token", vault: unlockedStatus }, 200, {
          "set-cookie": "flowly_sid=abc",
        }),
      "/api/accounts": () => json({ items: [] }),
      "/api/transactions": () => json({ items: [] }),
      "/api/tags": () => json({ items: [] }),
      "/api/tagging-rules": () => json({ items: [] }),
    });
    render(<App />);

    await waitFor(() => expect(screen.getByLabelText("Passphrase")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Passphrase"), {
      target: { value: "correct horse battery staple" },
    });

    await waitFor(() => {
      const button = screen.getByRole("button", { name: "Unlock vault" }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });
    screen.getByRole("button", { name: "Unlock vault" }).click();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Your vault" })).toBeTruthy());
    expect(screen.getByRole("tab", { name: "Transactions" })).toBeTruthy();
    expect(await screen.findByText("No accounts yet. Add the first one above.")).toBeTruthy();
  });

  it("surfaces a revision conflict in plain language", () => {
    expect(describeError(new ApiError(409, "revision_conflict", "conflict"))).toBe(
      "Someone else changed this record. Reload and try again.",
    );
    expect(describeError(new ApiError(401, "invalid_passphrase", "nope"))).toBe(
      "That passphrase did not unlock the vault.",
    );
    expect(describeError(new ApiError(429, "too_many_attempts", "slow down"))).toContain(
      "Too many unlock attempts",
    );
  });
});
