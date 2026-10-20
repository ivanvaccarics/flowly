import { useState } from "react";
import type { BankingConfigInput } from "../api/client.js";
import { callbackMismatch, currentCallbackUrl } from "./banking-callback.js";
import { Icon } from "./icons.js";
import { Banner, FileField } from "./ui.js";

/**
 * The stored application once it exists: the non-secret facts, the callback
 * check and the uncommon settings behind disclosures.
 */
export function BankingConnectionSettings({
  fingerprint,
  appId,
  environment,
  redirectUrl,
  autoSync,
  busy,
  country,
  psuType,
  onCountry,
  onPsuType,
  onDisconnect,
  onToggleAutoSync,
  onSaveRedirectUrl,
}: {
  fingerprint: string;
  appId: string;
  environment: string;
  redirectUrl: string;
  autoSync: boolean;
  busy: boolean;
  country: string;
  psuType: "personal" | "business";
  onCountry: (value: string) => void;
  onPsuType: (value: "personal" | "business") => void;
  onDisconnect: () => void;
  onToggleAutoSync: (value: boolean) => void;
  onSaveRedirectUrl: (url: string) => void;
}) {
  const [draft, setDraft] = useState(redirectUrl);
  const mismatch = callbackMismatch(draft);
  const addressInUse = currentCallbackUrl();

  return (
    <div className="stack">
      <dl className="facts" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <dt>Application</dt>
          <dd className="mono" title={appId}>
            {appId.slice(0, 18)}…
          </dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{environment}</dd>
        </div>
        <div>
          <dt>Key fingerprint</dt>
          <dd className="mono">{fingerprint.slice(0, 12)}…</dd>
        </div>
        <div>
          <dt>Callback URL</dt>
          <dd className="mono" title={redirectUrl}>
            {redirectUrl.replace(/^https?:\/\//, "")}
          </dd>
        </div>
      </dl>

      {mismatch ? (
        <Banner tone="error">
          {mismatch} Register one of the two addresses in the Enable Banking control panel, or
          publish Flowly on the port your callback URL uses.
        </Banner>
      ) : (
        <Banner tone="ok">
          The callback URL matches the address you are using, so the bank can send you back here.
        </Banner>
      )}

      <div className="fieldset framed">
        <label>
          Callback URL
          <input value={draft} onChange={(event) => setDraft(event.target.value)} />
        </label>
        <div className="cell-actions" style={{ justifyContent: "flex-start" }}>
          <button
            type="button"
            className="btn small"
            disabled={busy || draft.trim() === "" || draft === redirectUrl}
            onClick={() => onSaveRedirectUrl(draft.trim())}
          >
            <Icon name="check" size={14} />
            Save callback URL
          </button>
          <button
            type="button"
            className="btn small"
            disabled={busy || draft === addressInUse}
            onClick={() => setDraft(addressInUse)}
          >
            Use the address I am using now
          </button>
        </div>
        <p className="muted">
          The bank sends your browser here after you approve the consent, so this must be one of the
          application's redirect URLs <em>and</em> an address this browser can open — including the
          port. Saving re-verifies it with Enable Banking and keeps the private key.
        </p>
      </div>

      <details>
        <summary>Connection settings</summary>
        <div className="fieldset framed">
          <label>
            Default country
            <input
              value={country}
              maxLength={2}
              onChange={(event) => onCountry(event.target.value.toUpperCase())}
            />
          </label>
          <label>
            PSU type
            <select
              value={psuType}
              onChange={(event) => onPsuType(event.target.value as "personal" | "business")}
            >
              <option value="personal">personal</option>
              <option value="business">business</option>
            </select>
          </label>
          <label className="checkline">
            <input
              type="checkbox"
              checked={autoSync}
              disabled={busy}
              onChange={(event) => onToggleAutoSync(event.target.checked)}
            />
            Refresh my banks every time I unlock the vault
          </label>
          <p className="muted">
            Off by default. Banks grant only a few unattended reads per day and per account, so a
            vault that unlocks often can spend the whole day's budget; when that happens Flowly
            stops asking and waits before it tries again. <strong>Sync now</strong> on the dashboard
            pulls the same data on demand.
          </p>
        </div>
      </details>

      <details>
        <summary>Disconnect or remove the connection</summary>
        <div className="fieldset framed">
          <p className="muted">
            Disconnecting removes the stored application key and every bank link, and asks the bank
            to revoke the consent. Transactions already imported stay in your vault.
          </p>
          <button type="button" className="btn danger" disabled={busy} onClick={onDisconnect}>
            <Icon name="trash" size={16} />
            Disconnect Enable Banking
          </button>
        </div>
      </details>
    </div>
  );
}

export function BankingConnectionForm({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (input: BankingConfigInput) => void;
}) {
  const [appId, setAppId] = useState("");
  const [privateKeyPem, setPrivateKeyPem] = useState("");
  const [keyName, setKeyName] = useState("");
  const [redirectUrl, setRedirectUrl] = useState(
    typeof window === "undefined" ? "" : `${window.location.origin}/enablebanking/auth_callback`,
  );
  const [environment, setEnvironment] = useState<"SANDBOX" | "PRODUCTION">("SANDBOX");
  const [psuType, setPsuType] = useState<"personal" | "business">("personal");
  const [country, setCountry] = useState("IT");
  const [autoSync, setAutoSync] = useState(false);

  return (
    <div className="stack">
      <p className="muted">
        Flowly needs an application registered in the Enable Banking control panel: its application
        id, the <span className="mono">.pem</span> key you download once, and a callback URL
        registered among that application's redirect URLs. Everything below stays in this browser
        until you press <strong>Verify and save</strong>.
      </p>

      <div className="option-grid">
        <section className="option-card">
          <h3>
            <Icon name="bank" size={18} />1 · The application
          </h3>
          <label>
            Enable Banking application ID
            <input
              value={appId}
              onChange={(event) => setAppId(event.target.value)}
              placeholder="11111111-1111-4111-8111-111111111111"
              autoComplete="off"
            />
          </label>
          <div className="dropzone">
            <Icon name="lock" size={22} />
            <span className="sub">Choose the .pem private key you downloaded</span>
            <FileField
              id="bank-private-key"
              label="Private key (.pem)"
              accept=".pem,application/x-pem-file,text/plain"
              fileName={keyName === "" ? undefined : keyName}
              onFile={(file) => {
                setKeyName(file.name);
                void file.text().then(setPrivateKeyPem);
              }}
            />
          </div>
        </section>

        <section className="option-card">
          <h3>
            <Icon name="link" size={18} />2 · Where the bank sends you back
          </h3>
          <label>
            Callback URL
            <input value={redirectUrl} onChange={(event) => setRedirectUrl(event.target.value)} />
          </label>
          {callbackMismatch(redirectUrl) ? (
            <>
              <Banner tone="error">{callbackMismatch(redirectUrl)}</Banner>
              <button
                type="button"
                className="btn small"
                onClick={() => setRedirectUrl(currentCallbackUrl())}
              >
                Use the address I am using now
              </button>
            </>
          ) : (
            <Banner tone="ok">
              This matches the address you are using, so the bank can send you back here.
            </Banner>
          )}
          <p className="muted">
            Register this exact URL among the application's redirect URLs in the Enable Banking
            control panel, port included. If Flowly is published on 8443, the URL ends in
            <span className="mono"> :8443</span>.
          </p>
        </section>
      </div>

      <fieldset className="fieldset framed">
        <legend>Environment and defaults</legend>
        <label>
          Environment
          <select
            value={environment}
            onChange={(event) => setEnvironment(event.target.value as "SANDBOX" | "PRODUCTION")}
          >
            <option value="SANDBOX">SANDBOX</option>
            <option value="PRODUCTION">PRODUCTION</option>
          </select>
        </label>
        <label>
          Account type
          <select
            value={psuType}
            onChange={(event) => setPsuType(event.target.value as "personal" | "business")}
          >
            <option value="personal">personal</option>
            <option value="business">business</option>
          </select>
        </label>
        <label>
          Default country
          <input
            value={country}
            maxLength={2}
            onChange={(event) => setCountry(event.target.value.toUpperCase())}
          />
        </label>
        <label className="checkline">
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(event) => setAutoSync(event.target.checked)}
          />
          Refresh my banks every time I unlock the vault
        </label>
      </fieldset>

      <div className="cell-actions" style={{ justifyContent: "flex-start" }}>
        <button
          type="button"
          className="btn primary"
          disabled={busy || appId.trim() === "" || privateKeyPem === "" || redirectUrl === ""}
          onClick={() =>
            onSave({ appId, privateKeyPem, redirectUrl, environment, psuType, country, autoSync })
          }
        >
          <Icon name="check" size={16} />
          Verify and save
        </button>
      </div>
      <p className="muted">
        Flowly checks the key against Enable Banking and refuses a callback URL the application has
        not registered. The key then lives only inside this encrypted vault: never on a plain file,
        never in the browser.
      </p>
    </div>
  );
}
