import { useState } from "react";
import type { VaultStatus } from "@flowly/web-contracts";
import { Icon } from "./icons.js";
import { Banner } from "./ui.js";

/** The card greets the hour, without pretending to know who is reading. */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

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
  const [revealed, setRevealed] = useState(false);
  const missingVault =
    status?.vaultExists === false || (error?.includes("No vault exists") ?? false);

  return (
    <div className="unlock-layout">
      <div className="unlock-brand">
        <span className="brand-tile" aria-hidden="true">
          <img src="/logo-mark-mono.svg" alt="" width={9} height={17} />
        </span>
        <img className="brand-wordmark" src="/logo-wordmark.svg" alt="Flowly" height={19} />
      </div>

      <main className="unlock-card" aria-labelledby="shell-title">
        <div className="unlock-head">
          <span className="tile vault" aria-hidden="true">
            <Icon name="lock" size={18} />
          </span>
          <div>
            <p className="eyebrow">{missingVault ? "First run" : "Private vault"}</p>
            <p className="unlock-greeting">
              {missingVault ? "No vault on this server yet" : `${greeting()}, this vault is locked`}
            </p>
          </div>
        </div>

        <h1 id="shell-title" className="display-headline">
          {missingVault ? "Create your vault" : "Welcome back."}
        </h1>

        <p className="lead">
          Your money stays on this device. Enter your passphrase to open the encrypted vault.
        </p>

        {notice ? <Banner tone="neutral">{notice}</Banner> : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onClearError();
            void (missingVault ? onCreate(passphrase) : onUnlock(passphrase));
          }}
        >
          <label htmlFor="passphrase">Vault passphrase</label>
          <div className="secret-field">
            <input
              id="passphrase"
              name="passphrase"
              type={revealed ? "text" : "password"}
              autoComplete={missingVault ? "new-password" : "current-password"}
              placeholder="Enter your passphrase"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              aria-describedby="unlock-note"
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={revealed ? "Hide passphrase" : "Show passphrase"}
              aria-pressed={revealed}
              onClick={() => setRevealed((current) => !current)}
            >
              <Icon name="eye" size={16} />
            </button>
          </div>
          <button type="submit" className="btn primary" disabled={busy || passphrase.length === 0}>
            {missingVault ? "Create vault" : "Unlock vault"}
            <Icon name="arrow" size={16} />
          </button>
          <small id="unlock-note" className="muted">
            There is no passphrase recovery. If you lose it, the vault stays locked forever.
          </small>
        </form>

        {error ? <Banner tone="error">{error}</Banner> : null}

        <div className="unlock-trust">
          <span>
            <Icon name="shield" size={15} />
            AES-256, encrypted locally
          </span>
          <span>
            <Icon name="lock" size={15} />
            No cloud, we never see the key
          </span>
        </div>
      </main>
    </div>
  );
}
