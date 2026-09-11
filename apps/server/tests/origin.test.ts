import { describe, expect, it } from "vitest";
import { makeConfig, startHarness } from "./helpers/api.js";
import { buildApp } from "../src/api/app.js";
import { Vault } from "../src/vault/vault.js";
import { TEST_KDF } from "./helpers/test-utils.js";

/**
 * A service that has not opened the vault yet must still report that the vault
 * file exists, otherwise the client offers to create a second vault.
 */
describe("locked status", () => {
  it("reports an existing vault without opening it", async () => {
    const { config } = makeConfig();
    const vault = await Vault.create(config.vaultDir, "correct horse battery staple", {
      kdf: TEST_KDF,
    });
    await vault.lock();

    const app = buildApp({ config });
    try {
      const response = await app.inject({ method: "GET", url: "/api/vault/status" });
      const body = response.json<{ state: string; vaultExists: boolean }>();
      expect(body).toMatchObject({ state: "locked", vaultExists: true });
    } finally {
      await app.close();
    }
  });

  it("reports no vault on an empty deployment", async () => {
    const { config } = makeConfig();
    const app = buildApp({ config });
    try {
      const response = await app.inject({ method: "GET", url: "/api/vault/status" });
      expect(response.json<{ state: string; vaultExists: boolean }>()).toMatchObject({
        state: "locked",
        vaultExists: false,
      });
    } finally {
      await app.close();
    }
  });
});

/**
 * Regression: the server serves the web app itself, so a browser calling the
 * unlock endpoint sends the server's own origin. That must be trusted even when
 * no extra origin is configured.
 */
describe("origin validation", () => {
  it("accepts the server's own origin with an empty allow-list", async () => {
    const { config } = makeConfig();
    expect(config.allowedOrigin).toBe("");
    const harness = await startHarness(config);
    try {
      const response = await harness.app.inject({
        method: "POST",
        url: "/api/vault/lock",
        headers: {
          cookie: harness.client.cookie,
          "x-flowly-csrf": harness.client.csrf,
          host: "127.0.0.1:8787",
          origin: "http://127.0.0.1:8787",
        },
        payload: { scope: "current" },
      });
      expect(response.statusCode).toBe(200);
    } finally {
      await harness.close();
    }
  });

  it("accepts the origin behind a trusted HTTPS proxy", async () => {
    const { config } = makeConfig({ trustProxy: true });
    const harness = await startHarness(config);
    try {
      const response = await harness.app.inject({
        method: "POST",
        url: "/api/vault/lock",
        headers: {
          cookie: harness.client.cookie,
          "x-flowly-csrf": harness.client.csrf,
          host: "localhost:8443",
          "x-forwarded-proto": "https",
          origin: "https://localhost:8443",
        },
        payload: { scope: "current" },
      });
      expect(response.statusCode).toBe(200);
    } finally {
      await harness.close();
    }
  });

  it("still rejects a foreign origin and honours a configured extra origin", async () => {
    const { config } = makeConfig({ allowedOrigin: "http://127.0.0.1:5173" });
    const harness = await startHarness(config);
    try {
      const foreign = await harness.app.inject({
        method: "POST",
        url: "/api/vault/lock",
        headers: {
          cookie: harness.client.cookie,
          "x-flowly-csrf": harness.client.csrf,
          host: "127.0.0.1:8787",
          origin: "http://evil.example",
        },
        payload: { scope: "current" },
      });
      expect(foreign.statusCode).toBe(403);
      expect(foreign.json<{ error: string }>().error).toBe("origin_not_allowed");

      const devServer = await harness.app.inject({
        method: "POST",
        url: "/api/vault/lock",
        headers: {
          cookie: harness.client.cookie,
          "x-flowly-csrf": harness.client.csrf,
          host: "127.0.0.1:8787",
          origin: "http://127.0.0.1:5173",
        },
        payload: { scope: "current" },
      });
      expect(devServer.statusCode).toBe(200);
    } finally {
      await harness.close();
    }
  });
});
