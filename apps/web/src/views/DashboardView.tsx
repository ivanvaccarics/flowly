import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account, Dashboard, Tag, Transaction, VaultStatus } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { Icon } from "../components/icons.js";
import { Banner, Chip, Empty, Money, PageHeader } from "../components/ui.js";
import { describeError } from "../hooks/use-workspace.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function shiftRange(from: string, to: string): { from: string; to: string } {
  const start = new Date(`${from}T00:00:00.000Z`).getTime();
  const end = new Date(`${to}T00:00:00.000Z`).getTime();
  const days = Math.max(1, Math.round((end - start) / 86_400_000) + 1);
  const previousEnd = start - 86_400_000;
  return {
    from: new Date(previousEnd - (days - 1) * 86_400_000).toISOString().slice(0, 10),
    to: new Date(previousEnd).toISOString().slice(0, 10),
  };
}

function delta(
  current: number,
  previous: number,
): { text: string; tone: "income" | "expense" | "neutral" } {
  if (previous === 0) return { text: "no previous data", tone: "neutral" };
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return {
    text: `${change >= 0 ? "+" : ""}${change.toFixed(1)}% vs previous period`,
    tone: change >= 0 ? "income" : "expense",
  };
}

function formatPerMinor(minor: number, currency: string): string {
  const units = ["BHD", "KWD"].includes(currency) ? 3 : ["JPY", "KRW"].includes(currency) ? 0 : 2;
  const value = Math.abs(minor) / 10 ** units;
  return `${minor < 0 ? "-" : ""}${value.toFixed(units === 0 ? 0 : 2)}`;
}

export interface DashboardViewProps {
  vaultId: string | null;
  status: VaultStatus | undefined;
  onNewTransaction: () => void;
  onSeeAllTransactions: () => void;
  onExportData: () => void;
}

