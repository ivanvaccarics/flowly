import { useState } from "react";
import type { VaultStatus } from "@flowly/web-contracts";
import { AccountsPanel } from "./AccountsPanel.js";
import { BudgetsPanel } from "./BudgetsPanel.js";
import { DataPanel } from "./DataPanel.js";
import { DashboardPanel } from "./DashboardPanel.js";
import { RulesPanel } from "./RulesPanel.js";
import { TagsPanel } from "./TagsPanel.js";
import { TransactionsPanel } from "./TransactionsPanel.js";

const TABS = [
  ["dashboard", "Dashboard"],
  ["accounts", "Accounts"],
  ["transactions", "Transactions"],
  ["tags", "Tags"],
  ["budgets", "Budgets"],
  ["rules", "Rules"],
  ["data", "Import & export"],
] as const;

type Tab = (typeof TABS)[number][0];

export interface WorkspaceProps {
  csrf: string;
  status: VaultStatus | undefined;
  busy: boolean;
  error: string | undefined;
  onLock: (scope: "current" | "all") => Promise<void>;
  onChangePassphrase: (current: string, next: string) => Promise<boolean>;
  onClearError: () => void;
}

export function Workspace({
  csrf,
  status,
  busy,
  error,
  onLock,
  onChangePassphrase,
  onClearError,
}: WorkspaceProps) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [changed, setChanged] = useState(false);

  return (
    <main className="workspace">
      <header className="workspace-header">
        <div>
          <p className="brand">💸 Flowly</p>
          <h1>Your vault</h1>
          <p className="muted">
            {status?.storageEngine ?? "unknown"} · schema v{status?.schemaVersion ?? "?"} · unlocked
          </p>
        </div>
        <div className="actions">
          <button type="button" disabled={busy} onClick={() => void onLock("current")}>
            Lock this session
          </button>
          <button type="button" disabled={busy} onClick={() => void onLock("all")}>
            Lock all sessions
          </button>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="Sections">
        {TABS.map(([value, label]) => (
          <button
            key={value}
            role="tab"
            type="button"
            aria-selected={tab === value}
            className={tab === value ? "tab active" : "tab"}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </nav>

      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}

      <div role="tabpanel" aria-label={tab}>
        {tab === "accounts" ? <AccountsPanel csrf={csrf} /> : null}
        {tab === "dashboard" ? <DashboardPanel /> : null}
        {tab === "transactions" ? <TransactionsPanel csrf={csrf} /> : null}
        {tab === "tags" ? <TagsPanel csrf={csrf} /> : null}
        {tab === "budgets" ? <BudgetsPanel csrf={csrf} /> : null}
        {tab === "rules" ? <RulesPanel csrf={csrf} /> : null}
        {tab === "data" ? <DataPanel csrf={csrf} /> : null}
      </div>

      <footer className="workspace-footer">
        <details>
          <summary>Change passphrase</summary>
          <form
            className="row-form"
            onSubmit={(event) => {
              event.preventDefault();
              onClearError();
              void onChangePassphrase(current, next).then((ok) => {
                setChanged(ok);
                if (ok) {
                  setCurrent("");
                  setNext("");
                }
              });
            }}
          >
            <label>
              Current
              <input
                type="password"
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
              />
            </label>
            <label>
              New
              <input
                type="password"
                value={next}
                onChange={(event) => setNext(event.target.value)}
              />
            </label>
            <button type="submit" disabled={busy || current === "" || next === ""}>
              Change
            </button>
          </form>
          {changed ? (
            <p role="status" className="ok">
              Passphrase changed. Data stays encrypted exactly as before.
            </p>
          ) : null}
        </details>
      </footer>
    </main>
  );
}
