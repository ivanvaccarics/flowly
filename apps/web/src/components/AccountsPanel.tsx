import { useState } from "react";
import type { Account } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { useCollection } from "../hooks/use-collection.js";
import { describeError } from "../hooks/use-workspace.js";
import { ACCOUNT_TYPES, CURRENCIES } from "../lib/money.js";

export function AccountsPanel({ csrf }: { csrf: string }) {
  const accounts = useCollection<Account>("accounts", csrf, true);
  const [name, setName] = useState("");
  const [type, setType] = useState("checking");
  const [currency, setCurrency] = useState("EUR");
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
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
    const removed = await accounts.remove(account.id, account.revision, true);
    if (!removed) setActionError("Could not delete: the account may have been changed.");
  }

  async function archive(account: Account) {
    try {
      await api.archiveAccount(csrf, account.id, account.revision);
      await accounts.reload();
    } catch (cause) {
      setActionError(describeError(cause));
    }
  }

  return (
    <section className="panel" aria-labelledby="accounts-title">
      <h2 id="accounts-title">Accounts</h2>
      <form className="row-form" onSubmit={submit}>
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
        <button type="submit" disabled={name.trim() === ""}>
          Add account
        </button>
      </form>

      {(accounts.error ?? actionError) ? (
        <p role="alert" className="error">
          {accounts.error ?? actionError}
        </p>
      ) : null}
      {accounts.loading ? <p role="status">Loading accounts…</p> : null}

      <ul className="list">
        {accounts.items.map((account) => (
          <li key={account.id}>
            <span>
              <strong>{account.name}</strong> · {account.type} · {account.defaultCurrency}
              {account.archivedAt ? " · archived" : ""}
            </span>
            <span className="actions">
              {account.archivedAt ? null : (
                <button type="button" onClick={() => void archive(account)}>
                  Archive
                </button>
              )}
              <button type="button" onClick={() => void remove(account)}>
                Delete with transactions
              </button>
            </span>
          </li>
        ))}
      </ul>
      {accounts.items.length === 0 && !accounts.loading ? (
        <p className="muted">No accounts yet. Add the first one above.</p>
      ) : null}
    </section>
  );
}
