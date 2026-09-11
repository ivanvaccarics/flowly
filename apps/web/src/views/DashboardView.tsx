import { useCallback, useEffect, useState } from "react";
import type { Dashboard } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { Banner, Chip, Empty, Metric, Money } from "../components/ui.js";
import { describeError } from "../hooks/use-workspace.js";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonth(): string {
  return `${today().slice(0, 7)}-01`;
}

function monthsAgo(count: number): string {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count, 1));
  return date.toISOString().slice(0, 10);
}

export function DashboardView() {
  const [from, setFrom] = useState(startOfMonth);
  const [to, setTo] = useState(today);
  const [dashboard, setDashboard] = useState<Dashboard | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDashboard(await api.dashboard({ from, to }));
      setError(undefined);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxTagSpend = Math.max(
    1,
    ...(dashboard?.spendingByTag.map((entry) => entry.spentMinor) ?? [1]),
  );

  return (
    <section className="view" aria-labelledby="dashboard-title">
      <div className="view-header">
        <div>
          <p className="eyebrow">Ledger overview · local vault</p>
          <h1 id="dashboard-title">Dashboard</h1>
        </div>
        <div className="fieldset">
          <label>
            From
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button type="button" className="btn small" onClick={() => setFrom(startOfMonth())}>
            This month
          </button>
          <button type="button" className="btn small" onClick={() => setFrom(monthsAgo(3))}>
            Last 3 months
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => setFrom(`${today().slice(0, 4)}-01-01`)}
          >
            This year
          </button>
          <button
            type="button"
            className="btn small primary"
            disabled={loading}
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {loading ? <Banner>Computing aggregates…</Banner> : null}

      <div className="grid-cards">
        {dashboard?.cashFlow.length ? (
          dashboard.cashFlow.map((flow) => (
            <Metric
              key={flow.currency}
              label={`Net flow · ${flow.currency}`}
              value={`${flow.netMinor < 0 ? "-" : ""}${(Math.abs(flow.netMinor) / 100).toFixed(2)}`}
              delta={`${flow.transactionCount} transactions`}
              deltaTone={flow.netMinor < 0 ? "expense" : "income"}
              hint={`in ${(flow.incomeMinor / 100).toFixed(2)} · out ${(flow.expensesMinor / 100).toFixed(2)}`}
            />
          ))
        ) : (
          <div className="metric">
            <span className="eyebrow">Net flow</span>
            <span className="metric-value">—</span>
            <span className="muted">No booked transactions in this period.</span>
          </div>
        )}
      </div>

      <div className="card">
        <header>
          <h2>Balances</h2>
          <Chip tone="neutral">booked only</Chip>
        </header>
        {dashboard && dashboard.balances.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Currency</th>
                  <th>Transactions</th>
                  <th style={{ textAlign: "right" }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.balances.map((line) => (
                  <tr key={`${line.accountId}-${line.currency}`}>
                    <td>
                      <span className="stack">
                        <strong>{line.accountName}</strong>
                        {line.isDefaultCurrency ? null : (
                          <span className="sub">other currency</span>
                        )}
                      </span>
                    </td>
                    <td className="mono">{line.currency}</td>
                    <td>{line.transactionCount}</td>
                    <td>
                      <Money minor={line.balanceMinor} currency={line.currency} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No accounts yet. Add one in the Accounts section.</Empty>
        )}
      </div>

      <div className="card">
        <header>
          <h2>Spending by tag</h2>
          <Chip tone="neutral">outflows only</Chip>
        </header>
        {dashboard && dashboard.spendingByTag.length > 0 ? (
          <ul className="rule-list">
            {dashboard.spendingByTag.map((entry) => (
              <li key={`${entry.tagId}-${entry.currency}`}>
                <div style={{ flex: "1 1 260px", display: "grid", gap: "0.35rem" }}>
                  <span>
                    <strong>{entry.tagName}</strong>{" "}
                    <span className="sub">
                      {entry.transactionCount} transactions · {entry.currency}
                    </span>
                  </span>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{ width: `${Math.round((entry.spentMinor / maxTagSpend) * 100)}%` }}
                    />
                  </span>
                </div>
                <Money minor={-entry.spentMinor} currency={entry.currency} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No tagged spending in this period.</Empty>
        )}
      </div>
    </section>
  );
}
