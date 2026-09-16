import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account, Dashboard, Tag, Transaction, VaultStatus } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { Icon } from "../components/icons.js";
import { Banner, Chip, Empty, Money, PageHeader, tagPillStyle } from "../components/ui.js";
import { BankingSyncCard } from "../components/BankingSyncCard.js";
import { describeError } from "../hooks/use-workspace.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Slice colours for tags that have no colour of their own. */
const SPENDING_COLOURS = [
  "#0d9488",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#10b981",
  "#0ea5e9",
  "#ec4899",
];

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
  csrf: string;
  onNewTransaction: () => void;
  onSeeAllTransactions: () => void;
  onExportData: () => void;
  onOpenSettings: () => void;
}

export function DashboardView({
  vaultId,
  status,
  csrf,
  onNewTransaction,
  onSeeAllTransactions,
  onExportData,
  onOpenSettings,
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
  // Spending is grouped per currency: Flowly never adds unlike currencies into
  // one number without a real exchange rate, not even for a chart total.
  const spendingGroups = useMemo(() => {
    const groups = new Map<string, Dashboard["spendingByTag"]>();
    for (const entry of dashboard?.spendingByTag ?? []) {
      groups.set(entry.currency, [...(groups.get(entry.currency) ?? []), entry]);
    }
    return [...groups.entries()]
      .map(([currency, entries]) => ({
        currency,
        entries,
        totalMinor: entries.reduce((total, entry) => total + entry.spentMinor, 0),
      }))
      .sort((left, right) => right.totalMinor - left.totalMinor);
  }, [dashboard]);
  const colourOf = useCallback(
    (tagId: string, index: number) =>
      tagById.get(tagId)?.color ??
      SPENDING_COLOURS[index % SPENDING_COLOURS.length] ??
      SPENDING_COLOURS[0]!,
    [tagById],
  );

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
        eyebrow="Sovereign vault ledger"
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

      {/* The metric row spans the whole content column, as in the mockups: the
          focal number of each currency sits beside the secondary panels. */}
      {(dashboard?.cashFlow ?? []).map((flow) => {
        const previousFlow = previous?.cashFlow.find((entry) => entry.currency === flow.currency);
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
              <span className="metric-value">{formatPerMinor(balanceTotal, flow.currency)}</span>
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
            <article className="metric lead">
              <header>
                <span className="eyebrow">Net flow</span>
                <span className="metric-icon vault">
                  {savingsRate === null ? "—" : `${savingsRate.toFixed(1)}%`}
                </span>
              </header>
              <span className="metric-value">
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

      <div className="dash">
        <div className="dash-main">
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
                                    style={tagPillStyle(tag?.color)}
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
          <BankingSyncCard csrf={csrf} onOpenSettings={onOpenSettings} onSynced={load} />
          <div className="card">
            <header>
              <div>
                <h2>Spending breakdown</h2>
                <span className="sub">
                  {spendingGroups.length > 1
                    ? "One pie per currency · totals never mix currencies"
                    : `Total: ${formatPerMinor(spendingGroups[0]?.totalMinor ?? spendingTotal, spendingGroups[0]?.currency ?? primaryCurrency)}`}
                </span>
              </div>
            </header>
            {dashboard && dashboard.spendingByTag.length > 0 ? (
              spendingGroups.map((group) => (
                <SpendingPie
                  key={group.currency}
                  currency={group.currency}
                  totalMinor={group.totalMinor}
                  entries={group.entries}
                  colourOf={colourOf}
                />
              ))
            ) : (
              <Empty>No tagged spending in this period.</Empty>
            )}
            <div className="summary-row">
              <span className="stack">
                <span className="eyebrow">Average daily spend</span>
                <span className="mono">
                  {formatPerMinor(
                    Math.round(
                      (spendingGroups.find((group) => group.currency === primaryCurrency)
                        ?.totalMinor ?? spendingTotal) / days,
                    ),
                    primaryCurrency,
                  )}
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
              Encrypted at rest with AES-256-GCM. No cloud connection is active and the data stays
              inside this server's vault folder.
            </p>
            <dl className="facts" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div>
                <dt>Vault id</dt>
                <dd title={vaultId ?? ""}>{vaultId ? vaultId.slice(0, 13) : "—"}</dd>
              </div>
              <div>
                <dt>Last unlocked</dt>
                <dd>
                  {status?.lastUnlockedAt ? new Date(status.lastUnlockedAt).toLocaleString() : "—"}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      <p className="page-footer">
        Flowly · no account, no cloud, no tracking. Cash-flow aggregates use booked transactions
        only and never convert between currencies.
      </p>
    </section>
  );
}

/**
 * The dashboard's pie chart: one arc per tag, drawn as an SVG donut so the
 * period total can sit in the middle. Hand-rolled — Flowly ships no charting
 * dependency and must work with no Internet access.
 */
function SpendingPie({
  entries,
  totalMinor,
  currency,
  colourOf,
}: {
  entries: Array<{ tagId: string; tagName: string; currency: string; spentMinor: number }>;
  totalMinor: number;
  currency: string;
  colourOf: (tagId: string, index: number) => string;
}) {
  const size = 168;
  const centre = size / 2;
  const radius = 66;
  const circumference = 2 * Math.PI * radius;
  // A hair of space between slices keeps neighbours visually separate.
  const gap = entries.length > 1 ? 3 : 0;
  let consumed = 0;
  const slices = entries.map((entry, index) => {
    const share = totalMinor > 0 ? entry.spentMinor / totalMinor : 0;
    const length = Math.max(0, share * circumference - gap);
    const slice = {
      key: `${entry.tagId}-${entry.currency}`,
      colour: colourOf(entry.tagId, index),
      dash: `${length} ${circumference - length}`,
      offset: -consumed,
    };
    consumed += share * circumference;
    return slice;
  });
  const totalText = formatPerMinor(totalMinor, currency);
  const label = `Spending by tag in ${currency}: ${entries
    .map(
      (entry) =>
        `${entry.tagName} ${totalMinor > 0 ? Math.round((entry.spentMinor / totalMinor) * 100) : 0}%`,
    )
    .join(", ")}`;

  return (
    <div className="donut">
      <div className="donut-figure">
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
          <circle className="donut-track" cx={centre} cy={centre} r={radius} />
          {slices.map((slice) => (
            <circle
              key={slice.key}
              className="donut-slice"
              cx={centre}
              cy={centre}
              r={radius}
              stroke={slice.colour}
              strokeDasharray={slice.dash}
              strokeDashoffset={slice.offset}
              transform={`rotate(-90 ${centre} ${centre})`}
            />
          ))}
        </svg>
        <div className="donut-center">
          <span className="eyebrow" style={{ margin: 0 }}>
            {currency}
          </span>
          <span className={totalText.length > 9 ? "total small" : "total"}>{totalText}</span>
          <span className="sub">spent</span>
        </div>
      </div>
      <ul className="legend-rows">
        {entries.map((entry, index) => (
          <li key={`${entry.tagId}-${entry.currency}`}>
            <span className="legend-item">
              <span className="dot" style={{ background: colourOf(entry.tagId, index) }} />
              {entry.tagName}
            </span>
            <span className="mono">{formatPerMinor(entry.spentMinor, entry.currency)}</span>
            <span className="muted mono">
              {totalMinor > 0 ? ((entry.spentMinor / totalMinor) * 100).toFixed(1) : "0.0"}%
            </span>
          </li>
        ))}
      </ul>
    </div>
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
  // With a year of weekly buckets the labels would collide, so only every nth
  // one is drawn; the tooltip-free chart stays readable at any range length.
  const labelStep = Math.max(1, Math.ceil(buckets.length / 12));
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
              {index % labelStep === 0 ? (
                <>
                  <text x={centre} y={height - 18} textAnchor="middle" className="axis-label">
                    {bucket.label}
                  </text>
                  <text x={centre} y={height - 6} textAnchor="middle" className="axis-sub">
                    {bucket.from.slice(5)} → {bucket.to.slice(5)}
                  </text>
                </>
              ) : null}
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
