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
import { describeBankAuthorizationError } from "../lib/banking-errors.js";
import { formatMoney } from "../lib/money.js";

const STATUS_LABEL: Record<BankLinkSummary["status"], string> = {
  pending: "waiting for the bank",
  authorized: "connected",
  expired: "consent expired",
  revoked: "consent revoked",
  failed: "authorization failed",
  closed: "closed",
};

/** ISO 20022 balance types, in the words a person reads on a statement. */
const BALANCE_TYPE_LABEL: Record<string, string> = {
  CLBD: "booked balance",
  ITBD: "interim booked balance",
  CLAV: "available balance",
  ITAV: "interim available balance",
  OPBD: "opening booked balance",
  OPAV: "opening available balance",
  PRCD: "previous close",
  XPCD: "expected balance",
};

/**
 * Opens the bank in its own window. The panel keeps polling while the consent
 * is being approved, so the app never has to be the page the bank returns to.
 */
function openBankWindow(url: string): void {
  if (typeof window === "undefined") return;
  window.open(url, "flowly-bank-authorization", "width=600,height=760,popup=yes");
}

/** The address this browser is using right now, for callback-URL checks. */
function currentCallbackUrl(): string {
  return typeof window === "undefined"
    ? ""
    : `${window.location.origin}/enablebanking/auth_callback`;
}

/**
 * The bank sends the browser to the registered callback URL, so a hostname or
 * port that this browser cannot open never comes back. Comparing it with the
 * address in use catches the usual mistake — a port-less URL registered for a
 * stack that publishes 8443 — before the bank does.
 */
function callbackMismatch(redirectUrl: string): string | undefined {
  if (typeof window === "undefined" || redirectUrl.trim() === "") return undefined;
  let origin: string;
  try {
    origin = new URL(redirectUrl).origin;
  } catch {
    return "This is not a full URL. Register a complete https address in Enable Banking.";
  }
  if (origin === window.location.origin) return undefined;
  return `The bank will send your browser to ${origin}, but you are using ${window.location.origin} right now. That works when ${origin} opens Flowly too, because the server finishes the handshake there; if it does not, register ${window.location.origin} in the Enable Banking control panel instead.`;
}

