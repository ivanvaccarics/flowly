import type { VaultStatus } from "@flowly/web-contracts";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Reads the vault state from the server. The browser never stores financial
 * data, so this response is the only thing the shell needs before unlock.
 */
export async function fetchVaultStatus(signal?: AbortSignal): Promise<VaultStatus> {
  const response = await fetch("/api/vault/status", {
    headers: { accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new ApiError(response.status, `vault status request failed with ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!isVaultStatus(payload)) {
    throw new ApiError(response.status, "vault status response did not match the contract");
  }
  return payload;
}

function isVaultStatus(value: unknown): value is VaultStatus {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate["state"] === "locked" || candidate["state"] === "unlocked") &&
    typeof candidate["vaultFormatVersion"] === "number" &&
    typeof candidate["exportFormatVersion"] === "number"
  );
}
