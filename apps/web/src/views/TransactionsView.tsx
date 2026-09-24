import { Fragment, useCallback, useEffect, useState } from "react";
import type { Account, Tag, Transaction } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { Icon } from "../components/icons.js";
import { Modal } from "../components/Modal.js";
import {
  TransactionFields,
  draftCurrency,
  draftFromTransaction,
  emptyTransactionDraft,
  type TransactionDraft,
} from "../components/TransactionFields.js";
import { Banner, Chip, Empty, Money, SectionIntro, tagPillStyle } from "../components/ui.js";
import { useCollection } from "../hooks/use-collection.js";
import { describeError } from "../hooks/use-workspace.js";
import { parseAmountToMinor } from "../lib/money.js";
import type { LedgerFilterSeed } from "../lib/ledger-filter.js";
import { RawTransactionPanel } from "../components/RawTransactionPanel.js";

interface Filters {
  accountId: string;
  from: string;
  to: string;
  tagId: string;
  status: string;
  source: string;
  /** "" is any movement, "true" only transfers, "false" everything else. */
  transfer: string;
  minAmount: string;
  maxAmount: string;
  q: string;
}

const EMPTY_FILTERS: Filters = {
  accountId: "",
  from: "",
  to: "",
  tagId: "",
  status: "",
  source: "",
  transfer: "",
  minAmount: "",
  maxAmount: "",
  q: "",
};

/** Where a movement came from; the same three the server knows. */
const SOURCES = ["manual", "csv-import", "enable-banking"] as const;

/** Row counts the ledger offers per page. The API accepts up to 500. */
const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 25;

