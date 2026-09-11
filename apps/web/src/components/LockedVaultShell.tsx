import type { VaultStatus } from "@flowly/web-contracts";

export interface LockedVaultShellProps {
  status: VaultStatus | undefined;
  loading: boolean;
  error: string | undefined;
}

export function LockedVaultShell({ status, loading, error }: LockedVaultShellProps) {
  return (
    <main className="shell" aria-labelledby="shell-title">
      <p className="brand">💸 Flowly</p>
      <h1 id="shell-title">{status?.state === "unlocked" ? "Vault unlocked" : "Vault locked"}</h1>
      <p className="lead">
        Your money, your device, your keys. The vault stays locked until you unlock it with your
        passphrase, and nothing readable lives on disk until then.
      </p>

      {loading ? (
        <p role="status" aria-live="polite">
          Checking the vault…
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}

      <form
        className="unlock"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label htmlFor="passphrase">Passphrase</label>
        <input
          id="passphrase"
          name="passphrase"
          type="password"
          autoComplete="current-password"
          disabled
          aria-describedby="unlock-note"
        />
        <button type="submit" disabled>
          Unlock vault
        </button>
        <small id="unlock-note">
          Unlock, sessions and auto-lock arrive with the Phase 2 vault.
        </small>
      </form>

      <dl className="status">
        <div>
          <dt>State</dt>
          <dd>{status?.state ?? "unknown"}</dd>
        </div>
        <div>
          <dt>Storage engine</dt>
          <dd>{status?.storageEngine ?? "unknown"}</dd>
        </div>
        <div>
          <dt>Vault format</dt>
          <dd>{status ? `v${status.vaultFormatVersion}` : "unknown"}</dd>
        </div>
        <div>
          <dt>Export format</dt>
          <dd>{status ? `v${status.exportFormatVersion}` : "unknown"}</dd>
        </div>
      </dl>

      <footer>
        No account. No cloud. No tracking. Everything stays on your self-hosted server.
      </footer>
    </main>
  );
}
