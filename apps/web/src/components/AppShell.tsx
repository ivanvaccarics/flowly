import { useEffect, useState } from "react";
import type { VaultStatus } from "@flowly/web-contracts";
import { Icon, type IconName } from "./icons.js";
import { Banner } from "./ui.js";
import { AccountsView } from "../views/AccountsView.js";
import { DashboardView } from "../views/DashboardView.js";
import { RulesView } from "../views/RulesView.js";
import { SettingsView } from "../views/SettingsView.js";
import { TagsView } from "../views/TagsView.js";
import { TransactionsView } from "../views/TransactionsView.js";

/**
 * One entry per section: the sidebar label, the `h1` the top bar shows for that
 * section (the id is what every view points its `aria-labelledby` at) and the
 * icon.
 */
const NAVIGATION: Array<{ key: string; label: string; title: string; icon: IconName }> = [
  { key: "dashboard", label: "Dashboard", title: "Financial overview", icon: "dashboard" },
  { key: "accounts", label: "Accounts", title: "Accounts & resources", icon: "accounts" },
  { key: "transactions", label: "Transactions", title: "Transactions", icon: "transactions" },
  { key: "tags", label: "Tags", title: "Tags", icon: "tags" },
  { key: "rules", label: "Rules", title: "Tagging & automation", icon: "rules" },
  { key: "settings", label: "Settings", title: "Settings & vault data", icon: "settings" },
];

/** The wall clock in the top bar: local time, refreshed every 30 s. */
function useLocalTime(): string {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

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
  // Section anchors: a shortcut in the top bar (or the dashboard hero) can open
  // Settings straight at the block it is about instead of the top of the page.
  const [anchor, setAnchor] = useState<string | undefined>(undefined);
  const vaultId = status?.vaultId ?? null;
  const section = NAVIGATION.find((entry) => entry.key === view) ?? NAVIGATION[0]!;
  const localTime = useLocalTime();

  useEffect(() => {
    if (!anchor) return;
    const target = document.getElementById(anchor);
    setAnchor(undefined);
    if (!target) return;
    target.scrollIntoView?.({ block: "start" });
    target.focus({ preventScroll: true });
  }, [anchor, view]);

  function openExport() {
    setView("settings");
    setAnchor("settings-export");
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <div className="brand">
            <span className="brand-tile" aria-hidden="true">
              <img src="/logo-mark-mono.svg" alt="" width={22} height={22} />
            </span>
            Flowly
          </div>
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
              <span className="sub">Encrypted at rest</span>
            </span>
            <span title="No cloud connection">
              <Icon name="check" size={16} />
            </span>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <div className="topbar-heading">
          <h1 className="topbar-title" id={`${section.key}-title`}>
            {section.title}
          </h1>
          <div className="topbar-status">
            <span className="status-pill" title="Encrypted vault, unlocked for this session">
              <span className="pulse" />
              <strong>Vault unlocked</strong>
              <span className="badge">AES-256</span>
            </span>
            {vaultId ? (
              <span className="chip mono neutral" title={`Vault identifier ${vaultId}`}>
                {vaultId.slice(0, 13)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="cell-actions">
          <time className="clock-chip" dateTime={new Date().toISOString()} title="Local time">
            <Icon name="clock" size={14} />
            {localTime}
          </time>
          <button
            type="button"
            className="btn small"
            onClick={openExport}
            title="Export and import live in Settings"
          >
            <Icon name="download" size={14} />
            Export data
          </button>
          <button
            type="button"
            className="btn small danger"
            disabled={busy}
            onClick={() => void onLock("current")}
          >
            <Icon name="lock" size={14} />
            Lock session
          </button>
          <button
            type="button"
            className="btn small"
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
              csrf={csrf}
              onNewTransaction={() => setView("transactions")}
              onSeeAllTransactions={() => setView("transactions")}
              onExportData={openExport}
              onOpenSettings={() => setView("settings")}
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
              onChangePassphrase={onChangePassphrase}
              onClearError={onClearError}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
