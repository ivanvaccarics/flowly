import { useState } from "react";
import type { VaultStatus } from "@flowly/web-contracts";
import { Icon, type IconName } from "./icons.js";
import { Banner } from "./ui.js";
import { AccountsView } from "../views/AccountsView.js";
import { DashboardView } from "../views/DashboardView.js";
import { RulesView } from "../views/RulesView.js";
import { SettingsView } from "../views/SettingsView.js";
import { TagsView } from "../views/TagsView.js";
import { TransactionsView } from "../views/TransactionsView.js";

const NAVIGATION: Array<{ key: string; label: string; icon: IconName }> = [
  { key: "dashboard", label: "Dashboard", icon: "dashboard" },
  { key: "accounts", label: "Accounts", icon: "accounts" },
  { key: "transactions", label: "Transactions", icon: "transactions" },
  { key: "tags", label: "Tags", icon: "tags" },
  { key: "rules", label: "Rules", icon: "rules" },
  { key: "settings", label: "Settings", icon: "settings" },
];

export interface AppShellProps {
  csrf: string;
  status: VaultStatus | undefined;
  busy: boolean;
  error: string | undefined;
  onLock: (scope: "current" | "all") => Promise<void>;
  onChangePassphrase: (current: string, next: string) => Promise<boolean>;
  onClearError: () => void;
}

export function AppShell({
  csrf,
  status,
  busy,
  error,
  onLock,
  onChangePassphrase,
  onClearError,
}: AppShellProps) {
  const [view, setView] = useState("dashboard");
  const vaultId = status?.vaultId ?? null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <span className="brand-icon">
              <Icon name="shield" size={16} />
            </span>
            Flowly
          </div>
          <p className="nav-section">Vault navigation</p>
          <nav className="nav" aria-label="Sections">
            {NAVIGATION.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-current={view === item.key ? "page" : undefined}
                onClick={() => setView(item.key)}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="sidebar-footer">
          <div className="vault-card">
            <span className="avatar">
              <Icon name="shield" size={18} />
            </span>
            <span className="stack" style={{ flex: 1 }}>
              <strong>Local vault</strong>
              <span className="sub mono">
                {status?.storageEngine ?? "sqlcipher"} · v{status?.schemaVersion ?? "?"}
              </span>
            </span>
            <span title="No cloud connection">
              <Icon name="check" size={16} />
            </span>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <div className="topbar-status">
          <span className="status-pill" title="Encrypted vault, unlocked for this session">
            <span className="pulse" />
            <strong>
              {status?.storageEngine ?? "sqlcipher"} v{status?.schemaVersion ?? "?"} unlocked
            </strong>
            <span className="badge">AES-256</span>
          </span>
          {vaultId ? (
            <span className="chip mono neutral" title={`Vault identifier ${vaultId}`}>
              {vaultId.slice(0, 13)}
            </span>
          ) : null}
        </div>

        <div className="cell-actions">
          <button
            type="button"
            className="btn small"
            onClick={() => setView("settings")}
            title="Export and import live in Settings"
          >
            <Icon name="download" size={14} />
            Export data
          </button>
          <button
            type="button"
            className="btn small primary"
            disabled={busy}
            onClick={() => void onLock("current")}
          >
            <Icon name="lock" size={14} />
            Lock session
          </button>
          <button
            type="button"
            className="btn small danger"
            disabled={busy}
            onClick={() => void onLock("all")}
          >
            <Icon name="shield" size={14} />
            Lock all
          </button>
        </div>
      </header>

      <main className="content">
        <div className="view">
          {error ? <Banner tone="error">{error}</Banner> : null}
          {view === "dashboard" ? (
            <DashboardView
              vaultId={vaultId}
              status={status}
              onNewTransaction={() => setView("transactions")}
              onSeeAllTransactions={() => setView("transactions")}
              onExportData={() => setView("settings")}
            />
          ) : null}
          {view === "accounts" ? <AccountsView csrf={csrf} /> : null}
          {view === "transactions" ? <TransactionsView csrf={csrf} /> : null}
          {view === "tags" ? <TagsView csrf={csrf} /> : null}
          {view === "rules" ? <RulesView csrf={csrf} /> : null}
          {view === "settings" ? (
            <SettingsView
              csrf={csrf}
              busy={busy}
              vaultStatus={status}
              onChangePassphrase={onChangePassphrase}
              onClearError={onClearError}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
