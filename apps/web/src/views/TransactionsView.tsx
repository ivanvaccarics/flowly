import { Fragment, useCallback, useEffect, useState } from "react";
import type { Account, Tag, Transaction } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { Icon } from "../components/icons.js";
import { TagPicker } from "../components/TagPicker.js";
import { Banner, Chip, Empty, Money, PageHeader, tagPillStyle } from "../components/ui.js";
import { useCollection } from "../hooks/use-collection.js";
import { describeError } from "../hooks/use-workspace.js";
import { parseAmountToMinor } from "../lib/money.js";
import { formatMinorToAmount } from "../lib/money.js";
import { RawTransactionPanel } from "../components/RawTransactionPanel.js";

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
  const [status, setStatus] = useState<"booked" | "pending">("booked");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [editing, setEditing] = useState<
    { id: string; payee: string; amount: string; note: string; tagIds: string[] } | undefined
  >(undefined);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [rawOpen, setRawOpen] = useState<string | undefined>(undefined);

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
        status,
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
      setStatus("booked");
      await load();
    } catch (cause) {
      setFormError(describeError(cause));
    }
  }

  async function saveEdits(transaction: Transaction) {
    if (!editing) return;
    let amountMinor: number;
    try {
      amountMinor = parseAmountToMinor(editing.amount, transaction.currency);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid amount");
      return;
    }
    try {
      await api.update<Transaction>(csrf, "transactions", transaction.id, {
        ...transaction,
        payee: editing.payee,
        amountMinor,
        userNote: editing.note,
        tagIds: editing.tagIds,
      });
      setEditing(undefined);
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

  async function toggleStatus(transaction: Transaction) {
    const next: "booked" | "pending" = transaction.status === "booked" ? "pending" : "booked";
    try {
      await api.update<Transaction>(csrf, "transactions", transaction.id, {
        ...transaction,
        status: next,
      });
      await load();
    } catch (cause) {
      setError(describeError(cause));
    }
  }

  return (
    <section className="view" aria-labelledby="transactions-title">
      <PageHeader
        eyebrow="Ledger · every movement, notes and tags"
        title="Transaction ledger"
        lead="Search and filters run on the server against the encrypted vault; nothing leaves this device."
        facts={
          <>
            <Chip tone="neutral">{total} matching</Chip>
            <Chip tone="vault" icon="lock">
              offline AES-256
            </Chip>
          </>
        }
      />

      <form className="card" onSubmit={submit}>
        <header>
          <div>
            <h2>Record a transaction</h2>
            <span className="sub">Tagging rules run when you save</span>
          </div>
        </header>
        <div className="fieldset framed">
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
          <label>
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as "booked" | "pending")}
            >
              <option value="booked">booked</option>
              <option value="pending">pending</option>
            </select>
          </label>
        </div>
        <fieldset className="fieldset">
          <legend>Tags</legend>
          <TagPicker
            tags={tags.items}
            selected={selectedTags}
            onChange={setSelectedTags}
            label="Select tags for the new transaction"
          />
        </fieldset>
        <div>
          <button type="submit" className="btn primary">
            <Icon name="plus" size={16} />
            Add transaction
          </button>
        </div>
      </form>

      <div className="card">
        <header>
          <div>
            <h2>Filters</h2>
            <span className="sub">Every control narrows the same server-side query</span>
          </div>
          <button type="button" className="btn small" onClick={() => setFilters(EMPTY_FILTERS)}>
            Reset filters
          </button>
        </header>
        <fieldset className="fieldset framed">
          <label>
            Search
            <input
              value={filters.q}
              onChange={(event) => setFilters({ ...filters, q: event.target.value })}
              placeholder="payee, note, description"
            />
          </label>
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
            Filter by status
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
        </fieldset>
        {tags.items.length > 0 ? (
          <div className="quick-filters">
            <span className="eyebrow" style={{ margin: 0 }}>
              Quick filters
            </span>
            {tags.items.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={filters.tagId === tag.id ? "tag-pill active" : "tag-pill"}
                style={filters.tagId === tag.id ? undefined : tagPillStyle(tag.color)}
                aria-pressed={filters.tagId === tag.id}
                onClick={() =>
                  setFilters({ ...filters, tagId: filters.tagId === tag.id ? "" : tag.id })
                }
              >
                {tag.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

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
                <th>Status</th>
                <th>Source</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((transaction) => (
                <Fragment key={transaction.id}>
                  <tr>
                    <td className="mono cell-nowrap">{transaction.bookingDate}</td>
                    <td>
                      {editing?.id === transaction.id ? (
                        <input
                          aria-label={`Payee for ${transaction.id}`}
                          value={editing.payee}
                          onChange={(event) =>
                            setEditing({ ...editing, payee: event.target.value })
                          }
                        />
                      ) : (
                        <span className="tx">
                          <span
                            className={
                              transaction.amountMinor < 0 ? "tx-icon expense" : "tx-icon income"
                            }
                          >
                            <Icon name="transactions" size={15} />
                          </span>
                          <span className="stack">
                            <strong>{transaction.payee ?? "—"}</strong>
                            {transaction.description &&
                            transaction.description !== transaction.payee ? (
                              <span className="sub">{transaction.description}</span>
                            ) : null}
                          </span>
                        </span>
                      )}
                    </td>
                    <td>
                      {editing?.id === transaction.id ? (
                        <input
                          aria-label={`Note for ${transaction.payee ?? transaction.id}`}
                          value={editing.note}
                          onChange={(event) => setEditing({ ...editing, note: event.target.value })}
                        />
                      ) : (
                        (transaction.userNote ?? "—")
                      )}
                    </td>
                    <td>
                      {editing?.id === transaction.id ? (
                        <TagPicker
                          tags={tags.items}
                          selected={editing.tagIds}
                          onChange={(tagIds) => setEditing({ ...editing, tagIds })}
                          label={`Edit tags for ${transaction.payee ?? transaction.id}`}
                        />
                      ) : transaction.tagIds.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        transaction.tagIds.map((id) => {
                          const tag = tags.items.find((candidate) => candidate.id === id);
                          return (
                            <span key={id} className="tag-pill" style={tagPillStyle(tag?.color)}>
                              {tag?.name ?? "…"}
                            </span>
                          );
                        })
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="chip-button"
                        title="Switch between booked and pending"
                        aria-label={`Set status for ${transaction.payee ?? transaction.id}`}
                        onClick={() => void toggleStatus(transaction)}
                      >
                        <Chip tone={transaction.status === "booked" ? "income" : "vault"}>
                          {transaction.status}
                        </Chip>
                      </button>
                    </td>
                    <td>
                      <span className="chip mono neutral">
                        <Icon name="lock" size={12} />
                        {transaction.source}
                      </span>
                    </td>
                    <td>
                      {editing?.id === transaction.id ? (
                        <span className="amount-edit">
                          <input
                            aria-label={`Amount in ${transaction.currency}`}
                            value={editing.amount}
                            onChange={(event) =>
                              setEditing({ ...editing, amount: event.target.value })
                            }
                          />
                          <span className="sub mono">{transaction.currency}</span>
                        </span>
                      ) : (
                        <Money minor={transaction.amountMinor} currency={transaction.currency} />
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn small"
                          aria-expanded={rawOpen === transaction.id}
                          onClick={() =>
                            setRawOpen(rawOpen === transaction.id ? undefined : transaction.id)
                          }
                        >
                          <Icon name="eye" size={14} />
                          Raw
                        </button>
                        {editing?.id === transaction.id ? (
                          <>
                            <button
                              type="button"
                              className="btn small primary"
                              onClick={() => void saveEdits(transaction)}
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
                              setEditing({
                                id: transaction.id,
                                payee: transaction.payee ?? "",
                                amount: formatMinorToAmount(
                                  transaction.amountMinor,
                                  transaction.currency,
                                ),
                                note: transaction.userNote ?? "",
                                tagIds: transaction.tagIds,
                              })
                            }
                          >
                            Edit
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
                  {rawOpen === transaction.id ? (
                    <tr className="raw-row">
                      <td colSpan={8}>
                        <RawTransactionPanel transaction={transaction} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && items.length === 0 ? <Empty>No transactions match.</Empty> : null}
      </div>
    </section>
  );
}
