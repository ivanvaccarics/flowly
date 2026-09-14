import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { call, makeConfig, startHarness } from "./helpers/api.js";
import { cleanup, tempDir } from "./helpers/test-utils.js";

function buildWebBundle(): string {
  const dir = tempDir("flowly-web-");
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(
    join(dir, "index.html"),
    '<!doctype html><html lang="en"><head><title>Flowly</title></head><body><div id="root"></div></body></html>',
  );
  writeFileSync(join(dir, "assets", "app.js"), "console.log('flowly');");
  return dir;
}

describe("deployment surface", () => {
  it("serves the built web app on the same origin with an SPA fallback", async () => {
    const webDir = buildWebBundle();
    const { config } = makeConfig({ webDir });
    const harness = await startHarness(config);
    try {
      const index = await call(harness.app, undefined, { method: "GET", url: "/" });
      expect(index.statusCode).toBe(200);
      expect(index.headers["content-type"]).toContain("text/html");
      expect(index.body).toContain("<title>Flowly</title>");
      expect(index.headers["content-security-policy"]).toContain("default-src 'self'");
      expect(index.headers["x-content-type-options"]).toBe("nosniff");
      expect(index.headers["x-frame-options"]).toBe("DENY");

      const asset = await call(harness.app, undefined, {
        method: "GET",
        url: "/assets/app.js",
      });
      expect(asset.statusCode).toBe(200);
      expect(asset.body).toContain("flowly");

      // Client-side routes fall back to the shell, the API keeps returning JSON.
      const deepLink = await call(harness.app, undefined, {
        method: "GET",
        url: "/some/client/route",
      });
      expect(deepLink.statusCode).toBe(200);
      expect(deepLink.body).toContain('<div id="root"></div>');

      // The bank's redirect is a server route, not a shell route: it completes
      // the handshake without needing a session on that origin.
      const callback = await call(harness.app, undefined, {
        method: "GET",
        url: "/enablebanking/auth_callback",
      });
      expect(callback.statusCode).toBe(400);
      expect(callback.headers["content-type"]).toContain("text/html");
      expect(callback.body).toContain("Authorization failed");

      const api404 = await call(harness.app, harness.client, { method: "GET", url: "/api/nope" });
      expect(api404.statusCode).toBe(404);
      expect(api404.json<{ error: string }>().error).toBe("not_found");
    } finally {
      await harness.close();
      cleanup(webDir);
    }
  });

  it("keeps working as an API-only service when no bundle is present", async () => {
    const { config } = makeConfig({ webDir: join(tempDir("flowly-missing-"), "dist") });
    const harness = await startHarness(config);
    try {
      const response = await call(harness.app, undefined, { method: "GET", url: "/" });
      expect(response.statusCode).toBe(404);
      expect(response.json<{ error: string }>().error).toBe("not_found");
      const health = await call(harness.app, undefined, { method: "GET", url: "/api/health" });
      expect(health.statusCode).toBe(200);
      expect(health.headers["referrer-policy"]).toBe("no-referrer");
    } finally {
      await harness.close();
    }
  });

  it("reports system information without leaking anything sensitive", async () => {
    const { config } = makeConfig();
    const harness = await startHarness(config);
    try {
      const response = await call(harness.app, undefined, {
        method: "GET",
        url: "/api/system/info",
      });
      expect(response.statusCode).toBe(200);
      const info = response.json<Record<string, unknown>>();
      expect(info["version"]).toMatch(/^\d+\.\d+\.\d+$/);
      expect(info["schemaVersion"]).toBeGreaterThanOrEqual(2);
      expect(info["storageEngine"]).toBe("sqlcipher");
      expect(info["vaultFormatVersion"]).toBe(1);
      expect(Object.keys(info)).not.toContain("passphrase");
      expect(JSON.stringify(info)).not.toContain(config.vaultDir);
    } finally {
      await harness.close();
    }
  });
});
