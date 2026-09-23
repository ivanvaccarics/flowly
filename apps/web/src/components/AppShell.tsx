import { useEffect, useState } from "react";
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
 * One entry per section: the sidebar label, the `h1` the top bar shows for that
 * section (the id is what every view points its `aria-labelledby` at), the
 * breadcrumb above it and the icon.
 */
const NAVIGATION: Array<{
  key: string;
  label: string;
  group: string;
  title: string;
  icon: IconName;
}> = [
  {
    key: "dashboard",
    label: "Dashboard",
    group: "Analysis & trend",
    title: "Financial overview",
    icon: "dashboard",
  },
  {
    key: "accounts",
    label: "Accounts",
    group: "Money & accounts",
    title: "Accounts & resources",
    icon: "accounts",
  },
  {
    key: "transactions",
    label: "Transactions",
    group: "Analysis & trend",
    title: "Transactions",
    icon: "transactions",
  },
  {
    key: "tags",
    label: "Tags",
    group: "Automation & taxonomy",
    title: "Tags",
    icon: "tags",
  },
  {
    key: "rules",
    label: "Rules",
    group: "Automation & taxonomy",
    title: "Tagging & automation",
    icon: "rules",
  },
  {
    key: "settings",
    label: "Settings",
    group: "Vault & data",
    title: "Settings & vault data",
    icon: "settings",
  },
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
  busy: boolean;
  error: string | undefined;
  onLock: (scope: "current" | "all") => Promise<void>;
  onChangePassphrase: (current: string, next: string) => Promise<boolean>;
  onClearError: () => void;
}

export function AppShell({
  csrf,
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
              <img src="/logo-mark-mono.svg" alt="" width={11} height={20} />
            </span>
            Flowly
          </div>
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
              </button>
            ))}
          </nav>
        </div>
      </aside>

      <header className="topbar">
        <div className="topbar-heading">
          <div className="topbar-heading-text">
            <p className="topbar-eyebrow eyebrow">{section.group}</p>
            <h1 className="topbar-title" id={`${section.key}-title`}>
              {section.title}
            </h1>
          </div>
        </div>

        <div className="cell-actions">
          <time className="clock-chip" dateTime={new Date().toISOString()} title="Local time">
            <Icon name="clock" size={14} />
            {localTime}
          </time>
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
