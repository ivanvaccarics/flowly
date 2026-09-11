import { useState } from "react";
import type { VaultStatus } from "@flowly/web-contracts";

export interface UnlockScreenProps {
  status: VaultStatus | undefined;
  busy: boolean;
  error: string | undefined;
  onUnlock: (passphrase: string) => Promise<boolean>;
  onCreate: (passphrase: string) => Promise<boolean>;
  onClearError: () => void;
}

export function UnlockScreen({
  status,
  busy,
  error,
  onUnlock,
  onCreate,
  onClearError,
}: UnlockScreenProps) {
  const [passphrase, setPassphrase] = useState("");
  const missingVault = error?.includes("No vault exists") ?? false;

  return (
    <main className="shell" aria-labelledby="shell-title">
      <p className="brand">💸 Flowly</p>
      <h1 id="shell-title">{missingVault ? "Create your vault" : "Vault locked"}</h1>
      <p className="lead">
        Your money, your device, your keys. Everything is encrypted on your own server and stays
        unreadable until you unlock it.
      </p>

      <form
        className="unlock"
        onSubmit={(event) => {
          event.preventDefault();
          onClearError();
          void (missingVault ? onCreate(passphrase) : onUnlock(passphrase));
        }}
      >
        <label htmlFor="passphrase">Passphrase</label>
        <input
          id="passphrase"
          name="passphrase"
          type="password"
          autoComplete={missingVault ? "new-password" : "current-password"}
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          aria-describedby="unlock-note"
        />
        <button type="submit" disabled={busy || passphrase.length === 0}>
          {missingVault ? "Create vault" : "Unlock vault"}
        </button>
        <small id="unlock-note">
          There is no passphrase recovery. If you lose it, the vault stays locked forever.
        </small>
      </form>

      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}

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
      </dl>

      <footer>
        No account. No cloud. No tracking. Everything stays on your self-hosted server.
      </footer>
    </main>
  );
}
