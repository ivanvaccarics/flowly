import { useMemo, useState } from "react";
import type { Account, Tag, Transaction } from "@flowly/web-contracts";
import { useCollection } from "../hooks/use-collection.js";
import { formatMoney, parseAmountToMinor } from "../lib/money.js";

export function TransactionsPanel({ csrf }: { csrf: string }) {
  const transactions = useCollection<Transaction>("transactions", csrf, true);
  const accounts = useCollection<Account>("accounts", csrf, true);
  const tags = useCollection<Tag>("tags", csrf, true);

  const [accountId, setAccountId] = useState("");
  const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [payee, setPayee] = useState("");
  const [userNote, setUserNote] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<{ id: string; note: string } | undefined>(undefined);
  const [formError, setFormError] = useState<string | undefined>(undefined);

  const account = accounts.items.find((candidate) => candidate.id === accountId);
  const currency = account?.defaultCurrency ?? "EUR";
  const tagNames = useMemo(
    () => new Map(tags.items.map((tag) => [tag.id, tag.name])),
    [tags.items],
  );

  const visible = transactions.items.filter((transaction) => {
    if (filter.trim() === "") return true;
    const needle = filter.toLowerCase();
    return (
      (transaction.payee ?? "").toLowerCase().includes(needle) ||
      (transaction.userNote ?? "").toLowerCase().includes(needle) ||
      (transaction.description ?? "").toLowerCase().includes(needle)
    );
  });

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
    const created = await transactions.create({
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
    if (created) {
      setAmount("");
      setPayee("");
      setUserNote("");
      setSelectedTags([]);
      // Rules may have added tags, so reload once more after the write.
      await transactions.reload();
    }
  }

  async function saveNote(transaction: Transaction) {
    if (!editing) return;
    const saved = await transactions.update({
      ...transaction,
      userNote: editing.note,
    } as Transaction & { id: string });
    if (saved) setEditing(undefined);
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

      {formError ? (
        <p role="alert" className="error">
          {formError}
        </p>
      ) : null}
      {transactions.error ? (
        <p role="alert" className="error">
          {transactions.error}
        </p>
      ) : null}

      <label className="filter">
        Filter
        <input value={filter} onChange={(event) => setFilter(event.target.value)} />
      </label>

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
          {visible.map((transaction) => (
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
                <button
                  type="button"
                  onClick={() => void transactions.remove(transaction.id, transaction.revision)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {visible.length === 0 ? <p className="muted">No transactions match yet.</p> : null}
    </section>
  );
}
