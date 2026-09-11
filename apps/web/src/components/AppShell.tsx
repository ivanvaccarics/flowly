import { useState } from "react";
import type { VaultStatus } from "@flowly/web-contracts";
import { Icon, type IconName } from "./icons.js";
import { Banner, Chip } from "./ui.js";
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
            <span className="stack">
              <strong>Local vault</strong>
              <span className="sub mono">{status?.storageEngine ?? "sqlcipher"}</span>
            </span>
            <Chip tone="vault">schema v{status?.schemaVersion ?? "?"}</Chip>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <div className="topbar-status">
          <span className="chip neutral">
            <span className="pulse" /> Unlocked
          </span>
          <Chip tone="neutral" icon="lock">
            AES-256-GCM
          </Chip>
          <Chip tone="neutral">vault {status?.vaultFormatVersion ?? 1}</Chip>
        </div>
        <div className="cell-actions">
          <button
            type="button"
            className="btn small"
            disabled={busy}
            onClick={() => void onLock("current")}
          >
            <Icon name="lock" size={14} />
            Lock this session
          </button>
          <button
            type="button"
            className="btn small danger"
            disabled={busy}
            onClick={() => void onLock("all")}
          >
            <Icon name="shield" size={14} />
            Lock all sessions
          </button>
        </div>
      </header>

      <main className="content">
        <div className="view">
          {error ? <Banner tone="error">{error}</Banner> : null}
          {view === "dashboard" ? <DashboardView /> : null}
          {view === "accounts" ? <AccountsView csrf={csrf} /> : null}
          {view === "transactions" ? <TransactionsView csrf={csrf} /> : null}
          {view === "tags" ? <TagsView csrf={csrf} /> : null}
          {view === "rules" ? <RulesView csrf={csrf} /> : null}
          {view === "settings" ? (
            <SettingsView
              csrf={csrf}
              busy={busy}
              onChangePassphrase={onChangePassphrase}
              onClearError={onClearError}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
