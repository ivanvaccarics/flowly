import { z } from "zod";

export class ConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`invalid server configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

export type StorageEngine = "sqlcipher" | "record-encryption";

export interface ServerConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  vaultDir: string;
  storageEngine: StorageEngine;
  allowedOrigin: string;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  sessionIdleMs: number;
  sessionAbsoluteMs: number;
  autoLockMs: number;
  unlockAttemptsPerMinute: number;
  trustProxy: boolean;
  webDir: string;
}

const SECRET_PATTERN = /(SECRET|TOKEN|PASSWORD|PASSPHRASE|PRIVATE|CREDENTIAL|API_?KEY)/i;
const PUBLIC_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  FLOWLY_HOST: z.string().min(1).default("127.0.0.1"),
  FLOWLY_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  FLOWLY_VAULT_DIR: z.string().min(1).default("./data/vault"),
  FLOWLY_STORAGE_ENGINE: z.enum(["sqlcipher", "record-encryption"]).default("sqlcipher"),
  /** Extra browser origin allowed to call the API; same-origin is always allowed. */
  FLOWLY_ALLOWED_ORIGIN: z.string().default(""),
  FLOWLY_LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  FLOWLY_SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  FLOWLY_SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  FLOWLY_AUTO_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(5),
  FLOWLY_UNLOCK_ATTEMPTS_PER_MINUTE: z.coerce.number().int().min(1).max(60).default(5),
  FLOWLY_TRUST_PROXY: z.coerce.boolean().default(false),
  FLOWLY_WEB_DIR: z.string().min(1).default("apps/web/dist"),
});

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`),
    );
  }

  const issues = [...checkPrivateBind(parsed.data.FLOWLY_HOST, env), ...checkFrontendSecrets(env)];
  if (issues.length > 0) throw new ConfigError(issues);

  return {
    nodeEnv: parsed.data.NODE_ENV,
    host: parsed.data.FLOWLY_HOST,
    port: parsed.data.FLOWLY_PORT,
    vaultDir: parsed.data.FLOWLY_VAULT_DIR,
    storageEngine: parsed.data.FLOWLY_STORAGE_ENGINE,
    allowedOrigin: parsed.data.FLOWLY_ALLOWED_ORIGIN,
    logLevel: parsed.data.FLOWLY_LOG_LEVEL,
    sessionIdleMs: parsed.data.FLOWLY_SESSION_IDLE_MINUTES * 60_000,
    sessionAbsoluteMs: parsed.data.FLOWLY_SESSION_ABSOLUTE_HOURS * 3_600_000,
    autoLockMs: parsed.data.FLOWLY_AUTO_LOCK_MINUTES * 60_000,
    unlockAttemptsPerMinute: parsed.data.FLOWLY_UNLOCK_ATTEMPTS_PER_MINUTE,
    trustProxy: parsed.data.FLOWLY_TRUST_PROXY,
    webDir: parsed.data.FLOWLY_WEB_DIR,
  };
}

/**
 * Flowly is a private-network service. Binding every interface needs an explicit
 * opt-in so a public exposure is never an accident.
 */
export function checkPrivateBind(host: string, env: NodeJS.ProcessEnv = {}): string[] {
  if (!PUBLIC_HOSTS.has(host)) return [];
  if (env["FLOWLY_ALLOW_PUBLIC_BIND"] === "true") return [];
  return [
    `FLOWLY_HOST=${host} would accept connections from every network. ` +
      "Bind a private interface or set FLOWLY_ALLOW_PUBLIC_BIND=true if you really mean it.",
  ];
}

/** Vite inlines VITE_* values into the shipped bundle, so secrets must never appear there. */
export function checkFrontendSecrets(env: NodeJS.ProcessEnv = {}): string[] {
  return Object.keys(env)
    .filter((key) => key.startsWith("VITE_") && SECRET_PATTERN.test(key))
    .map((key) => `${key} looks like a secret and would be embedded in the web bundle`);
}
