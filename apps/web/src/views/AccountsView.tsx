import { useState } from "react";
import type { Account } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { Icon } from "../components/icons.js";
import { Banner, Chip, Empty } from "../components/ui.js";
import { useCollection } from "../hooks/use-collection.js";
import { describeError } from "../hooks/use-workspace.js";
import { ACCOUNT_TYPES, CURRENCIES } from "../lib/money.js";

export function AccountsView({ csrf }: { csrf: string }) {
  const accounts = useCollection<Account>("accounts", csrf, true);
  const [name, setName] = useState("");
  const [type, setType] = useState("checking");
  const [currency, setCurrency] = useState("EUR");
  const [actionError, setActionError] = useState<string | undefined>(undefined);

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
  }

  async function remove(account: Account) {
    setActionError(undefined);
    const confirmed = window.confirm(
      `Delete "${account.name}" and every transaction in it? This cannot be undone.`,
    );
    if (!confirmed) return;
    const removed = await accounts.remove(account.id, account.revision, true);
    if (!removed) setActionError("Could not delete: the account may have changed.");
  }

  async function archive(account: Account) {
    setActionError(undefined);
    try {
      await api.archiveAccount(csrf, account.id, account.revision);
      await accounts.reload();
    } catch (cause) {
      setActionError(describeError(cause));
    }
  }

  return (
    <section className="view" aria-labelledby="accounts-title">
      <div className="view-header">
        <div>
          <p className="eyebrow">Accounts · balances per currency</p>
          <h1 id="accounts-title">Accounts</h1>
        </div>
      </div>

      <form className="card" onSubmit={submit}>
        <header>
          <h2>New account</h2>
        </header>
        <div className="fieldset">
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

      <div className="card">
        <header>
          <h2>Your accounts</h2>
          <Chip tone="neutral">{accounts.items.length} total</Chip>
        </header>
        {accounts.items.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Currency</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {accounts.items.map((account) => (
                  <tr key={account.id} className={account.archivedAt ? "archived" : undefined}>
                    <td>
                      <strong>{account.name}</strong>
                    </td>
                    <td>{account.type}</td>
                    <td className="mono">{account.defaultCurrency}</td>
                    <td>
                      {account.archivedAt ? (
                        <Chip tone="neutral">archived</Chip>
                      ) : (
                        <Chip tone="income" icon="check">
                          active
                        </Chip>
                      )}
                    </td>
                    <td>
                      <div className="cell-actions">
                        {account.archivedAt ? null : (
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No accounts yet. Add the first one above.</Empty>
        )}
      </div>
    </section>
  );
}