export function DashboardView({
  vaultId,
  status,
  onNewTransaction,
  onSeeAllTransactions,
  onExportData,
}: DashboardViewProps) {
  const [from, setFrom] = useState(startOfMonth);
  const [to, setTo] = useState(today);
  const [preset, setPreset] = useState<"month" | "quarter" | "year" | "custom">("month");
  const [dashboard, setDashboard] = useState<Dashboard | undefined>(undefined);
  const [previous, setPrevious] = useState<Dashboard | undefined>(undefined);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [current, earlier, accountList, tagList, transactions] = await Promise.all([
        api.dashboard({ from, to }),
        api.dashboard(shiftRange(from, to)),
        api.list<Account>("accounts"),
        api.list<Tag>("tags"),
        api.searchTransactions({ limit: 5 }),
      ]);
      setDashboard(current);
      setPrevious(earlier);
      setAccounts(accountList.items);
      setTags(tagList.items);
      setRecent(transactions.items);
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

  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );

  const spendingTotal =
    dashboard?.spendingByTag.reduce((total, entry) => total + entry.spentMinor, 0) ?? 0;
  const days = Math.max(
    1,
    Math.round(
      (new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) /
        86_400_000,
    ) + 1,
  );
  const topSpendTag = dashboard?.spendingByTag[0];
  const primaryCurrency = dashboard?.cashFlow[0]?.currency ?? "EUR";
  const primaryBuckets =
    dashboard?.cashFlowBuckets?.filter((bucket) => bucket.currency === primaryCurrency) ?? [];

  function applyPreset(next: "month" | "quarter" | "year" | "custom") {
    setPreset(next);
    if (next === "month") {
      setFrom(startOfMonth());
      setTo(today());
    } else if (next === "quarter") {
      setFrom(monthsAgo(3));
      setTo(today());
    } else if (next === "year") {
      setFrom(`${today().slice(0, 4)}-01-01`);
      setTo(today());
    }
  }

  return (
    <section className="view" aria-labelledby="dashboard-title">
      <PageHeader
        eyebrow={`Sovereign vault ledger · ${status?.storageEngine ?? "sqlcipher"} v${status?.schemaVersion ?? "?"}`}
        title="Financial overview"
        titleId="dashboard-title"
        lead={`${accounts.length} accounts · period ${from} → ${to} · aggregates use booked transactions only`}
        facts={
          <>
            <Chip tone="income" icon="shield">
              zero-telemetry
            </Chip>
            <Chip tone="vault" icon="lock">
              AES-256-GCM
            </Chip>
          </>
        }
        actions={
          <>
            <div className="segmented" role="group" aria-label="Period">
              {(
                [
                  ["month", "This month"],
                  ["quarter", "3 months"],
                  ["year", "Year"],
                  ["custom", "Custom"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={preset === key ? "segment active" : "segment"}
                  aria-pressed={preset === key}
                  onClick={() => applyPreset(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button type="button" className="btn ghost" onClick={onExportData}>
              <Icon name="download" size={16} />
              Export data
            </button>
            <button type="button" className="btn primary" onClick={onNewTransaction}>
              <Icon name="plus" size={16} />
              New transaction
            </button>
          </>
        }
      />

      {preset === "custom" ? (
        <div className="fieldset">
          <label>
            From
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <button
            type="button"
            className="btn small"
            disabled={loading}
            onClick={() => void load()}
          >
            Apply range
          </button>
        </div>
      ) : null}

      {error ? <Banner tone="error">{error}</Banner> : null}

      <div className="dash">
        <div className="dash-main">
          {(dashboard?.cashFlow ?? []).map((flow) => {
            const previousFlow = previous?.cashFlow.find(
              (entry) => entry.currency === flow.currency,
            );
            const balanceTotal = (dashboard?.balances ?? [])
              .filter((line) => line.currency === flow.currency)
              .reduce((total, line) => total + line.balanceMinor, 0);
            const savingsRate =
              flow.incomeMinor === 0 ? null : (flow.netMinor / flow.incomeMinor) * 100;
            const incomeDelta = delta(flow.incomeMinor, previousFlow?.incomeMinor ?? 0);
            const expenseDelta = delta(flow.expensesMinor, previousFlow?.expensesMinor ?? 0);
            return (
              <div className="grid-cards" key={flow.currency}>
                <article className="metric">
                  <header>
                    <span className="eyebrow">Total balance · {flow.currency}</span>
                    <span className="metric-icon vault">
                      <Icon name="accounts" size={16} />
                    </span>
                  </header>
                  <span className="metric-value">
                    {formatPerMinor(balanceTotal, flow.currency)}
                  </span>
                  <span className="muted">{accounts.length} accounts</span>
                </article>
                <article className="metric">
                  <header>
                    <span className="eyebrow">Income</span>
                    <span className="metric-icon income">
                      <Icon name="check" size={16} />
                    </span>
                  </header>
                  <span className="metric-value">
                    {formatPerMinor(flow.incomeMinor, flow.currency)}
                  </span>
                  <Chip tone={incomeDelta.tone}>{incomeDelta.text}</Chip>
                </article>
                <article className="metric">
                  <header>
                    <span className="eyebrow">Expenses</span>
                    <span className="metric-icon expense">
                      <Icon name="alert" size={16} />
                    </span>
                  </header>
                  <span className="metric-value">
                    {formatPerMinor(flow.expensesMinor, flow.currency)}
                  </span>
                  <Chip tone={expenseDelta.tone}>{expenseDelta.text}</Chip>
                </article>
                <article className="metric">
                  <header>
                    <span className="eyebrow">Net flow</span>
                    <span className="metric-icon vault">
                      {savingsRate === null ? "—" : `${savingsRate.toFixed(1)}%`}
                    </span>
                  </header>
                  <span className="metric-value primary">
                    {flow.netMinor >= 0 ? "+" : ""}
                    {formatPerMinor(flow.netMinor, flow.currency)}
                  </span>
                  <span className="muted">
                    {flow.transactionCount} booked transactions
                    {savingsRate === null ? "" : " · savings rate"}
                  </span>
                </article>
              </div>
            );
          })}

          <div className="card">
            <header>
              <div>
                <h2>Cash flow</h2>
                <span className="sub">
                  Income vs expenses per week · {from} → {to}
                </span>
              </div>
              <div className="legend">
                <span className="legend-item">
                  <span className="dot income" /> Income
                </span>
                <span className="legend-item">
                  <span className="dot expense" /> Expenses
                </span>
                <span className="legend-item">
                  <span className="dot line" /> Net
                </span>
              </div>
            </header>
            {primaryBuckets.length > 0 ? (
              <CashFlowChart buckets={primaryBuckets} currency={primaryCurrency} />
            ) : (
              <Empty>No booked transactions in this period.</Empty>
            )}
          </div>

          <div className="card">
            <header>
              <h2>Recent transactions</h2>
              <div className="cell-actions">
                <Chip tone="neutral">{recent.length} records</Chip>
                <button type="button" className="btn small" onClick={() => onSeeAllTransactions()}>
                  See all →
                </button>
              </div>
            </header>
            {recent.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Beneficiary / cause</th>
                      <th>Method / account</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th style={{ textAlign: "right" }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((transaction) => {
                      const account = accountById.get(transaction.accountId);
                      const [year, month, day] = transaction.bookingDate.split("-");
                      return (
                        <tr key={transaction.id}>
                          <td>
                            <span className="tx">
                              <span className="tx-icon">
                                <Icon name="transactions" size={14} />
                              </span>
                              <span className="stack">
                                <strong>
                                  {transaction.payee ?? transaction.description ?? "—"}
                                </strong>
                                <span className="sub mono">
                                  {transaction.providerTransactionId ?? transaction.source}
                                </span>
                              </span>
                            </span>
                          </td>
                          <td>
                            <span className="stack">
                              <span>{account?.name ?? transaction.accountId.slice(0, 8)}</span>
                              <span className="sub">{account?.type ?? "—"}</span>
                            </span>
                          </td>
                          <td>
                            {transaction.tagIds.length === 0 ? (
                              <span className="muted">—</span>
                            ) : (
                              transaction.tagIds.map((id) => {
                                const tag = tagById.get(id);
                                return (
                                  <span
                                    key={id}
                                    className="tag-pill"
                                    style={
                                      tag?.color
                                        ? {
                                            borderColor: `${tag.color}55`,
                                            background: `${tag.color}14`,
                                          }
                                        : undefined
                                    }
                                  >
                                    {tag?.name ?? "…"}
                                  </span>
                                );
                              })
                            )}
                          </td>
                          <td>
                            <Chip tone={transaction.status === "booked" ? "income" : "vault"}>
                              {transaction.status}
                            </Chip>
                          </td>
                          <td>
                            <span className="stack mono date-cell">
                              <span>{day}</span>
                              <span>{MONTHS[Number(month) - 1]}</span>
                              <span>{year}</span>
                            </span>
                          </td>
                          <td>
                            <Money
                              minor={transaction.amountMinor}
                              currency={transaction.currency}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No transactions yet. Record the first one.</Empty>
            )}
          </div>
        </div>

        <aside className="dash-side">
          <div className="card">
            <header>
              <div>
                <h2>Spending breakdown</h2>
                <span className="sub">Total: {formatPerMinor(spendingTotal, primaryCurrency)}</span>
              </div>
            </header>
            {dashboard && dashboard.spendingByTag.length > 0 ? (
              <>
                <div className="stacked-bar" role="img" aria-label="Spending share by tag">
                  {dashboard.spendingByTag.map((entry) => (
                    <span
                      key={`${entry.tagId}-${entry.currency}`}
                      style={{
                        width: `${(entry.spentMinor / spendingTotal) * 100}%`,
                        background: tagById.get(entry.tagId)?.color ?? "#4648d4",
                      }}
                    />
                  ))}
                </div>
                <ul className="legend-rows">
                  {dashboard.spendingByTag.map((entry) => (
                    <li key={`${entry.tagId}-${entry.currency}`}>
                      <span className="legend-item">
                        <span
                          className="dot"
                          style={{ background: tagById.get(entry.tagId)?.color ?? "#4648d4" }}
                        />
                        {entry.tagName}
                      </span>
                      <span className="mono">
                        {formatPerMinor(entry.spentMinor, entry.currency)}
                      </span>
                      <span className="muted mono">
                        {((entry.spentMinor / spendingTotal) * 100).toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <Empty>No tagged spending in this period.</Empty>
            )}
            <div className="summary-row">
              <span className="stack">
                <span className="eyebrow">Average daily spend</span>
                <span className="mono">
                  {formatPerMinor(Math.round(spendingTotal / days), primaryCurrency)}
                </span>
              </span>
              <span className="stack">
                <span className="eyebrow">Top category</span>
                <span>{topSpendTag?.tagName ?? "—"}</span>
              </span>
            </div>
          </div>

          <div className="card">
            <header>
              <h2>Accounts summary</h2>
            </header>
            {dashboard && dashboard.balances.length > 0 ? (
              <ul className="account-rows">
                {dashboard.balances.map((line) => {
                  const account = accounts.find((candidate) => candidate.id === line.accountId);
                  return (
                    <li key={`${line.accountId}-${line.currency}`}>
                      <span className="tx-icon">
                        <Icon name="accounts" size={14} />
                      </span>
                      <span className="stack" style={{ flex: 1 }}>
                        <strong>{line.accountName}</strong>
                        <span className="sub mono">
                          {account?.type ?? "account"} · {line.currency}
                          {line.isDefaultCurrency ? "" : " · other currency"}
                        </span>
                      </span>
                      <Money minor={line.balanceMinor} currency={line.currency} />
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>No accounts yet.</Empty>
            )}
          </div>

          <div className="card">
            <header>
              <h2>Local vault status</h2>
              <Chip tone="income" icon="shield">
                offline safe
              </Chip>
            </header>
            <p className="muted">
              {status?.storageEngine ?? "sqlcipher"} at rest with AES-256-GCM. No cloud connection
              is active and the data stays inside this server's vault folder.
            </p>
            <dl className="facts" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <dt>Vault id</dt>
                <dd title={vaultId ?? ""}>{vaultId ? vaultId.slice(0, 13) : "—"}</dd>
              </div>
              <div>
                <dt>Schema</dt>
                <dd>v{status?.schemaVersion ?? "?"}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      <p className="page-footer">
        Flowly · no account, no cloud, no tracking. Aggregates use booked transactions only and
        never convert between currencies.
      </p>
    </section>
  );
}

function CashFlowChart({
  buckets,
  currency,
}: {
  buckets: Array<{
    label: string;
    from: string;
    to: string;
    incomeMinor: number;
    expensesMinor: number;
  }>;
  currency: string;
}) {
  const width = 640;
  const height = 220;
  const padding = { top: 16, right: 12, bottom: 34, left: 12 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(
    1,
    ...buckets.flatMap((bucket) => [bucket.incomeMinor, bucket.expensesMinor]),
  );
  const slot = chartWidth / buckets.length;
  const barWidth = Math.max(6, Math.min(18, slot / 3));
  const scale = (value: number) => chartHeight - (value / max) * (chartHeight - 8);
  const netPoints = buckets.map((bucket, index) => {
    const x = padding.left + slot * index + slot / 2;
    const y = scale(Math.abs(bucket.incomeMinor - bucket.expensesMinor));
    return `${x},${y}`;
  });

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Income and expenses per week in ${currency}`}
      >
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <line
            key={fraction}
            x1={padding.left}
            x2={width - padding.right}
            y1={padding.top + chartHeight * (1 - fraction)}
            y2={padding.top + chartHeight * (1 - fraction)}
            className="grid-line"
          />
        ))}
        {buckets.map((bucket, index) => {
          const centre = padding.left + slot * index + slot / 2;
          return (
            <g key={`${bucket.from}-${index}`}>
              <rect
                x={centre - barWidth - 2}
                y={padding.top + scale(bucket.incomeMinor)}
                width={barWidth}
                height={chartHeight - scale(bucket.incomeMinor)}
                rx={3}
                className="bar income"
              />
              <rect
                x={centre + 2}
                y={padding.top + scale(bucket.expensesMinor)}
                width={barWidth}
                height={chartHeight - scale(bucket.expensesMinor)}
                rx={3}
                className="bar expense"
              />
              <text x={centre} y={height - 18} textAnchor="middle" className="axis-label">
                {bucket.label}
              </text>
              <text x={centre} y={height - 6} textAnchor="middle" className="axis-sub">
                {bucket.from.slice(5)} → {bucket.to.slice(5)}
              </text>
            </g>
          );
        })}
        <polyline points={netPoints.join(" ")} className="net-line" />
        {netPoints.map((point, index) => {
          const [x, y] = point.split(",");
          return <circle key={index} cx={x} cy={y} r={3.5} className="net-dot" />;
        })}
      </svg>
    </div>
  );
}
