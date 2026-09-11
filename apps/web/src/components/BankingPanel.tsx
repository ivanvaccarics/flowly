import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account } from "@flowly/web-contracts";
import {
  api,
  type AspspSummary,
  type BankingConfigInput,
  type BankAccountMappingInput,
  type BankLinkSummary,
} from "../api/client.js";
import { useBanking } from "../hooks/use-banking.js";
import { BankAccountMapping, type DiscoveredAccount } from "./BankAccountMapping.js";
import { Icon } from "./icons.js";
import { Banner, Chip, Empty } from "./ui.js";
import { formatMoney } from "../lib/money.js";

const STATUS_LABEL: Record<BankLinkSummary["status"], string> = {
  pending: "waiting for the bank",
  authorized: "connected",
  expired: "consent expired",
  revoked: "consent revoked",
  failed: "authorization failed",
  closed: "closed",
};

export function BankingPanel({ csrf }: { csrf: string }) {
  const banking = useBanking(csrf, true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [aspsps, setAspsps] = useState<AspspSummary[] | undefined>(undefined);
  const [country, setCountry] = useState("IT");
  const [psuType, setPsuType] = useState<"personal" | "business">("personal");
  const [notice, setNotice] = useState<string | undefined>(undefined);

  const loadAccounts = useCallback(async () => {
    try {
      const response = await api.list<Account>("accounts");
      setAccounts(response.items.filter((account) => !account.archivedAt));
    } catch {
      // The mapping form simply offers account creation when the list fails.
    }
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  useEffect(() => {
    const connection = banking.status?.connection;
    if (connection) {
      setCountry(connection.country);
      setPsuType(connection.psuType);
    }
  }, [banking.status?.connection]);

  const configured = banking.status?.configured ?? false;
  const links = banking.status?.links ?? [];

  async function loadBanks() {
    const response = await banking.run(() => api.listAspsps({ country, psuType }));
    if (response) setAspsps(response.items);
  }

  async function connect(aspsp: AspspSummary) {
    const started = await banking.run(() =>
      api.startBankingAuthorization(csrf, {
        aspspName: aspsp.name,
        aspspCountry: aspsp.country,
        psuType,
      }),
    );
    if (!started) return;
    // The bank takes over from here and redirects back to the callback URL.
    window.location.assign(started.url);
  }

  async function mapAccount(
    link: BankLinkSummary,
    providerAccountUid: string,
    body: BankAccountMappingInput,
  ) {
    const result = await banking.run(() =>
      api.mapBankAccount(csrf, link.id, { providerAccountUid, ...body }),
    );
    if (result) {
      await loadAccounts();
      setNotice(`Bank account ${body.mode === "ignore" ? "ignored" : "linked"}.`);
    }
  }

  const sandboxHint = useMemo(() => {
    const users = aspsps?.flatMap((aspsp) => aspsp.sandboxUsers).filter((user) => user.username);
    return users && users.length > 0 ? users[0] : undefined;
  }, [aspsps]);

  return (
    <div className="card">
      <header>
        <div>
          <h2>Connect to Enable Banking</h2>
          <span className="sub">
            Pull your bank's accounts and transactions into this vault. The private key stays on
            this server, encrypted inside the vault.
          </span>
        </div>
        <Chip tone={configured ? "income" : "neutral"} icon="bank">
          {configured ? (banking.status?.connection?.appName ?? "configured") : "not connected"}
        </Chip>
      </header>

      {banking.error ? <Banner tone="error">{banking.error}</Banner> : null}
      {notice ? <Banner tone="ok">{notice}</Banner> : null}

      {configured ? (
        <ConfiguredSummary
          fingerprint={banking.status?.connection?.keyFingerprint ?? ""}
          appId={banking.status?.connection?.appId ?? ""}
          environment={banking.status?.connection?.environment ?? "SANDBOX"}
          redirectUrl={banking.status?.connection?.redirectUrl ?? ""}
          autoSync={banking.status?.connection?.autoSync ?? true}
          busy={banking.busy}
          country={country}
          psuType={psuType}
          onCountry={setCountry}
          onPsuType={setPsuType}
          onToggleAutoSync={(autoSync) =>
            void banking.run(() =>
              api.saveBankingConfig(csrf, {
                appId: banking.status?.connection?.appId ?? "",
                redirectUrl: banking.status?.connection?.redirectUrl ?? "",
                environment: banking.status?.connection?.environment ?? "SANDBOX",
                psuType,
                country,
                autoSync,
              }),
            )
          }
        />
      ) : (
        <ConnectionForm
          busy={banking.busy}
          onSave={(input) =>
            void banking
              .run(() => api.saveBankingConfig(csrf, input))
              .then((saved) => {
                if (saved)
                  setNotice(`Connected to ${saved.connection.appName ?? saved.connection.appId}.`);
              })
          }
        />
      )}

      {configured ? (
        <div className="card">
          <header>
            <div>
              <h3>Your banks</h3>
              <span className="sub">Every connected bank refreshes on login, and on demand.</span>
            </div>
            <button
              type="button"
              className="btn small"
              disabled={banking.busy}
              onClick={() => void loadBanks()}
            >
              <Icon name="bank" size={14} />
              Load available banks
            </button>
          </header>

          <div className="fieldset framed">
            <label>
              Country
              <input
                value={country}
                maxLength={2}
                onChange={(event) => setCountry(event.target.value.toUpperCase())}
                placeholder="IT"
              />
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
          </div>

          {aspsps ? (
            aspsps.length === 0 ? (
              <Empty>No bank in this country offers account information.</Empty>
            ) : (
              <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {aspsps.map((aspsp) => (
                  <li key={`${aspsp.country}-${aspsp.name}`} className="tile">
                    <header className="rule-tile-head">
                      <div className="stack">
                        <strong>{aspsp.name}</strong>
                        <span className="sub">
                          {aspsp.country}
                          {aspsp.bic ? ` · ${aspsp.bic}` : ""}
                          {aspsp.maximumConsentDays
                            ? ` · consent up to ${aspsp.maximumConsentDays} days`
                            : ""}
                        </span>
                      </div>
                      <div className="cell-actions">
                        {aspsp.beta ? <Chip tone="neutral">beta</Chip> : null}
                        <button
                          type="button"
                          className="btn small primary"
                          disabled={banking.busy}
                          onClick={() => void connect(aspsp)}
                        >
                          <Icon name="plus" size={14} />
                          Connect
                        </button>
                      </div>
                    </header>
                  </li>
                ))}
              </ul>
            )
          ) : null}
          {sandboxHint ? (
            <p className="muted">
              Sandbox login: <span className="mono">{sandboxHint.username}</span> /{" "}
              <span className="mono">{sandboxHint.password}</span>
              {sandboxHint.otp ? (
                <>
                  {" "}
                  · OTP <span className="mono">{sandboxHint.otp}</span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}

      {links.length > 0 ? (
        <div className="stack">
          {links.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              accounts={accounts}
              busy={banking.busy}
              onSync={() =>
                void banking
                  .run(() => api.syncBanking(csrf, link.id))
                  .then((result) => {
                    if (result) {
                      setNotice(
                        `Sync finished: ${result.report.created} new, ${result.report.updated} updated.`,
                      );
                      void loadAccounts();
                    }
                  })
              }
              onUnlink={() =>
                void banking
                  .run(() => api.unlinkBank(csrf, link.id))
                  .then((result) => {
                    if (result) setNotice("Bank unlinked. Imported transactions were kept.");
                  })
              }
              onMap={(uid, body) => mapAccount(link, uid, body).then(() => undefined)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ConfiguredSummary({
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
  onToggleAutoSync,
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
  onToggleAutoSync: (value: boolean) => void;
}) {
  return (
    <div className="fieldset framed">
      <p className="muted">
        Application <span className="mono">{appId}</span> · {environment} · key{" "}
        <span className="mono">{fingerprint.slice(0, 12)}…</span>
      </p>
      <p className="muted">
        Callback URL <span className="mono">{redirectUrl}</span>
      </p>
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
    </div>
  );
}

function ConnectionForm({
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
  const [autoSync, setAutoSync] = useState(true);

  return (
    <div className="fieldset framed">
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
        <span className="sub">
          {keyName === "" ? "Choose the .pem private key you downloaded" : keyName}
        </span>
        <label>
          Private key (.pem)
          <input
            type="file"
            accept=".pem,application/x-pem-file,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setKeyName(file.name);
              void file.text().then(setPrivateKeyPem);
            }}
          />
        </label>
      </div>
      <label>
        Callback URL
        <input value={redirectUrl} onChange={(event) => setRedirectUrl(event.target.value)} />
      </label>
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
      <p className="muted">
        The key is verified against Enable Banking and then stored only inside this encrypted vault.
        It is never written to a plain file and never returned to the browser.
      </p>
    </div>
  );
}

function LinkCard({
  link,
  accounts,
  busy,
  onSync,
  onUnlink,
  onMap,
}: {
  link: BankLinkSummary;
  accounts: Account[];
  busy: boolean;
  onSync: () => void;
  onUnlink: () => void;
  onMap: (uid: string, body: BankAccountMappingInput) => Promise<void>;
}) {
  const pending = link.accounts.filter(
    (account) => account.status === "unmapped" || account.status === "ignored",
  );
  const discovered: DiscoveredAccount[] = pending.map((account) => ({
    providerAccountUid: account.providerAccountUid,
    status: account.status,
    suggestedName: account.providerName ?? account.accountName ?? `${link.aspspName} account`,
    suggestedType: "checking",
    ...(account.currency
      ? { suggestedCurrency: account.currency, currency: account.currency }
      : {}),
    ...(account.maskedIban ? { maskedIban: account.maskedIban } : {}),
    ...(account.providerName ? { providerName: account.providerName } : {}),
    ...(account.cashAccountType ? { cashAccountType: account.cashAccountType } : {}),
  }));

  return (
    <section className="tile" style={{ marginTop: 8 }}>
      <header className="rule-tile-head">
        <div className="stack">
          <strong>{link.aspspName}</strong>
          <span className="sub">
            {link.aspspCountry} · {STATUS_LABEL[link.status]}
            {link.lastSyncedAt ? ` · last sync ${formatStamp(link.lastSyncedAt)}` : ""}
          </span>
        </div>
        <div className="cell-actions">
          <Chip tone={link.status === "authorized" ? "income" : "expense"}>
            {STATUS_LABEL[link.status]}
          </Chip>
          <button type="button" className="btn small" disabled={busy} onClick={onSync}>
            <Icon name="refresh" size={14} />
            Sync now
          </button>
          <button type="button" className="btn small danger" disabled={busy} onClick={onUnlink}>
            <Icon name="trash" size={14} />
            Unlink
          </button>
        </div>
      </header>

      {link.lastSyncError ? <Banner tone="error">{link.lastSyncError}</Banner> : null}

      {link.accounts.length > 0 ? (
        <div className="table-wrap">
          <table>
            <caption className="sub">Accounts shared by this bank</caption>
            <thead>
              <tr>
                <th scope="col">Bank account</th>
                <th scope="col">Flowly account</th>
                <th scope="col">Balance</th>
                <th scope="col">Transactions</th>
              </tr>
            </thead>
            <tbody>
              {link.accounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    {account.providerName ?? account.maskedIban ?? account.providerAccountUid}
                  </td>
                  <td>{account.accountName ?? "not paired"}</td>
                  <td>
                    {account.lastBalanceMinor !== undefined && account.lastBalanceCurrency
                      ? formatMoney(account.lastBalanceMinor, account.lastBalanceCurrency)
                      : "—"}
                  </td>
                  <td>{account.transactionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No accounts were shared by this bank.</Empty>
      )}

      {discovered.length > 0 ? (
        <div className="stack">
          <p className="sub">
            Choose what to do with the accounts the bank shared. Nothing is imported until you
            decide.
          </p>
          <BankAccountMapping
            link={link}
            discovered={discovered}
            accounts={accounts}
            busy={busy}
            onMap={onMap}
          />
        </div>
      ) : null}
    </section>
  );
}

function formatStamp(value: string): string {
  return new Date(value).toISOString().replace("T", " ").slice(0, 16);
}
