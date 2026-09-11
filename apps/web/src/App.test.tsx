import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

const lockedStatus = {
  state: "locked",
  vaultFormatVersion: 1,
  exportFormatVersion: 1,
  storageEngine: "sqlcipher",
  schemaVersion: null,
  lastUnlockedAt: null,
};

describe("locked vault shell", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the locked shell from the server status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(lockedStatus), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    render(<App />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Vault locked");
    await waitFor(() => expect(screen.getByText("sqlcipher")).toBeTruthy());
    expect(screen.getByLabelText("Passphrase").hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "Unlock vault" }).hasAttribute("disabled")).toBe(
      true,
    );
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
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Vault locked");
  });
});
