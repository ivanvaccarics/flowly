import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account, Tag, Transaction } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { useCollection } from "../hooks/use-collection.js";
import { describeError } from "../hooks/use-workspace.js";
import { formatMoney, parseAmountToMinor } from "../lib/money.js";

interface Filters {
  accountId: string;
  from: string;
  to: string;
  tagId: string;
  status: string;
  q: string;
}

const EMPTY_FILTERS: Filters = { accountId: "", from: "", to: "", tagId: "", status: "", q: "" };

export function TransactionsPanel({ csrf }: { csrf: string }) {
  const accounts = useCollection<Account>("accounts", csrf, true);
  const tags = useCollection<Tag>("tags", csrf, true);

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [items, setItems] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const [accountId, setAccountId] = useState("");
  const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [payee, setPayee] = useState("");
  const [userNote, setUserNote] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ id: string; note: string } | undefined>(undefined);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const account = accounts.items.find((candidate) => candidate.id === accountId);
  const currency = account?.defaultCurrency ?? "EUR";
  const tagNames = useMemo(
    () => new Map(tags.items.map((tag) => [tag.id, tag.name])),
    [tags.items],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.searchTransactions({
        ...(filters.accountId ? { accountId: filters.accountId } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
        ...(filters.tagId ? { tags: filters.tagId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.q ? { q: filters.q } : {}),
      });
      setItems(response.items);
      setTotal(response.total);
      setError(undefined);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(undefined);
    if (!accountId) {
      setFormError("Choose an account first.");
      return;
    }
    let amountMinor: number;
    try {
      amountMinor = parseAmountToMinor(amount, currency);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Invalid amount");
      return;
    }
    const now = new Date().toISOString();
    try {
      await api.create<Transaction>(csrf, "transactions", {
        formatVersion: 1,
        revision: 1,
        id: crypto.randomUUID(),
        accountId,
        bookingDate,
        amountMinor,
        currency,
        status: "booked",
        source: "manual",
        tagIds: selectedTags,
        createdAt: now,
        updatedAt: now,
        ...(payee ? { payee } : {}),
        ...(userNote ? { userNote } : {}),
      });
      setAmount("");
      setPayee("");
      setUserNote("");
      setSelectedTags([]);
      await load();
    } catch (cause) {
      setFormError(describeError(cause));
    }
  }

  async function saveNote(transaction: Transaction) {
    if (!editing) return;
    try {
      await api.update<Transaction>(csrf, "transactions", transaction.id, {
        ...transaction,
        userNote: editing.note,
      });
      setEditing(undefined);
      await load();
    } catch (cause) {
      setError(describeError(cause));
    }
  }

  async function remove(transaction: Transaction) {
    try {
      await api.remove(csrf, "transactions", transaction.id, transaction.revision);
      await load();
    } catch (cause) {
      setError(describeError(cause));
    }
  }

  return (
    <section className="panel" aria-labelledby="transactions-title">
      <h2 id="transactions-title">Transactions</h2>

      <form className="row-form" onSubmit={submit}>
        <label>
          Account
          <select value={accountId} onChange={(event) => setAccountId(event.target.value)} required>
            <option value="">Select…</option>
            {accounts.items.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            value={bookingDate}
            onChange={(event) => setBookingDate(event.target.value)}
            required
          />
        </label>
        <label>
          Amount ({currency})
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="-12.30"
            required
          />
        </label>
        <label>
          Payee
          <input value={payee} onChange={(event) => setPayee(event.target.value)} />
        </label>
        <label>
          Note
          <input value={userNote} onChange={(event) => setUserNote(event.target.value)} />
        </label>
        <fieldset className="tags">
          <legend>Tags</legend>
          {tags.items.map((tag) => (
            <label key={tag.id}>
              <input
                type="checkbox"
                checked={selectedTags.includes(tag.id)}
                onChange={(event) =>
                  setSelectedTags((current) =>
                    event.target.checked
                      ? [...current, tag.id]
                      : current.filter((id) => id !== tag.id),
                  )
                }
              />
              {tag.name}
            </label>
          ))}
        </fieldset>
        <button type="submit">Add transaction</button>
      </form>

      <fieldset className="filters">
        <legend>Filters</legend>
        <label>
          Filter by account
          <select
            value={filters.accountId}
            onChange={(event) => setFilters({ ...filters, accountId: event.target.value })}
          >
            <option value="">Any</option>
            {accounts.items.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={filters.from}
            onChange={(event) => setFilters({ ...filters, from: event.target.value })}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={filters.to}
            onChange={(event) => setFilters({ ...filters, to: event.target.value })}
          />
        </label>
        <label>
          Tag
          <select
            value={filters.tagId}
            onChange={(event) => setFilters({ ...filters, tagId: event.target.value })}
          >
            <option value="">Any</option>
            {tags.items.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={filters.status}
            onChange={(event) => setFilters({ ...filters, status: event.target.value })}
          >
            <option value="">Any</option>
            <option value="booked">booked</option>
            <option value="pending">pending</option>
          </select>
        </label>
        <label>
          Search
          <input
            value={filters.q}
            onChange={(event) => setFilters({ ...filters, q: event.target.value })}
            placeholder="payee, note, description"
          />
        </label>
        <button type="button" onClick={() => setFilters(EMPTY_FILTERS)}>
          Clear
        </button>
      </fieldset>

      {(formError ?? error) ? (
        <p role="alert" className="error">
          {formError ?? error}
        </p>
      ) : null}
      <p className="muted" role="status">
        {loading ? "Searching…" : `${total} transactions match`}
      </p>

      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Payee</th>
            <th>Amount</th>
            <th>Note</th>
            <th>Tags</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.map((transaction) => (
            <tr key={transaction.id}>
              <td>{transaction.bookingDate}</td>
              <td>{transaction.payee ?? "—"}</td>
              <td className="amount">
                {formatMoney(transaction.amountMinor, transaction.currency)}
              </td>
              <td>
                {editing?.id === transaction.id ? (
                  <input
                    aria-label={`Note for ${transaction.payee ?? transaction.id}`}
                    value={editing.note}
                    onChange={(event) =>
                      setEditing({ id: transaction.id, note: event.target.value })
                    }
                  />
                ) : (
                  (transaction.userNote ?? "—")
                )}
              </td>
              <td>{transaction.tagIds.map((id) => tagNames.get(id) ?? "…").join(", ") || "—"}</td>
              <td className="actions">
                {editing?.id === transaction.id ? (
                  <>
                    <button type="button" onClick={() => void saveNote(transaction)}>
                      Save
                    </button>
                    <button type="button" onClick={() => setEditing(undefined)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({ id: transaction.id, note: transaction.userNote ?? "" })
                    }
                  >
                    Edit note
                  </button>
                )}
                <button type="button" onClick={() => void remove(transaction)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!loading && items.length === 0 ? <p className="muted">No transactions match.</p> : null}
    </section>
  );
}
