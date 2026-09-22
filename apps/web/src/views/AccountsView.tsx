import { useCallback, useEffect, useState } from "react";
import type { Account, Dashboard } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { Icon, type IconName } from "../components/icons.js";
import {
  Banner,
  BannerFigure,
  Chip,
  Empty,
  SectionBanner,
  SectionIntro,
} from "../components/ui.js";
import { useCollection } from "../hooks/use-collection.js";
import { describeError } from "../hooks/use-workspace.js";
import { ACCOUNT_TYPES, CURRENCIES, formatMoney } from "../lib/money.js";

const TYPE_ICONS: Record<string, IconName> = {
  "credit-card": "transactions",
  savings: "archive",
  investment: "archive",
};

export function AccountsView({ csrf }: { csrf: string }) {
  const accounts = useCollection<Account>("accounts", csrf, true);
  const [balances, setBalances] = useState<Dashboard["balances"]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState("checking");
  const [currency, setCurrency] = useState("EUR");
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  const loadBalances = useCallback(async () => {
    try {
      const dashboard = await api.dashboard();
      setBalances(dashboard.balances);
    } catch (cause) {
      setActionError(describeError(cause));
    }
  }, []);

  useEffect(() => {
    void loadBalances();
  }, [loadBalances]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setActionError(undefined);
    const now = new Date().toISOString();
    const created = await accounts.create({
      formatVersion: 1,
      revision: 1,
      id: crypto.randomUUID(),
      name,
      type,
      defaultCurrency: currency,
      createdAt: now,
      updatedAt: now,
    });
    if (created) setName("");
    await loadBalances();
  }

  async function remove(account: Account) {
    setActionError(undefined);
    const confirmed = window.confirm(
      `Delete "${account.name}" and every transaction in it? This cannot be undone.`,
    );
    if (!confirmed) return;
    const removed = await accounts.remove(account.id, account.revision, true);
    if (!removed) {
      setActionError("Could not delete: the account may have changed.");
      return;
    }
    await loadBalances();
  }

  async function archive(account: Account) {
    setActionError(undefined);
    try {
      await api.archiveAccount(csrf, account.id, account.revision);
      await accounts.reload();
      await loadBalances();
    } catch (cause) {
      setActionError(describeError(cause));
    }
  }

  async function restore(account: Account) {
    setActionError(undefined);
    try {
      await api.restoreAccount(csrf, account.id, account.revision);
      await accounts.reload();
      await loadBalances();
    } catch (cause) {
      setActionError(describeError(cause));
    }
  }

  const currencies = new Set(balances.map((line) => line.currency));
  // Totals are per currency: Flowly never converts to invent one number.
  const totals = [...currencies].map((currency) => ({
    currency,
    balanceMinor: balances
      .filter((line) => line.currency === currency)
      .reduce((total, line) => total + line.balanceMinor, 0),
  }));

  return (
    <section className="view" aria-labelledby="accounts-title">
      <SectionBanner
        tone="vault"
        icon="accounts"
        eyebrow="Money & accounts"
        title="Every account, one vault"
        badge={<Chip tone="neutral">{accounts.items.length} accounts</Chip>}
        lead="Every account is a local endpoint: a bank-linked account shows the balance your bank sends, every other account books its own movements, and no currency is ever converted."
        side={
          <Chip tone="vault" icon="lock">
            AES-256-GCM
          </Chip>
        }
        figures={
          totals.length > 0 ? (
            <>
              {totals.map((total) => (
                <BannerFigure
                  key={total.currency}
                  label={`Booked balance · ${total.currency}`}
                  value={formatMoney(total.balanceMinor, total.currency)}
                />
              ))}
            </>
          ) : null
        }
      />

      <SectionIntro
        icon="accounts"
        eyebrow="Balances per currency"
        title="Where your money sits right now."
        lead="Archived accounts keep their movements and can be restored; deleting one asks for an explicit cascade."
        actions={
          <Chip tone="neutral">
            {currencies.size} {currencies.size === 1 ? "currency" : "currencies"}
          </Chip>
        }
      />

      <form className="card" onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Setup</p>
            <h2>New account</h2>
            <span className="sub">Stored only in the local keystore</span>
          </div>
        </header>
        <div className="fieldset framed">
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Type
            <select value={type} onChange={(event) => setType(event.target.value)}>
              {ACCOUNT_TYPES.map((accountType) => (
                <option key={accountType} value={accountType}>
                  {accountType}
                </option>
              ))}
            </select>
          </label>
          <label>
            Currency
            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn primary" disabled={name.trim() === ""}>
            <Icon name="plus" size={16} />
            Add account
          </button>
        </div>
      </form>

      {(accounts.error ?? actionError) ? (
        <Banner tone="error">{accounts.error ?? actionError}</Banner>
      ) : null}
      {accounts.loading ? <Banner>Loading accounts…</Banner> : null}

      <section className="view" aria-label="Your accounts">
        <div className="view-header-inline">
          <div>
            <p className="eyebrow">Registry</p>
            <h2>Active endpoints</h2>
          </div>
          <span className="sub">
            Linked accounts use the bank balance; the rest use booked movements
          </span>
        </div>
        {accounts.items.length > 0 ? (
          <div className="account-grid">
            {accounts.items.map((account) => (
              <article
                key={account.id}
                className={account.archivedAt ? "account-card archived" : "account-card"}
              >
                <div className="account-card-head">
                  <span className="tile">
                    <Icon name={TYPE_ICONS[account.type] ?? "accounts"} size={22} />
                  </span>
                  <div className="stack" style={{ flex: 1 }}>
                    <strong style={{ fontSize: "1rem" }}>{account.name}</strong>
                    <span className="sub">
                      {account.type} · {account.defaultCurrency}
                    </span>
                    <div className="hero-facts" style={{ justifyContent: "flex-start" }}>
                      {account.archivedAt ? (
                        <Chip tone="neutral">archived</Chip>
                      ) : (
                        <Chip tone="income" icon="check">
                          active
                        </Chip>
                      )}
                      <Chip tone="vault" icon="lock">
                        AES-256
                      </Chip>
                    </div>
                  </div>
                </div>

                {balances
                  .filter((line) => line.accountId === account.id)
                  .map((line) => (
                    <div className="account-balance" key={`${account.id}-${line.currency}`}>
                      <span className="eyebrow">Balance · {line.currency}</span>
                      <span className="value">{formatMoney(line.balanceMinor, line.currency)}</span>
                      <span className="sub">
                        {line.transactionCount} booked{" "}
                        {line.transactionCount === 1 ? "movement" : "movements"}
                        {line.isDefaultCurrency ? "" : " · other currency"}
                      </span>
                    </div>
                  ))}

                <div className="cell-actions">
                  {account.archivedAt ? (
                    <button
                      type="button"
                      className="btn small primary"
                      onClick={() => void restore(account)}
                    >
                      <Icon name="check" size={14} />
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn small"
                      onClick={() => void archive(account)}
                    >
                      <Icon name="archive" size={14} />
                      Archive
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => void remove(account)}
                  >
                    <Icon name="trash" size={14} />
                    Delete all
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty>No accounts yet. Add the first one above.</Empty>
        )}
      </section>
    </section>
  );
}
