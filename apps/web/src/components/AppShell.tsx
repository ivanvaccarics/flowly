import { useEffect, useState } from "react";
import type { VaultStatus } from "@flowly/web-contracts";
import { Icon, type IconName } from "./icons.js";
import { Banner } from "./ui.js";
import { AccountsView } from "../views/AccountsView.js";
import { DashboardView } from "../views/DashboardView.js";
import { ledgerSeedKey, type LedgerFilterSeed } from "../lib/ledger-filter.js";
import { RulesView } from "../views/RulesView.js";
import { SettingsView } from "../views/SettingsView.js";
import { TagsView } from "../views/TagsView.js";
import { TransactionsView } from "../views/TransactionsView.js";

/**
 * One entry per section: the sidebar label, the `h1` the page is titled with
 * (the id is what every view points its `aria-labelledby` at) and the icon.
 * The heading is read, not printed: the active sidebar item and each page's
 * own headline name the section on screen.
 */
const NAVIGATION: Array<{
  key: string;
  label: string;
  title: string;
  icon: IconName;
}> = [
  { key: "dashboard", label: "Dashboard", title: "Financial overview", icon: "dashboard" },
  { key: "accounts", label: "Accounts", title: "Accounts & resources", icon: "accounts" },
  { key: "transactions", label: "Transactions", title: "Transactions", icon: "transactions" },
  { key: "tags", label: "Tags", title: "Tags", icon: "tags" },
  { key: "rules", label: "Rules", title: "Tagging & automation", icon: "rules" },
  { key: "settings", label: "Settings", title: "Settings & vault data", icon: "settings" },
];

/** The hour the vault was opened, as the browser's own clock reads it. */
function unlockTime(status: VaultStatus | undefined): string | undefined {
  if (!status?.lastUnlockedAt) return undefined;
  const opened = new Date(status.lastUnlockedAt);
  if (Number.isNaN(opened.getTime())) return undefined;
  return opened.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export interface AppShellProps {
  csrf: string;
  /** The vault the session is open on, for the status line in the top bar. */
  status?: VaultStatus | undefined;
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
  /** Set when a dashboard chart sends the user to the ledger on a slice. */
  const [ledgerSeed, setLedgerSeed] = useState<LedgerFilterSeed | undefined>(undefined);
  // Section anchors: a shortcut can open Settings straight at the block it is
  // about instead of the top of the page. Export is reached from the dashboard
  // hero and the navigation; the top bar keeps only the session controls.
  const [anchor, setAnchor] = useState<string | undefined>(undefined);
  const section = NAVIGATION.find((entry) => entry.key === view) ?? NAVIGATION[0]!;
  const openedAt = unlockTime(status);

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
              <img src="/logo-mark-mono.svg" alt="" width={9} height={17} />
            </span>
            <img className="brand-wordmark" src="/logo-wordmark.svg" alt="Flowly" height={17} />
          </div>
          <p className="eyebrow sidebar-label">Your vault</p>
          <nav className="nav" aria-label="Sections">
            {NAVIGATION.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-current={view === item.key ? "page" : undefined}
                onClick={() => {
                  // Opening the ledger from the menu means all of it again.
                  if (item.key === "transactions") setLedgerSeed(undefined);
                  setView(item.key);
                }}
              >
                <Icon name={item.icon} size={18} />
                {item.label}
                {view === item.key ? <span className="nav-dot" aria-hidden="true" /> : null}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-foot">
          <div className="user-card">
            <span className="user-avatar" aria-hidden="true">
              <img src="/logo-mark-mono.svg" alt="" width={9} height={15} />
            </span>
            <span className="user-text">
              <strong>Local vault</strong>
              <span className="sub">
                {status?.state === "locked" ? "Locked" : "Unlocked on this server"}
              </span>
            </span>
            <span className="cell-actions">
              <button
                type="button"
                className="icon-btn"
                title="Lock session"
                aria-label="Lock session"
                disabled={busy}
                onClick={() => void onLock("current")}
              >
                <Icon name="lock" size={16} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Lock all"
                aria-label="Lock all"
                disabled={busy}
                onClick={() => void onLock("all")}
              >
                <Icon name="shield" size={16} />
              </button>
            </span>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <h1 className="sr-only" id={`${section.key}-title`}>
          {section.title}
        </h1>

        <div className="vault-status">
          <span className="status-chip">
            <Icon name="lock" size={15} />
            Encrypted locally
          </span>
          {openedAt ? (
            <>
              <span className="status-sep" aria-hidden="true" />
              <span className="status-chip">
                <Icon name="clock" size={15} />
                Last unlocked {openedAt}
              </span>
            </>
          ) : null}
        </div>

        <div className="cell-actions">
          <button type="button" className="btn" onClick={openExport}>
            <Icon name="download" size={16} />
            Backup vault
          </button>
        </div>
      </header>

      <main className="content">
        <div className="view">
          {error ? <Banner tone="error">{error}</Banner> : null}
          {view === "dashboard" ? (
            <DashboardView
              csrf={csrf}
              onNewTransaction={() => {
                setLedgerSeed(undefined);
                setView("transactions");
              }}
              onSeeAllTransactions={(options) => {
                setLedgerSeed(options);
                setView("transactions");
              }}
              onExportData={openExport}
              onOpenSettings={() => setView("settings")}
            />
          ) : null}
          {view === "accounts" ? <AccountsView csrf={csrf} /> : null}
          {view === "transactions" ? (
            <TransactionsView
              key={ledgerSeedKey(ledgerSeed)}
              csrf={csrf}
              {...(ledgerSeed ? { seed: ledgerSeed } : {})}
            />
          ) : null}
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
