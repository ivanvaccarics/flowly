import { useEffect, useState } from "react";
import { api, type BankLinkSummary } from "../api/client.js";
import { useBanking } from "../hooks/use-banking.js";
import { Icon } from "./icons.js";
import { Chip } from "./ui.js";

/**
 * Dashboard entry point for Enable Banking: shows when the vault last pulled
 * bank data and lets the user launch a sync by hand.
 */
export function BankingSyncCard({
  csrf,
  onOpenSettings,
  onSynced,
}: {
  csrf: string;
  onOpenSettings: () => void;
  onSynced?: () => void;
}) {
  const banking = useBanking(csrf, true);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const status = banking.status;

  useEffect(() => {
    if (message === undefined) return;
    const timer = setTimeout(() => setMessage(undefined), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  const connected = status?.configured ?? false;
  const links = status?.links ?? [];
  const mapped = links
    .flatMap((link) => link.accounts)
    .filter((account) => account.status === "mapped");
  const needsReconnect = links.filter(
    (link) => link.status !== "authorized" && link.status !== "pending",
  );
  const syncState = status?.sync;
  const lastReport = syncState?.lastReport;
  const blockedUntil = nextBlockedUntil(links);

  async function sync() {
    const result = await banking.run(() => api.syncBanking(csrf));
    if (!result) return;
    const { report } = result;
    setMessage(
      report.rateLimited
        ? "The bank refused the read: its daily access limit is reached, so nothing new was imported."
        : report.blocked > 0
          ? "One linked bank is still inside its daily access cooldown, so Flowly skipped it."
          : report.failed > 0
            ? `Sync finished with issues: ${report.created} new, ${report.updated} updated, ${report.failed} failed.`
            : `Sync finished: ${report.created} new, ${report.updated} updated, ${report.unchanged} unchanged.`,
    );
    onSynced?.();
  }

  return (
    <section className="card">
      <header>
        <div>
          <h2 className="card-title">Bank sync</h2>
          <span className="sub">
            {connected
              ? `${mapped.length} paired ${mapped.length === 1 ? "account" : "accounts"} · ${
                  links.length
                } ${links.length === 1 ? "bank" : "banks"}`
              : "Connect Enable Banking to import your bank data"}
          </span>
        </div>
        <Chip tone={connected ? "income" : "neutral"} icon="bank">
          {status?.connection?.environment ?? "not connected"}
        </Chip>
      </header>

      {connected ? (
        <>
          <p className="muted">
            {status?.autoSync
              ? "Flowly refreshes your banks every time you unlock the vault."
              : "Automatic refresh on login is off; use Sync now."}{" "}
            Last sync:{" "}
            {syncState?.lastSyncAt ? formatStamp(syncState.lastSyncAt) : "not yet in this session"}.
          </p>
          {needsReconnect.length > 0 ? (
            <p className="banner error" role="alert">
              <Icon name="alert" size={16} />
              <span>
                {needsReconnect.map((link) => link.aspspName).join(", ")} needs to be reconnected in
                Settings.
              </span>
            </p>
          ) : null}
          {blockedUntil ? (
            <p className="banner error" role="alert">
              <Icon name="alert" size={16} />
              <span>
                The bank refused the read: its daily access limit is reached. Flowly will try again
                after {formatStamp(blockedUntil)}.
              </span>
            </p>
          ) : lastReport && lastReport.errors.length > 0 ? (
            <p className="muted">
              {lastReport.failed} failed · {lastReport.skipped} skipped rows.{" "}
              {lastReport.errors[0]?.message}
            </p>
          ) : null}
          <div className="cell-actions">
            <button
              type="button"
              className="btn primary"
              disabled={banking.busy || syncState?.running}
              onClick={() => void sync()}
            >
              <Icon name="refresh" size={16} />
              {syncState?.running ? "Syncing…" : "Sync now"}
            </button>
            <button type="button" className="btn" onClick={onOpenSettings}>
              <Icon name="settings" size={16} />
              Manage banks
            </button>
          </div>
        </>
      ) : (
        <div className="cell-actions">
          <button type="button" className="btn primary" onClick={onOpenSettings}>
            <Icon name="bank" size={16} />
            Connect to Enable Banking
          </button>
        </div>
      )}

      {banking.error ? (
        <p className="banner error" role="alert">
          <Icon name="alert" size={16} />
          <span>{banking.error}</span>
        </p>
      ) : null}
      {message ? <p className="banner ok">{message}</p> : null}
    </section>
  );
}

function formatStamp(value: string): string {
  return new Date(value).toISOString().replace("T", " ").slice(0, 16);
}

/** The first instant at which a linked bank stops refusing reads for the day. */
function nextBlockedUntil(links: BankLinkSummary[]): string | undefined {
  const now = Date.now();
  return links
    .flatMap((link) => (link.syncBlockedUntil ? [link.syncBlockedUntil] : []))
    .filter((value) => Date.parse(value) > now)
    .sort((left, right) => Date.parse(left) - Date.parse(right))[0];
}
