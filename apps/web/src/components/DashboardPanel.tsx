import { useCallback, useEffect, useState } from "react";
import type { Dashboard } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { describeError } from "../hooks/use-workspace.js";
import { formatMoney } from "../lib/money.js";

function firstDayOfMonth(): string {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

export function DashboardPanel() {
  const [from, setFrom] = useState(firstDayOfMonth);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
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

  return (
    <section className="panel" aria-labelledby="dashboard-title">
      <h2 id="dashboard-title">Dashboard</h2>

      <form
        className="row-form"
        onSubmit={(event) => {
          event.preventDefault();
          void load();
        }}
      >
        <label>
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button type="submit" disabled={loading}>
          Refresh
        </button>
      </form>

      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : null}
      {loading ? <p role="status">Computing…</p> : null}

      {dashboard ? (
        <>
          <div className="cards">
            {dashboard.cashFlow.length === 0 ? (
              <p className="muted">No booked transactions in this period.</p>
            ) : (
              dashboard.cashFlow.map((flow) => (
                <article key={flow.currency} className="card">
                  <h3>{flow.currency}</h3>
                  <p className="amount">{formatMoney(flow.netMinor, flow.currency)} net</p>
                  <p className="muted">
                    in {formatMoney(flow.incomeMinor, flow.currency)} · out{" "}
                    {formatMoney(flow.expensesMinor, flow.currency)}
                  </p>
                  <p className="muted">{flow.transactionCount} transactions</p>
                </article>
              ))
            )}
          </div>

          <h3>Balances</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Currency</th>
                <th>Balance</th>
                <th>Transactions</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.balances.map((line) => (
                <tr key={`${line.accountId}-${line.currency}`}>
                  <td>
                    {line.accountName}
                    {line.isDefaultCurrency ? null : (
                      <span className="muted"> (other currency)</span>
                    )}
                  </td>
                  <td>{line.currency}</td>
                  <td className="amount">{formatMoney(line.balanceMinor, line.currency)}</td>
                  <td>{line.transactionCount}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Spending by tag</h3>
          {dashboard.spendingByTag.length === 0 ? (
            <p className="muted">No tagged spending in this period.</p>
          ) : (
            <ul className="list">
              {dashboard.spendingByTag.map((entry) => (
                <li key={`${entry.tagId}-${entry.currency}`}>
                  <span>
                    <strong>{entry.tagName}</strong> · {entry.transactionCount} transactions
                  </span>
                  <span className="amount">{formatMoney(entry.spentMinor, entry.currency)}</span>
                </li>
              ))}
            </ul>
          )}

          <h3>Budgets</h3>
          {dashboard.budgets.length === 0 ? (
            <p className="muted">No active budgets yet.</p>
          ) : (
            <ul className="list">
              {dashboard.budgets.map((budget) => (
                <li key={budget.budgetId}>
                  <span>
                    <strong>{budget.name}</strong> · {budget.periodStart} → {budget.periodEnd}
                  </span>
                  <span className={`amount budget-${budget.status}`}>
                    {formatMoney(budget.spentMinor, budget.currency)} /{" "}
                    {formatMoney(budget.limitMinor, budget.currency)} ({budget.percentUsed}%)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
