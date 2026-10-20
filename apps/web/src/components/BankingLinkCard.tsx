import { useState } from "react";
import type { Account } from "@flowly/web-contracts";
import type { BankAccountMappingInput, BankLinkSummary } from "../api/client.js";
import { formatMoney } from "../lib/money.js";
import { formatStamp } from "../lib/stamps.js";
import { BankAccountMapping, type DiscoveredAccount } from "./BankAccountMapping.js";
import { openBankWindow, type StartedAuthorization } from "./banking-callback.js";
import { Icon } from "./icons.js";
import { Banner, Chip, Empty } from "./ui.js";

export const BANK_LINK_STATUS_LABEL: Record<BankLinkSummary["status"], string> = {
  pending: "waiting for the bank",
  authorized: "connected",
  expired: "consent expired",
  revoked: "consent revoked",
  failed: "authorization failed",
  closed: "closed",
};

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

export function BankingLinkCard({
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
            {BANK_LINK_STATUS_LABEL[link.status]}
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

export function BankingPendingAuthorization({
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
