import { useState } from "react";
import type { VaultStatus } from "@flowly/web-contracts";
import { Icon } from "./icons.js";
import { Banner, Chip } from "./ui.js";

export interface UnlockScreenProps {
  status: VaultStatus | undefined;
  busy: boolean;
  error: string | undefined;
  onUnlock: (passphrase: string) => Promise<boolean>;
  onCreate: (passphrase: string) => Promise<boolean>;
  onClearError: () => void;
  /** Extra context, for example finishing a bank authorization. */
  notice?: string;
}

export function UnlockScreen({
  status,
  busy,
  error,
  onUnlock,
  onCreate,
  onClearError,
  notice,
}: UnlockScreenProps) {
  const [passphrase, setPassphrase] = useState("");
  const missingVault =
    status?.vaultExists === false || (error?.includes("No vault exists") ?? false);

  return (
    <div className="unlock-layout">
      <main className="unlock-card" aria-labelledby="shell-title">
        <img className="logo-lockup" src="/logo.svg" alt="Flowly" width={228} height={66} />

        <div>
          <p className="eyebrow">
            {missingVault
              ? "First run · no vault on this server"
              : "Encrypted vault · local keystore"}
          </p>
          <h1 id="shell-title">{missingVault ? "Create your vault" : "Vault locked"}</h1>
        </div>

        <p className="lead">
          Your money, your device, your keys. Everything is encrypted on your own server and stays
          unreadable until you unlock it.
        </p>

        {notice ? <Banner tone="neutral">{notice}</Banner> : null}

        <form
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
          <button type="submit" className="btn primary" disabled={busy || passphrase.length === 0}>
            <Icon name="lock" size={16} />
            {missingVault ? "Create vault" : "Unlock vault"}
          </button>
          <small id="unlock-note" className="muted">
            There is no passphrase recovery. If you lose it, the vault stays locked forever.
          </small>
        </form>

        {error ? <Banner tone="error">{error}</Banner> : null}

        <dl className="facts">
          <div>
            <dt>State</dt>
            <dd>{status?.state ?? "unknown"}</dd>
          </div>
        </dl>

        <div className="cell-actions">
          <Chip tone="vault" icon="shield">
            AES-256-GCM
          </Chip>
          <Chip tone="neutral">no cloud · no tracking</Chip>
        </div>
      </main>
    </div>
  );
}
