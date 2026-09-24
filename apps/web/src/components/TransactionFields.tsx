import type { Account, Tag, Transaction } from "@flowly/web-contracts";
import { TagPicker } from "./TagPicker.js";
import { formatMinorToAmount } from "../lib/money.js";

/** Everything a movement is made of, while it is still being written. */
export interface TransactionDraft {
  accountId: string;
  bookingDate: string;
  /** The amount as typed; parsed into minor units when the form is sent. */
  amount: string;
  payee: string;
  note: string;
  status: "booked" | "pending";
  tagIds: string[];
  /**
   * Three states, and the third one is the point: `undefined` lets the transfer
   * rules decide, while `true` and `false` are the reader's own word and stay
   * that way. A row that was never touched keeps whatever it had.
   */
  transfer?: boolean;
}

export function emptyTransactionDraft(bookingDate: string): TransactionDraft {
  return {
    accountId: "",
    bookingDate,
    amount: "",
    payee: "",
    note: "",
    status: "booked",
    tagIds: [],
  };
}

/** The stored movement as a dialog holds it; the amount comes back as text. */
export function draftFromTransaction(transaction: Transaction): TransactionDraft {
  return {
    accountId: transaction.accountId,
    bookingDate: transaction.bookingDate,
    amount: formatMinorToAmount(transaction.amountMinor, transaction.currency),
    payee: transaction.payee ?? "",
    note: transaction.userNote ?? "",
    status: transaction.status,
    tagIds: [...transaction.tagIds],
    ...(transaction.transfer === undefined ? {} : { transfer: transaction.transfer }),
  };
}

/** The currency a draft is written in: the account's own default. */
export function draftCurrency(
  draft: TransactionDraft,
  accounts: readonly Account[],
  fallback = "EUR",
): string {
  return accounts.find((account) => account.id === draft.accountId)?.defaultCurrency ?? fallback;
}

/**
 * The fields a movement is written with, shared by the composer and the edit
 * dialog, so adding one and correcting one are the same form.
 */
export function TransactionFields({
  draft,
  accounts,
  tags,
  currency,
  tagLabel,
  onChange,
}: {
  draft: TransactionDraft;
  accounts: Account[];
  tags: Tag[];
  currency: string;
  tagLabel: string;
  onChange: (next: TransactionDraft) => void;
}) {
  return (
    <>
      <div className="fieldset framed">
        <label>
          Account
          <select
            value={draft.accountId}
            onChange={(event) => onChange({ ...draft, accountId: event.target.value })}
            required
          >
            <option value="">Select…</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Booking date
          <input
            type="date"
            value={draft.bookingDate}
            onChange={(event) => onChange({ ...draft, bookingDate: event.target.value })}
            required
          />
        </label>
        <label>
          Amount ({currency})
          <input
            value={draft.amount}
            onChange={(event) => onChange({ ...draft, amount: event.target.value })}
            placeholder="-12.30"
            required
          />
        </label>
        <label>
          Payee
          <input
            value={draft.payee}
            onChange={(event) => onChange({ ...draft, payee: event.target.value })}
          />
        </label>
        <label>
          Note
          <input
            value={draft.note}
            onChange={(event) => onChange({ ...draft, note: event.target.value })}
          />
        </label>
        <label>
          Status
          <select
            value={draft.status}
            onChange={(event) =>
              onChange({ ...draft, status: event.target.value as "booked" | "pending" })
            }
          >
            <option value="booked">booked</option>
            <option value="pending">pending</option>
          </select>
        </label>
        <label>
          Transfer
          <select
            value={draft.transfer === undefined ? "" : String(draft.transfer)}
            onChange={(event) => {
              // "Automatic" means the field is not there at all, so the rules
              // own the decision again.
              const next: TransactionDraft = { ...draft };
              delete next.transfer;
              if (event.target.value !== "") next.transfer = event.target.value === "true";
              onChange(next);
            }}
          >
            <option value="">Automatic</option>
            <option value="true">Between my accounts</option>
            <option value="false">Not a transfer</option>
          </select>
        </label>
      </div>
      <fieldset className="fieldset">
        <legend>Tags</legend>
        <TagPicker
          tags={tags}
          selected={draft.tagIds}
          onChange={(tagIds) => onChange({ ...draft, tagIds })}
          label={tagLabel}
        />
      </fieldset>
    </>
  );
}
