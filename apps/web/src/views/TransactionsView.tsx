import { useCallback, useEffect, useState } from "react";
import type { Account, Tag, Transaction } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { Icon } from "../components/icons.js";
import { Banner, Chip, Empty, Money } from "../components/ui.js";
import { useCollection } from "../hooks/use-collection.js";
import { describeError } from "../hooks/use-workspace.js";
import { parseAmountToMinor } from "../lib/money.js";

interface Filters {
  accountId: string;
  from: string;
  to: string;
  tagId: string;
  status: string;
  q: string;
}

const EMPTY_FILTERS: Filters = { accountId: "", from: "", to: "", tagId: "", status: "", q: "" };

export function TransactionsView({ csrf }: { csrf: string }) {
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

  async function toggleTag(transaction: Transaction, tagId: string) {
    const nextTags = transaction.tagIds.includes(tagId)
      ? transaction.tagIds.filter((id) => id !== tagId)
      : [...transaction.tagIds, tagId];
    try {
      await api.update<Transaction>(csrf, "transactions", transaction.id, {
        ...transaction,
        tagIds: nextTags,
      });
      await load();
    } catch (cause) {
      setError(describeError(cause));
    }
  }

  async function remove(transaction: Transaction) {
    if (!window.confirm("Delete this transaction?")) return;
    try {
      await api.remove(csrf, "transactions", transaction.id, transaction.revision);
      await load();
    } catch (cause) {
      setError(describeError(cause));
    }
  }

  return (
    <section className="view" aria-labelledby="transactions-title">
      <div className="view-header">
        <div>
          <p className="eyebrow">Ledger · every movement, notes and tags</p>
          <h1 id="transactions-title">Transactions</h1>
        </div>
        <Chip tone="neutral">{total} matching</Chip>
      </div>

      <form className="card" onSubmit={submit}>
        <header>
          <h2>Record a transaction</h2>
          <span className="sub">Tagging rules run when you save</span>
        </header>
        <div className="fieldset">
          <label>
            Account
            <select
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              required
            >
              <option value="">Select…</option>
              {accounts.items.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Booking date
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
        </div>
        <fieldset className="fieldset">
          <legend>Tags</legend>
          {tags.items.length === 0 ? (
            <span className="sub">No tags yet — create them in the Tags section.</span>
          ) : (
            tags.items.map((tag) => (
              <label key={tag.id} className="checkline">
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
                <span className="swatch" style={{ background: tag.color ?? "#4648d4" }} />
                {tag.name}
              </label>
            ))
          )}
        </fieldset>
        <div>
          <button type="submit" className="btn primary">
            <Icon name="plus" size={16} />
            Add transaction
          </button>
        </div>
      </form>

      <fieldset className="fieldset">
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
        <button type="button" className="btn small" onClick={() => setFilters(EMPTY_FILTERS)}>
          Clear
        </button>
      </fieldset>

      {(formError ?? error) ? <Banner tone="error">{formError ?? error}</Banner> : null}
      {loading ? <Banner>Searching…</Banner> : null}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Payee</th>
                <th>Note</th>
                <th>Tags</th>
                <th>Source</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((transaction) => (
                <tr key={transaction.id}>
                  <td className="mono">{transaction.bookingDate}</td>
                  <td>
                    <span className="stack">
                      <strong>{transaction.payee ?? "—"}</strong>
                      {transaction.description ? (
                        <span className="sub">{transaction.description}</span>
                      ) : null}
                    </span>
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
                  <td>
                    {tags.items
                      .filter((tag) => transaction.tagIds.includes(tag.id))
                      .map((tag) => (
                        <span key={tag.id} className="tag-pill">
                          <span className="swatch" style={{ background: tag.color ?? "#4648d4" }} />
                          {tag.name}
                        </span>
                      ))}
                    {tags.items.length > 0 ? (
                      <select
                        aria-label={`Toggle tags for ${transaction.payee ?? transaction.id}`}
                        value=""
                        onChange={(event) => {
                          if (event.target.value) void toggleTag(transaction, event.target.value);
                        }}
                      >
                        <option value="">± tag</option>
                        {tags.items.map((tag) => (
                          <option key={tag.id} value={tag.id}>
                            {transaction.tagIds.includes(tag.id) ? "Remove" : "Add"} {tag.name}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </td>
                  <td>
                    <Chip tone={transaction.status === "booked" ? "neutral" : "vault"}>
                      {transaction.source}
                    </Chip>
                  </td>
                  <td>
                    <Money minor={transaction.amountMinor} currency={transaction.currency} />
                  </td>
                  <td>
                    <div className="cell-actions">
                      {editing?.id === transaction.id ? (
                        <>
                          <button
                            type="button"
                            className="btn small primary"
                            onClick={() => void saveNote(transaction)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="btn small"
                            onClick={() => setEditing(undefined)}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn small"
                          onClick={() =>
                            setEditing({ id: transaction.id, note: transaction.userNote ?? "" })
                          }
                        >
                          Edit note
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={() => void remove(transaction)}
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && items.length === 0 ? <Empty>No transactions match.</Empty> : null}
      </div>
    </section>
  );
}
