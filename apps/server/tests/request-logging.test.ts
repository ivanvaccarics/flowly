import { execFile as execFileCallback } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);

async function requestLogs(method: string, url: string): Promise<string> {
  const appUrl = new URL("../src/api/app.ts", import.meta.url).href;
  const configUrl = new URL("../src/config.ts", import.meta.url).href;
  const script = `
      import { buildApp } from ${JSON.stringify(appUrl)};
      import { loadConfig } from ${JSON.stringify(configUrl)};
      const config = loadConfig({
        NODE_ENV: "test",
        FLOWLY_HOST: "127.0.0.1",
        FLOWLY_PORT: "8787",
        FLOWLY_VAULT_DIR: "/tmp/flowly-request-logging-test",
        FLOWLY_STORAGE_ENGINE: "record-encryption",
        FLOWLY_LOG_LEVEL: "info",
      });
      const app = buildApp({ config });
      await app.inject({
        method: ${JSON.stringify(method)},
        url: ${JSON.stringify(url)},
      });
      await app.close();
    `;

  const { stdout, stderr } = await execFile(
    process.execPath,
    ["--experimental-sqlite", "--import", "tsx", "--input-type=module", "-e", script],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  return `${stdout}${stderr}`;
}

describe("request logging", () => {
  it("keeps callback credentials out of request logs", async () => {
    const code = "FLOWLY_SYNTHETIC_CODE_MARKER_93841";
    const state = "FLOWLY_SYNTHETIC_STATE_MARKER_52719";
    const logs = await requestLogs(
      "GET",
      `/enablebanking/auth_callback?code=${code}&state=${state}`,
    );

    expect(logs).toContain("/enablebanking/auth_callback");
    expect(logs).not.toContain("?");
    expect(logs).not.toContain(code);
    expect(logs).not.toContain(state);
  });

  it("keeps query strings out of not-found logs", async () => {
    const query = "FLOWLY_SYNTHETIC_404_MARKER_48150";
    const logs = await requestLogs("DELETE", `/missing?query=${query}`);

    expect(logs).toContain('"url":"/missing"');
    expect(logs).not.toContain("?");
    expect(logs).not.toContain(query);
  });

  it("skips the bank callback in the proxy access log", () => {
    const caddyfile = readFileSync(
      new URL("../../../deployment/self-hosted/Caddyfile", import.meta.url),
      "utf8",
    );

    expect(caddyfile).toMatch(/@bankCallback\s+path\s+\/enablebanking\/auth_callback/);
    expect(caddyfile).toMatch(/log_skip\s+@bankCallback/);
  });
});