export function BankingPanel({ csrf }: { csrf: string }) {
  const banking = useBanking(csrf, true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [aspsps, setAspsps] = useState<AspspSummary[] | undefined>(undefined);
  const [country, setCountry] = useState("IT");
  const [psuType, setPsuType] = useState<"personal" | "business">("personal");
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState<StartedAuthorization | undefined>(undefined);

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
  const waitingLink = links.find((link) => link.status === "pending");

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
    // The bank takes over in another tab, so this page - and the paste
    // fallback - survive a callback host the browser cannot reach.
    setPending({ ...started, aspspName: aspsp.name });
  }

  /**
   * Completes the authorization from the URL the browser was redirected to.
   * This is the fallback when the registered callback URL is not reachable from
   * the browser, and the only way to surface an Enable Banking error parameter.
   */
  async function completeFromRedirect(raw: string): Promise<boolean> {
    const parsed = parseRedirect(raw);
    if (parsed.error) {
      setNotice(describeBankAuthorizationError(parsed.error, parsed.description));
      return false;
    }
    if (!parsed.code || !parsed.state) {
      setNotice("That URL has no authorization code. Paste the address you were redirected to.");
      return false;
    }
    const { code, state } = { code: parsed.code, state: parsed.state };
    const result = await banking.run(() => api.completeBankingAuthorization(csrf, { code, state }));
    if (!result) return false;
    setPending(undefined);
    setNotice(
      `${result.aspsp.name} is connected. Link its accounts below${
        result.accounts.length > 0 ? ` (${result.accounts.length} shared)` : ""
      }.`,
    );
    return true;
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

  /**
   * The bank page may finish in another tab, or the user may come back to this
   * one: watch the pending link so the panel advances without a pasted URL.
   */
  useEffect(() => {
    if (!pending) return;
    const link = links.find((candidate) => candidate.id === pending.linkId);
    if (!link || link.status === "pending") return;
    setPending(undefined);
    if (link.status === "authorized") {
      setNotice(`${link.aspspName} is connected. Link its accounts below.`);
      void loadAccounts();
    } else {
      setNotice(`${link.aspspName}: ${STATUS_LABEL[link.status]}.`);
    }
  }, [pending, links, loadAccounts]);

  const waitingForBank = pending !== undefined || waitingLink !== undefined;
  useEffect(() => {
    if (!waitingForBank) return;
    const timer = window.setInterval(() => void banking.refresh(), 4_000);
    return () => window.clearInterval(timer);
  }, [waitingForBank, banking.refresh]);

  const sandboxHint = useMemo(() => {
    const users = aspsps?.flatMap((aspsp) => aspsp.sandboxUsers).filter((user) => user.username);
    return users && users.length > 0 ? users[0] : undefined;
  }, [aspsps]);

  const waiting = pending !== undefined || waitingLink !== undefined;
  const unmappedCount = links
    .flatMap((link) => link.accounts)
    .filter((account) => account.status === "unmapped").length;
  const guidance = !configured
    ? "Register an Enable Banking application, then add its application id, its .pem key and the callback URL here."
    : waiting
      ? "Finish the authorization at your bank: the panel in the next card has the link and the fallback."
      : links.length === 0
        ? "Pick your bank in the next card and press Connect."
        : unmappedCount > 0
          ? `${unmappedCount} shared account${unmappedCount === 1 ? "" : "s"} still need a decision: create, pair or ignore.`
          : `${links.length} bank${links.length === 1 ? "" : "s"} connected. Sync runs when the vault unlocks, and Sync now pulls the latest movements.`;

  return (
    <div className="stack">
      <div className="card">
        <header>
          <div>
            <h2>Connect to Enable Banking</h2>
            <span className="sub">
              Read the accounts and movements your bank shares into this vault. The private key
              stays on this server, encrypted inside the vault.
            </span>
          </div>
          <Chip tone={configured ? "income" : "neutral"} icon="bank">
            {configured ? (banking.status?.connection?.appName ?? "configured") : "not connected"}
          </Chip>
        </header>

        {banking.error ? <Banner tone="error">{banking.error}</Banner> : null}
        {notice ? <Banner tone="ok">{notice}</Banner> : null}
        <Banner>
          <strong>Next:</strong> {guidance}
        </Banner>

        {configured ? (
          <ConnectionSettings
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
            onSaveRedirectUrl={(url) => {
              void banking
                .run(() =>
                  api.saveBankingConfig(csrf, {
                    appId: banking.status?.connection?.appId ?? "",
                    redirectUrl: url,
                    environment: banking.status?.connection?.environment ?? "SANDBOX",
                    psuType,
                    country,
                    autoSync: banking.status?.connection?.autoSync ?? true,
                  }),
                )
                .then((saved) => {
                  if (saved) setNotice("Callback URL saved and verified against Enable Banking.");
                });
            }}
            onDisconnect={() => {
              const confirmed = window.confirm(
                "Disconnect Enable Banking? The stored application key and every bank link are removed. Imported transactions stay in your vault.",
              );
              if (!confirmed) return;
              void banking
                .run(() => api.deleteBankingConfig(csrf))
                .then((result) => {
                  if (!result) return;
                  setPending(undefined);
                  setAspsps(undefined);
                  setNotice(
                    `Enable Banking disconnected${
                      result.deletedLinks > 0 ? `, ${result.deletedLinks} bank link(s) removed` : ""
                    }. Imported transactions were kept.`,
                  );
                });
            }}
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
                    setNotice(
                      `Connected to ${saved.connection.appName ?? saved.connection.appId}.`,
                    );
                })
            }
          />
        )}
      </div>

      {configured ? (
        <div className="card">
          <header>
            <div>
              <h3>Connect a bank</h3>
              <span className="sub">
                {waiting
                  ? "Finish the authorization, then decide how the shared accounts map."
                  : "Choose the country and the account type, then find your bank by name or BIC."}
              </span>
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

          {waiting ? (
            <PendingAuthorization
              pending={pending}
              link={waitingLink}
              busy={banking.busy}
              onComplete={completeFromRedirect}
              onCancel={() => setPending(undefined)}
            />
          ) : null}

          <div className="fieldset framed">
            <label>
              Bank country
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
              <AspspPicker
                key={`${country}-${psuType}-${aspsps.length}`}
                banks={aspsps}
                busy={banking.busy}
                onConnect={(aspsp) => void connect(aspsp)}
              />
            )
          ) : (
            <Empty>
              Press <strong>Load available banks</strong> to see the banks Enable Banking supports
              in this country.
            </Empty>
          )}
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
        <div className="card">
          <header>
            <div>
              <h3>Your banks</h3>
              <span className="sub">
                Linked banks refresh when the vault unlocks, and on demand with Sync now.
              </span>
            </div>
            <Chip tone="neutral">{links.length} linked</Chip>
          </header>
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
                onUnlink={() => {
                  const confirmed = window.confirm(
                    `Unlink ${link.aspspName}? Flowly stops refreshing it, the shared accounts and raw responses are removed from the vault, and every imported transaction stays.`,
                  );
                  if (!confirmed) return;
                  void banking
                    .run(() => api.unlinkBank(csrf, link.id))
                    .then((result) => {
                      if (result) setNotice("Bank unlinked. Imported transactions were kept.");
                    });
                }}
                onMap={(uid, body) => mapAccount(link, uid, body).then(() => undefined)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** How many matches the picker shows at once; the input filters all of them. */
const ASPSP_MATCH_LIMIT = 8;

function normalizeBankName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

/**
 * A country can list hundreds of banks, so the picker filters as you type
 * instead of printing every one of them. Connecting still takes a second,
 * explicit click because it leaves the app for the bank's own pages.
 */
function AspspPicker({
  banks,
  busy,
  onConnect,
}: {
  banks: AspspSummary[];
  busy: boolean;
  onConnect: (aspsp: AspspSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AspspSummary | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = "aspsp-options";

  const matches = useMemo(() => {
    const needle = normalizeBankName(query.trim());
    const filtered = banks.filter((bank) => {
      if (needle === "") return true;
      if (normalizeBankName(bank.name).includes(needle)) return true;
      return bank.bic ? bank.bic.toLowerCase().includes(needle) : false;
    });
    return { total: filtered.length, items: filtered.slice(0, ASPSP_MATCH_LIMIT) };
  }, [banks, query]);

  function choose(bank: AspspSummary | undefined) {
    if (!bank) return;
    setSelected(bank);
    setQuery(bank.name);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        return Math.min(Math.max(next, 0), Math.max(matches.items.length - 1, 0));
      });
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      choose(matches.items[active]);
      return;
    }
    if (event.key === "Escape") setOpen(false);
  }

  const showList = open && matches.items.length > 0;

  return (
    <div className="stack">
      <label>
        Search your bank
        <input
          value={query}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder="Type a name or a BIC"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(undefined);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </label>

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching banks"
          className="stack"
          style={{ listStyle: "none", padding: 0, margin: 0 }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {matches.items.map((bank, index) => (
            <li key={`${bank.country}-${bank.name}`}>
              <button
                type="button"
                role="option"
                aria-selected={index === active}
                className={index === active ? "btn small primary" : "btn small"}
                style={{ justifyContent: "flex-start", width: "100%" }}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(bank)}
              >
                {bank.name}
                {bank.bic ? ` · ${bank.bic}` : ""}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="muted">
        {query.trim() === ""
          ? `${banks.length} ${banks.length === 1 ? "bank" : "banks"} available in ${
              banks[0]?.country ?? "this country"
            }.`
          : matches.total === 0
            ? "No bank matches that name."
            : `${matches.total} ${matches.total === 1 ? "bank matches" : "banks match"}${
                matches.total > matches.items.length
                  ? `, showing the first ${matches.items.length}`
                  : ""
              }.`}
      </p>

      {selected ? (
        <div className="rule-tile">
          <header className="rule-tile-head">
            <div className="stack">
              <strong>{selected.name}</strong>
              <span className="sub">
                {selected.country}
                {selected.bic ? ` · ${selected.bic}` : ""}
                {selected.maximumConsentDays
                  ? ` · consent up to ${selected.maximumConsentDays} days`
                  : ""}
              </span>
            </div>
            <div className="cell-actions">
              {selected.beta ? <Chip tone="neutral">beta</Chip> : null}
              <button
                type="button"
                className="btn small primary"
                disabled={busy}
                onClick={() => onConnect(selected)}
              >
                <Icon name="plus" size={14} />
                Connect
              </button>
            </div>
          </header>
          <p className="muted">
            Flowly starts the consent, then hands you over to {selected.name} to approve it. You
            come back here automatically.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The application half of the panel once it exists: what is stored, and the one
 * setting that breaks the flow when it is wrong — the callback URL. The rest of
 * the settings and the destructive action stay behind disclosures so the card
 * opens on what matters.
 */
function ConnectionSettings({
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
    <section className="rule-tile">
      <header className="rule-tile-head">
        <div className="stack">
          <strong>{link.aspspName}</strong>
          <span className="sub">
            {link.aspspCountry} · {link.accounts.length}{" "}
            {link.accounts.length === 1 ? "shared account" : "shared accounts"}
            {link.lastSyncedAt ? ` · last sync ${formatStamp(link.lastSyncedAt)}` : ""}
            {link.accessValidUntil
              ? ` · consent until ${new Date(link.accessValidUntil).toLocaleDateString()}`
              : ""}
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
                    {account.lastBalanceType ? (
                      <span className="sub">
                        {" "}
                        · {BALANCE_TYPE_LABEL[account.lastBalanceType] ?? "reported balance"}
                      </span>
                    ) : null}
                  </td>
                  <td>{account.transactionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted">
            This is the balance your bank reports, and it is the figure Flowly shows for the account
            everywhere: dashboard, Accounts and here. It refreshes when the vault unlocks, with{" "}
            <strong>Sync now</strong>, and on every later sync.
          </p>
        </div>
      ) : link.status === "pending" ? (
        <Empty>
          Waiting for the authorization at the bank. Finish it above, then the accounts appear here.
        </Empty>
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

interface StartedAuthorization {
  linkId: string;
  url: string;
  state: string;
  expiresAt: string;
  aspspName: string;
}

interface ParsedRedirect {
  code?: string;
  state?: string;
  error?: string;
  description?: string;
}

/**
 * Reads the query parameters of the URL the browser was redirected to, whether
 * the user pasted a full URL or only the `?code=…&state=…` part.
 */
function parseRedirect(raw: string): ParsedRedirect {
  const value = raw.trim();
  if (value === "") return {};
  let search = "";
  try {
    search = new URL(value).search;
  } catch {
    search = value.startsWith("?") ? value : `?${value}`;
  }
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const description = params.get("error_description");
  return {
    ...(code ? { code } : {}),
    ...(state ? { state } : {}),
    ...(error ? { error } : {}),
    ...(description ? { description } : {}),
  };
}

/**
 * Keeps the authorization step recoverable. The registered callback URL may be
 * a host the browser cannot reach (a VPN name, a port that is not published),
 * in which case the address bar still carries the code and the user pastes it
 * back here.
 */
function PendingAuthorization({
  pending,
  link,
  busy,
  onComplete,
  onCancel,
}: {
  pending: StartedAuthorization | undefined;
  link: BankLinkSummary | undefined;
  busy: boolean;
  onComplete: (raw: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [redirect, setRedirect] = useState("");
  const [working, setWorking] = useState(false);
  const bankName = pending?.aspspName ?? link?.aspspName ?? "your bank";
  const bankUrl = pending?.url ?? link?.authorizationUrl;

  async function complete() {
    setWorking(true);
    try {
      if (await onComplete(redirect)) setRedirect("");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="rule-tile" aria-live="polite">
      <header className="rule-tile-head">
        <div className="stack">
          <strong>Finish the authorization at {bankName}</strong>
          <span className="sub">
            Authorize the consent at your bank, then come back to this page.
          </span>
        </div>
        <Chip tone="vault">waiting</Chip>
      </header>

      <div className="cell-actions" style={{ justifyContent: "flex-start" }}>
        {bankUrl ? (
          <button type="button" className="btn primary" onClick={() => openBankWindow(bankUrl)}>
            <Icon name="bank" size={16} />
            Continue to the bank
          </button>
        ) : null}
        {bankUrl ? (
          <a className="btn" href={bankUrl} rel="noreferrer">
            Open it in this tab instead
          </a>
        ) : null}
        {pending ? (
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>

      <p className="muted">
        Approve the consent at {bankName} in the window that opens. When the bank sends the browser
        back, Flowly completes the connection on the server and this panel picks it up on its own —
        the window usually closes itself.
      </p>

      <details>
        <summary>Bank did not come back automatically?</summary>
        <label>
          URL you were redirected to
          <input
            value={redirect}
            onChange={(event) => setRedirect(event.target.value)}
            placeholder="https://…/enablebanking/auth_callback?code=…&state=…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="cell-actions" style={{ justifyContent: "flex-start" }}>
          <button
            type="button"
            className="btn primary"
            disabled={busy || working || redirect.trim() === ""}
            onClick={() => void complete()}
          >
            <Icon name="check" size={16} />
            {working ? "Completing…" : "Complete connection"}
          </button>
        </div>
        <p className="muted">
          Copy the full address from the browser bar and paste it here: Flowly reads the code from
          it. Enable Banking may also append an <code>error</code> parameter, which is shown right
          after you complete.
        </p>
      </details>
    </section>
  );
}
