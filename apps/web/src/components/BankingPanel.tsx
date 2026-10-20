import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account } from "@flowly/web-contracts";
import {
  api,
  type AspspSummary,
  type BankAccountMappingInput,
  type BankLinkSummary,
} from "../api/client.js";
import { useBanking } from "../hooks/use-banking.js";
import { AspspPicker } from "./AspspPicker.js";
import { BankAccountMapping, type DiscoveredAccount } from "./BankAccountMapping.js";
import { BankingConnectionForm, BankingConnectionSettings } from "./BankingConnectionForm.js";
import { openBankWindow, parseRedirect, type StartedAuthorization } from "./banking-callback.js";
import { Icon } from "./icons.js";
import { Banner, Chip, Empty } from "./ui.js";
import { describeBankAuthorizationError } from "../lib/banking-errors.js";
import { formatMoney } from "../lib/money.js";
import { formatStamp } from "../lib/stamps.js";

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
   * Drops a pending authorization. Without this the request stays pending in the
   * vault — and the panel keeps waiting for a bank that will never come back.
   */
  async function deleteAuthorization(linkId: string | undefined) {
    const confirmed = window.confirm(
      "Delete this authorization request? Nothing was imported, and you can connect the bank again right away.",
    );
    if (!confirmed) return;
    if (!linkId) {
      setPending(undefined);
      return;
    }
    const result = await banking.run(() => api.unlinkBank(csrf, linkId));
    if (!result) return;
    setPending(undefined);
    setNotice("Authorization request deleted. Nothing was imported.");
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
          <BankingConnectionSettings
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
          <BankingConnectionForm
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
          </header>

          {waiting ? (
            <PendingAuthorization
              pending={pending}
              link={waitingLink}
              busy={banking.busy}
              onComplete={completeFromRedirect}
              onDelete={() => void deleteAuthorization(pending?.linkId ?? waitingLink?.id)}
            />
          ) : (
            <>
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
                <button
                  type="button"
                  className="btn small"
                  disabled={banking.busy}
                  onClick={() => void loadBanks()}
                >
                  <Icon name="bank" size={14} />
                  Load available banks
                </button>
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
                  Press <strong>Load available banks</strong> to see the banks Enable Banking
                  supports in this country.
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
            </>
          )}
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
  onDelete,
}: {
  pending: StartedAuthorization | undefined;
  link: BankLinkSummary | undefined;
  busy: boolean;
  onComplete: (raw: string) => Promise<boolean>;
  onDelete: () => void;
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
            Approve the consent in the bank window: Flowly finishes on its own.
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
        <button type="button" className="btn danger" disabled={busy} onClick={onDelete}>
          <Icon name="trash" size={14} />
          Delete
        </button>
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
