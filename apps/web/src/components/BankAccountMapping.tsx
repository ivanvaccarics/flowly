import { useState } from "react";
import type { Account } from "@flowly/web-contracts";
import type {
  BankAccountMappingInput,
  BankingAccountSummary,
  BankLinkSummary,
} from "../api/client.js";
import { Icon } from "./icons.js";
import { Chip, Empty } from "./ui.js";
import { ACCOUNT_TYPES, CURRENCIES } from "../lib/money.js";

export interface DiscoveredAccount {
  providerAccountUid: string;
  status: BankingAccountSummary["status"];
  suggestedName: string;
  suggestedType: string;
  suggestedCurrency?: string;
  currency?: string;
  maskedIban?: string;
  providerName?: string;
  cashAccountType?: string;
}

export interface BankAccountMappingProps {
  link: Pick<BankLinkSummary, "id" | "aspspName" | "accounts">;
  discovered: DiscoveredAccount[];
  accounts: Account[];
  busy: boolean;
  onMap: (providerAccountUid: string, body: BankAccountMappingInput) => Promise<void>;
}

/**
 * For every account the bank shared, the user decides whether Flowly creates a
 * new account, pairs an existing one, or ignores the provider account.
 */
export function BankAccountMapping({
  link,
  discovered,
  accounts,
  busy,
  onMap,
}: BankAccountMappingProps) {
  const mapped = new Map(link.accounts.map((account) => [account.providerAccountUid, account]));
  if (discovered.length === 0) return <Empty>No accounts were shared by this bank.</Empty>;
  return (
    <ul className="stack rule-list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {discovered.map((account) => (
        <li key={account.providerAccountUid}>
          <MappingRow
            account={account}
            current={mapped.get(account.providerAccountUid)}
            accounts={accounts}
            busy={busy}
            onMap={onMap}
            aspspName={link.aspspName}
          />
        </li>
      ))}
    </ul>
  );
}

function MappingRow({
  account,
  current,
  accounts,
  busy,
  onMap,
  aspspName,
}: {
  account: DiscoveredAccount;
  current: BankingAccountSummary | undefined;
  accounts: Account[];
  busy: boolean;
  onMap: BankAccountMappingProps["onMap"];
  aspspName: string;
}) {
  const [mode, setMode] = useState<"create" | "pair">("create");
  const [name, setName] = useState(account.suggestedName || `${aspspName} account`);
  const [type, setType] = useState(account.suggestedType || "checking");
  const [currency, setCurrency] = useState(
    account.suggestedCurrency && CURRENCIES.includes(account.suggestedCurrency)
      ? account.suggestedCurrency
      : (account.suggestedCurrency ?? "EUR"),
  );
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [editing, setEditing] = useState(false);

  const isMapped = current?.status === "mapped";
  const isIgnored = current?.status === "ignored";
  const showForm = !isMapped && (!isIgnored || editing);
  return (
    <section className="rule-tile">
      <header className="rule-tile-head">
        <div className="stack">
          <strong>{account.providerName ?? account.maskedIban ?? "Bank account"}</strong>
          <span className="sub mono">
            {account.maskedIban ?? "no IBAN"} · {account.currency ?? "?"}
            {current?.accountName ? ` · mapped to ${current.accountName}` : ""}
          </span>
        </div>
        {isMapped ? (
          <Chip tone="income" icon="check">
            paired
          </Chip>
        ) : isIgnored ? (
          <Chip tone="neutral">ignored</Chip>
        ) : (
          <Chip tone="vault">needs a decision</Chip>
        )}
      </header>

      {showForm ? (
        <div className="fieldset framed">
          <label>
            What should Flowly do?
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as "create" | "pair")}
            >
              <option value="create">Create a new account</option>
              <option value="pair">Pair with an existing account</option>
            </select>
          </label>
          {mode === "create" ? (
            <>
              <label>
                Account name
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                Type
                <select value={type} onChange={(event) => setType(event.target.value)}>
                  {ACCOUNT_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Currency
                <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  {[...new Set([currency, ...CURRENCIES])].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn primary"
                disabled={busy || name.trim() === ""}
                onClick={() =>
                  void onMap(account.providerAccountUid, {
                    mode: "create",
                    name,
                    type,
                    currency,
                  })
                }
              >
                <Icon name="plus" size={16} />
                Create account and link
              </button>
            </>
          ) : (
            <>
              <label>
                Existing account
                <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                  {accounts.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} · {option.defaultCurrency}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="btn primary"
                disabled={busy || accounts.length === 0 || accountId === ""}
                onClick={() => void onMap(account.providerAccountUid, { mode: "pair", accountId })}
              >
                <Icon name="check" size={16} />
                Pair account
              </button>
            </>
          )}
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() =>
              void onMap(account.providerAccountUid, { mode: "ignore" }).then(() =>
                setEditing(false),
              )
            }
          >
            Ignore this account
          </button>
        </div>
      ) : null}
      {isIgnored && !editing ? (
        <button
          type="button"
          className="btn ghost"
          disabled={busy}
          onClick={() => setEditing(true)}
        >
          Change mapping
        </button>
      ) : null}
    </section>
  );
}