export function TransactionsView({
  csrf,
  seed,
}: {
  csrf: string;
  /** Filters the ledger opens with, when a dashboard chart sent the user here. */
  seed?: LedgerFilterSeed;
}) {
  const accounts = useCollection<Account>("accounts", csrf, true);
  const tags = useCollection<Tag>("tags", csrf, true);

  const [filters, setFilters] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    tagId: seed?.tagId ?? "",
    from: seed?.from ?? "",
    to: seed?.to ?? "",
  }));

  const [items, setItems] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  /** The movement being written in the form above the ledger. */
  const [composer, setComposer] = useState<TransactionDraft>(() =>
    emptyTransactionDraft(new Date().toISOString().slice(0, 10)),
  );
  /** The movement being corrected, with the row to hand focus back to. */
  const [editor, setEditor] = useState<
    { transaction: Transaction; draft: TransactionDraft; opener: HTMLElement | null } | undefined
  >(undefined);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [rawOpen, setRawOpen] = useState<string | undefined>(undefined);

  const composerCurrency = draftCurrency(composer, accounts.items);
  // The amount filter is written in one currency: the account's own when the
  // filter names one, the app default otherwise, exactly like the composer.
  const filterCurrency =
    accounts.items.find((candidate) => candidate.id === filters.accountId)?.defaultCurrency ??
    "EUR";
  const filterAmountMinor = (value: string): number | undefined => {
    if (value.trim() === "") return undefined;
    try {
      return parseAmountToMinor(value, filterCurrency);
    } catch {
      return Number.NaN;
    }
  };
  const minAmountMinor = filterAmountMinor(filters.minAmount);
  const maxAmountMinor = filterAmountMinor(filters.maxAmount);
  const amountFilterBroken =
    Number.isNaN(minAmountMinor) || Number.isNaN(maxAmountMinor)
      ? `Write the amount as a number, like ${filterCurrency === "JPY" ? "1500" : "-12.30"}, in ${filterCurrency}.`
      : undefined;
  // An edit keeps the movement's own currency unless the account changes: a USD
  // movement booked on a EUR account must stay USD.
  const editorCurrency = editor
    ? editor.draft.accountId === editor.transaction.accountId
      ? editor.transaction.currency
      : draftCurrency(editor.draft, accounts.items, editor.transaction.currency)
    : "EUR";

  // The ledger pages on the server: `offset` picks the window and `total` says
  // how many rows the filter matches in the vault, not how many came back.
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = (page - 1) * pageSize + items.length;

  // Every filter change starts a different result set, so it opens on its own
  // first page instead of keeping a page number that may no longer exist.
  const updateFilters = useCallback((next: Filters) => {
    setFilters(next);
    setPage(1);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const offset = (page - 1) * pageSize;
    try {
      const response = await api.searchTransactions({
        ...(filters.accountId ? { accountId: filters.accountId } : {}),
        ...(filters.from ? { from: filters.from } : {}),
        ...(filters.to ? { to: filters.to } : {}),
        ...(filters.tagId ? { tags: filters.tagId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.source ? { source: filters.source } : {}),
        ...(filters.transfer ? { transfer: filters.transfer === "true" } : {}),
        ...(minAmountMinor === undefined || Number.isNaN(minAmountMinor) ? {} : { minAmountMinor }),
        ...(maxAmountMinor === undefined || Number.isNaN(maxAmountMinor) ? {} : { maxAmountMinor }),
        ...(filters.q ? { q: filters.q } : {}),
        limit: pageSize,
        offset,
      });
      setItems(response.items);
      setTotal(response.total);
      // The page can empty under the user — the last row on it was deleted, or
      // a write moved it out of the filter. Fold back to the last page that
      // still has rows instead of showing an empty table with a non-zero total.
      if (response.items.length === 0 && response.total > 0 && offset > 0) {
        setPage(Math.max(1, Math.ceil(response.total / pageSize)));
        return;
      }
      setError(undefined);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  /** A click on a cell — or the row's Edit button — opens the same dialog. */
  function startEditing(transaction: Transaction, opener: HTMLElement | null) {
    setFormError(undefined);
    setEditor({ transaction, draft: draftFromTransaction(transaction), opener });
  }

  function closeEditor() {
    const opener = editor?.opener ?? null;
    setEditor(undefined);
    setFormError(undefined);
    opener?.focus?.();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(undefined);
    const account = accounts.items.find((candidate) => candidate.id === composer.accountId);
    if (!account) {
      setFormError("Choose an account first.");
      return;
    }
    let amountMinor: number;
    try {
      amountMinor = parseAmountToMinor(composer.amount, composerCurrency);
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
        accountId: account.id,
        bookingDate: composer.bookingDate,
        amountMinor,
        currency: account.defaultCurrency,
        status: composer.status,
        source: "manual",
        tagIds: composer.tagIds,
        ...(composer.transfer === undefined ? {} : { transfer: composer.transfer }),
        createdAt: now,
        updatedAt: now,
        ...(composer.payee ? { payee: composer.payee } : {}),
        ...(composer.note ? { userNote: composer.note } : {}),
      });
      // The form keeps its place but empties itself: the next movement starts
      // from a clean draft, exactly like the composer above it did.
      setComposer(emptyTransactionDraft(new Date().toISOString().slice(0, 10)));
      // A new row is normally dated today, so it belongs at the top of the
      // newest-first order: show it instead of leaving the user on page 5.
      if (page === 1) {
        await load();
      } else {
        setPage(1);
      }
    } catch (cause) {
      setFormError(describeError(cause));
    }
  }

  async function saveEdits(event: React.FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setFormError(undefined);
    let amountMinor: number;
    try {
      amountMinor = parseAmountToMinor(editor.draft.amount, editorCurrency);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Invalid amount");
      return;
    }
    try {
      await api.update<Transaction>(csrf, "transactions", editor.transaction.id, {
        ...editor.transaction,
        accountId: editor.draft.accountId,
        bookingDate: editor.draft.bookingDate,
        amountMinor,
        currency: editorCurrency,
        payee: editor.draft.payee,
        userNote: editor.draft.note,
        status: editor.draft.status,
        tagIds: editor.draft.tagIds,
        ...(editor.draft.transfer === undefined ? {} : { transfer: editor.draft.transfer }),
      });
      closeEditor();
      await load();
    } catch (cause) {
      setFormError(describeError(cause));
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
    <section
      className={loading ? "view is-refreshing" : "view"}
      aria-busy={loading || undefined}
      aria-labelledby="transactions-title"
    >
      <SectionIntro icon="transactions" eyebrow="Encrypted ledger" />

      {/* The movement is written here, above the ledger it lands in: the form is
          the first thing on the page, so a button that opened a dialog over the
          same fields only stood between the reader and the work. */}
      <form className="card" aria-label="New transaction" onSubmit={submit}>
        <header>
          <div>
            <h2 className="card-title">New transaction</h2>
            <span className="sub">
              Tagging rules run when you save. The new movement appears at the top of the ledger.
            </span>
          </div>
        </header>
        <TransactionFields
          draft={composer}
          accounts={accounts.items}
          tags={tags.items}
          currency={composerCurrency}
          tagLabel="Select tags for the new transaction"
          onChange={setComposer}
        />
        {formError ? <Banner tone="error">{formError}</Banner> : null}
        <div className="cell-actions">
          <button type="submit" className="btn primary">
            <Icon name="plus" size={16} />
            Add transaction
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setFormError(undefined);
              setComposer(emptyTransactionDraft(new Date().toISOString().slice(0, 10)));
            }}
          >
            <Icon name="refresh" size={16} />
            Reset
          </button>
        </div>
      </form>

      {editor ? (
        <Modal title={`Edit ${editor.transaction.payee ?? "transaction"}`} onClose={closeEditor}>
          <form className="stack" onSubmit={saveEdits}>
            <p className="muted">
              Saving replaces this movement and keeps its id and its revision chain. Editing never
              re-runs the tagging rules, so a tag you removed by hand stays removed.
            </p>
            <TransactionFields
              draft={editor.draft}
              accounts={accounts.items}
              tags={tags.items}
              currency={editorCurrency}
              tagLabel={`Edit tags for ${editor.transaction.payee ?? editor.transaction.id}`}
              onChange={(next) => setEditor({ ...editor, draft: next })}
            />
            {formError ? <Banner tone="error">{formError}</Banner> : null}
            <div className="cell-actions">
              <button type="submit" className="btn primary">
                <Icon name="check" size={16} />
                Save changes
              </button>
              <button type="button" className="btn" onClick={closeEditor}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      <div className="card">
        <header>
          <div>
            <p className="eyebrow">Ledger</p>
            <h2>Every movement</h2>
            <span className="sub">
              {total} matching · click the date, payee, note, tags or amount to edit the movement
            </span>
          </div>
          <button type="button" className="btn small" onClick={() => updateFilters(EMPTY_FILTERS)}>
            Reset filters
          </button>
        </header>
        <fieldset className="fieldset framed">
          <label>
            Search
            <input
              value={filters.q}
              onChange={(event) => updateFilters({ ...filters, q: event.target.value })}
              placeholder="payee, note, description"
            />
          </label>
          <label>
            Filter by account
            <select
              value={filters.accountId}
              onChange={(event) => updateFilters({ ...filters, accountId: event.target.value })}
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
              onChange={(event) => updateFilters({ ...filters, tagId: event.target.value })}
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
              onChange={(event) => updateFilters({ ...filters, status: event.target.value })}
            >
              <option value="">Any</option>
              <option value="booked">booked</option>
              <option value="pending">pending</option>
            </select>
          </label>
          <label>
            Source
            <select
              value={filters.source}
              onChange={(event) => updateFilters({ ...filters, source: event.target.value })}
            >
              <option value="">Any</option>
              {SOURCES.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </label>
          <label>
            Filter by transfer
            <select
              value={filters.transfer}
              onChange={(event) => updateFilters({ ...filters, transfer: event.target.value })}
            >
              <option value="">Any</option>
              <option value="true">Only transfers</option>
              <option value="false">Everything else</option>
            </select>
          </label>
          <label>
            Min amount ({filterCurrency})
            <input
              value={filters.minAmount}
              inputMode="decimal"
              placeholder="-100.00"
              onChange={(event) => updateFilters({ ...filters, minAmount: event.target.value })}
            />
          </label>
          <label>
            Max amount ({filterCurrency})
            <input
              value={filters.maxAmount}
              inputMode="decimal"
              placeholder="100.00"
              onChange={(event) => updateFilters({ ...filters, maxAmount: event.target.value })}
            />
          </label>
          <label>
            From
            <input
              type="date"
              value={filters.from}
              onChange={(event) => updateFilters({ ...filters, from: event.target.value })}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={filters.to}
              onChange={(event) => updateFilters({ ...filters, to: event.target.value })}
            />
          </label>
        </fieldset>
        {amountFilterBroken ? (
          <p className="muted" role="alert">
            {amountFilterBroken}
          </p>
        ) : null}
        <div className="quick-filters">
          <span className="eyebrow" style={{ margin: 0 }}>
            View
          </span>
          <button
            type="button"
            className={
              filters.q === "" &&
              filters.accountId === "" &&
              filters.tagId === "" &&
              filters.status === "" &&
              filters.source === "" &&
              filters.transfer === "" &&
              filters.minAmount === "" &&
              filters.maxAmount === "" &&
              filters.from === "" &&
              filters.to === ""
                ? "tag-pill active"
                : "tag-pill"
            }
            aria-pressed={filters.tagId === ""}
            onClick={() => updateFilters({ ...filters, tagId: "" })}
          >
            All movements
          </button>
          {tags.items.map((tag) => (
            <button
              key={tag.id}
              type="button"
              className={filters.tagId === tag.id ? "tag-pill active" : "tag-pill"}
              style={filters.tagId === tag.id ? undefined : tagPillStyle(tag.color)}
              aria-pressed={filters.tagId === tag.id}
              onClick={() =>
                updateFilters({ ...filters, tagId: filters.tagId === tag.id ? "" : tag.id })
              }
            >
              #{tag.name}
            </button>
          ))}
        </div>

        {(formError ?? error) ? <Banner tone="error">{formError ?? error}</Banner> : null}

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
                <th className="cell-amount">Amount</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((transaction) => (
                <Fragment key={transaction.id}>
                  <tr>
                    <td
                      className="mono cell-nowrap"
                      onClick={(event) => startEditing(transaction, event.currentTarget)}
                    >
                      {transaction.bookingDate}
                    </td>
                    <td onClick={(event) => startEditing(transaction, event.currentTarget)}>
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
                    </td>
                    <td onClick={(event) => startEditing(transaction, event.currentTarget)}>
                      {transaction.userNote ?? "—"}
                    </td>
                    <td onClick={(event) => startEditing(transaction, event.currentTarget)}>
                      {transaction.tagIds.length === 0 ? (
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
                      {transaction.transfer === true ? (
                        <span
                          className="chip neutral"
                          title="Counted in the ledger and the balance, not as income or spending"
                        >
                          transfer
                        </span>
                      ) : null}
                    </td>
                    <td
                      className="cell-amount"
                      onClick={(event) => startEditing(transaction, event.currentTarget)}
                    >
                      <Money minor={transaction.amountMinor} currency={transaction.currency} />
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
                        <button
                          type="button"
                          className="btn small"
                          aria-label={`Edit ${transaction.payee ?? "transaction"}`}
                          onClick={(event) => startEditing(transaction, event.currentTarget)}
                        >
                          Edit
                        </button>
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
        <div className="pager">
          <p className="pager-summary" role="status">
            {total === 0
              ? "No transactions to page through"
              : `Showing ${firstRow}–${lastRow} of ${total} transactions`}
          </p>
          <div className="cell-actions">
            <label className="pager-size">
              Rows per page
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn small"
              disabled={page <= 1}
              onClick={() => setPage(Math.max(1, page - 1))}
            >
              Previous
            </button>
            <span className="chip mono neutral">
              Page {page} / {pageCount}
            </span>
            <button
              type="button"
              className="btn small"
              disabled={page >= pageCount}
              onClick={() => setPage(Math.min(pageCount, page + 1))}
            >
              Next
            </button>
          </div>
        </div>
        {!loading && total === 0 ? <Empty>No transactions match.</Empty> : null}
      </div>
    </section>
  );
}
