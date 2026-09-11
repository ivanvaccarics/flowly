import { describe, expect, it } from "vitest";
import { ConfigError, checkFrontendSecrets, checkPrivateBind, loadConfig } from "../src/config.js";

describe("server configuration", () => {
  it("applies private-network defaults", () => {
    const config = loadConfig({});
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(8787);
    expect(config.storageEngine).toBe("sqlcipher");
    expect(config.allowedOrigin).toBe("http://127.0.0.1:5173");
    expect(config.vaultDir).toBe("./data/vault");
  });

  it("rejects invalid values with readable issues", () => {
    expect(() => loadConfig({ FLOWLY_PORT: "0" })).toThrow(ConfigError);
    expect(() => loadConfig({ FLOWLY_STORAGE_ENGINE: "plaintext" })).toThrow(
      /FLOWLY_STORAGE_ENGINE/,
    );
    expect(() => loadConfig({ NODE_ENV: "staging" })).toThrow(ConfigError);
  });

  it("refuses to expose the service to every interface by default", () => {
    expect(() => loadConfig({ FLOWLY_HOST: "0.0.0.0" })).toThrow(/FLOWLY_HOST=0.0.0.0/);
    expect(checkPrivateBind("0.0.0.0", { FLOWLY_ALLOW_PUBLIC_BIND: "true" })).toEqual([]);
    expect(checkPrivateBind("192.168.1.10")).toEqual([]);
    expect(checkPrivateBind("127.0.0.1")).toEqual([]);
  });

  it("blocks secret-looking frontend variables", () => {
    expect(checkFrontendSecrets({ VITE_API_SECRET: "x" })).toHaveLength(1);
    expect(checkFrontendSecrets({ VITE_PASSPHRASE: "x" })).toHaveLength(1);
    expect(checkFrontendSecrets({ VITE_API_BASE_URL: "http://127.0.0.1:8787" })).toEqual([]);
    expect(() => loadConfig({ VITE_SESSION_TOKEN: "leak" })).toThrow(ConfigError);
  });

  it("accepts the fallback storage engine for development", () => {
    const config = loadConfig({ FLOWLY_STORAGE_ENGINE: "record-encryption" });
    expect(config.storageEngine).toBe("record-encryption");
  });
});
