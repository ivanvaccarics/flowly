import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account, Dashboard, Tag, Transaction } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { DashboardFilters } from "../components/DashboardFilters.js";
import { Icon } from "../components/icons.js";
import { Banner, Chip, Empty, Money, tagPillStyle } from "../components/ui.js";
import { BankingSyncCard } from "../components/BankingSyncCard.js";
import { describeError } from "../hooks/use-workspace.js";
import type { LedgerFilterSeed } from "../lib/ledger-filter.js";
import { formatDecimal, formatMinorToAmount, formatMoney } from "../lib/money.js";
import {
  MONTH_SHORT,
  monthsQuery,
  monthsRange,
  presetMonths,
  shiftMonths,
  type MonthPreset,
} from "../lib/months.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** What the period picker calls each preset, in the dashboard's own words. */
const PRESET_LABELS: Record<MonthPreset, string> = {
  month: "This month",
  quarter: "Last 3 months",
  year: "This year",
  custom: "Custom months",
};

/** The period, said inside a label: "Spent this month", "Income this year". */
const PERIOD_WORDS: Record<MonthPreset, string> = {
  month: "this month",
  quarter: "in 3 months",
  year: "this year",
  custom: "in this period",
};

function greetingOf(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** The dashboard reads the ledger ten rows at a time; the ledger itself pages 25. */
const RECENT_PAGE_SIZE = 10;

/** Slice colours for tags that have no colour of their own. */
const SPENDING_COLOURS = [
  "#1e6f4e",
  "#3b82f6",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
  "#10b981",
  "#0ea5e9",
  "#ec4899",
];

function delta(
  current: number,
  previous: number,
): { text: string; tone: "income" | "expense" | "neutral" } {
  if (previous === 0) return { text: "no previous data", tone: "neutral" };
  const change = ((current - previous) / Math.abs(previous)) * 100;
  return {
    text: `${change >= 0 ? "+" : ""}${formatDecimal(change)}% vs previous period`,
    tone: change >= 0 ? "income" : "expense",
  };
}

export interface DashboardViewProps {
  csrf: string;
  onNewTransaction: () => void;
  /**
   * Opens the ledger. A chart point passes the filter it stands for, so the
   * figures on the dashboard are one click away from the rows behind them.
   */
  onSeeAllTransactions: (seed?: LedgerFilterSeed) => void;
  onExportData: () => void;
  onOpenSettings: () => void;
}

export function DashboardView({
  csrf,
  onNewTransaction,
  onSeeAllTransactions,
  onExportData,
  onOpenSettings,
}: DashboardViewProps) {
  const [months, setMonths] = useState<string[]>(() => presetMonths("month"));
  const [preset, setPreset] = useState<MonthPreset>("month");
  const [anchorYear, setAnchorYear] = useState(() => new Date().getUTCFullYear());
  const [dashboard, setDashboard] = useState<Dashboard | undefined>(undefined);
  const [previous, setPrevious] = useState<Dashboard | undefined>(undefined);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recent, setRecent] = useState<Transaction[]>([]);
  const [recentTotal, setRecentTotal] = useState(0);
  const [recentPage, setRecentPage] = useState(1);
  /** The period picker stays closed until the reader asks for it. */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const today = new Date();
  const todayLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const greeting = `${greetingOf(today.getHours())}.`;
  const periodWord = PERIOD_WORDS[preset];

  const { from, to } = useMemo(() => monthsRange(months), [months]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // The dashboard is scoped by the period only: every category of those
      // months is part of every figure, the chart and the recent movements.
      const [current, earlier, accountList, tagList] = await Promise.all([
        api.dashboard({ months: monthsQuery(months) }),
        api.dashboard({ months: monthsQuery(shiftMonths(months)) }),
        api.list<Account>("accounts"),
        api.list<Tag>("tags"),
      ]);
      setDashboard(months.length === 0 ? undefined : current);
      setPrevious(earlier);
      setAccounts(accountList.items);
      setTags(tagList.items);
      setError(undefined);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setLoading(false);
    }
  }, [months]);

  // The recent card pages on the server like the ledger does, so a busy vault
  // is browsed here instead of being cut off at the first screenful.
  const loadRecent = useCallback(async () => {
    try {
      const response = await api.searchTransactions({
        limit: RECENT_PAGE_SIZE,
        offset: (recentPage - 1) * RECENT_PAGE_SIZE,
        months: monthsQuery(months),
      });
      // The page can empty under the user: fold back to the last one with rows.
      if (response.items.length === 0 && response.total > 0 && recentPage > 1) {
        setRecentPage(Math.max(1, Math.ceil(response.total / RECENT_PAGE_SIZE)));
        return;
      }
      setRecent(response.items);
      setRecentTotal(response.total);
      setError(undefined);
    } catch (cause) {
      setError(describeError(cause));
    }
  }, [recentPage, months]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const reload = useCallback(async () => {
    await Promise.all([load(), loadRecent()]);
  }, [load, loadRecent]);

  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const recentPageCount = Math.max(1, Math.ceil(recentTotal / RECENT_PAGE_SIZE));
  const recentFirstRow = recentTotal === 0 ? 0 : (recentPage - 1) * RECENT_PAGE_SIZE + 1;
  const recentLastRow = (recentPage - 1) * RECENT_PAGE_SIZE + recent.length;

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
  /** The distinct tags behind the breakdown, for the card's own headline. */
  const categoryCount = useMemo(
    () => new Set((dashboard?.spendingByTag ?? []).map((entry) => entry.tagId)).size,
    [dashboard],
  );
  const colourOf = useCallback(
    (tagId: string, index: number) =>
      tagById.get(tagId)?.color ??
      SPENDING_COLOURS[index % SPENDING_COLOURS.length] ??
      SPENDING_COLOURS[0]!,
    [tagById],
  );

  function applyPreset(next: "month" | "quarter" | "year" | "custom") {
    setPreset(next);
    // A preset is a complete answer, so the picker folds away; "Custom" keeps
    // it open, because that is where the months get clicked.
    if (next !== "custom") setPickerOpen(false);
    if (next === "custom") return;
    const nextMonths = presetMonths(next);
    setMonths(nextMonths);
    const newest = nextMonths[nextMonths.length - 1];
    if (newest) setAnchorYear(Number(newest.slice(0, 4)));
  }

  /** Clicking a month is what "Custom" means, so the preset follows the click. */
  function toggleMonth(month: string) {
    setPreset("custom");
    setMonths((current) =>
      current.includes(month)
        ? current.filter((candidate) => candidate !== month)
        : [...current, month].sort(),
    );
  }

  function selectYear(year: number) {
    setPreset("custom");
    setMonths(MONTH_SHORT.map((_short, index) => `${year}-${String(index + 1).padStart(2, "0")}`));
  }

  function clearMonths() {
    setPreset("custom");
    setMonths([]);
  }

  return (
    <section className="view" aria-labelledby="dashboard-title">
      <div className="dash-head">
        <div className="dash-head-text">
          <p className="eyebrow">{todayLabel}</p>
          <h2 className="display-headline">{greeting}</h2>
          <p className="lead">
            A clear view of what came in, what went out, and what is still yours. Every figure is
            aggregated on this device from the booked movements of the encrypted vault.
          </p>
        </div>
        <div className="dash-head-actions">
          <div className="period-picker">
            <button
              type="button"
              className="period-trigger"
              aria-expanded={pickerOpen}
              aria-controls="dashboard-period"
              onClick={() => setPickerOpen((open) => !open)}
            >
              {PRESET_LABELS[preset]}
              <span aria-hidden="true">▾</span>
            </button>
            <button
              type="button"
              className="btn"
              aria-label="Choose months"
              title="Choose months"
              aria-expanded={pickerOpen}
              aria-controls="dashboard-period"
              onClick={() => setPickerOpen((open) => !open)}
            >
              <Icon name="calendar" size={16} />
            </button>
            {pickerOpen ? (
              <div className="period-popover" id="dashboard-period">
                <DashboardFilters
                  months={months}
                  preset={preset}
                  anchorYear={anchorYear}
                  onPreset={applyPreset}
                  onAnchorYear={setAnchorYear}
                  onToggleMonth={toggleMonth}
                  onSelectYear={selectYear}
                  onClear={clearMonths}
                  onRemoveMonth={toggleMonth}
                />
              </div>
            ) : null}
          </div>
          <button type="button" className="btn primary" onClick={onNewTransaction}>
            <Icon name="plus" size={16} />
            New transaction
          </button>
        </div>
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {loading ? <Banner>Reading the vault…</Banner> : null}
      {months.length === 0 ? <Empty>Select at least one month to see the figures.</Empty> : null}

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
          <div className="kpi-row" key={flow.currency}>
            <article className="kpi lead">
              <div className="kpi-head">
                <span className="kpi-label">Balance across accounts</span>
                <span className="kpi-icon">
                  <Icon name="accounts" size={16} />
                </span>
              </div>
              <span className="kpi-value">
                {formatMinorToAmount(balanceTotal, flow.currency)}
                <span className="kpi-unit">{flow.currency}</span>
              </span>
              <div className="kpi-foot">
                <span className="kpi-hint">
                  {flow.netMinor >= 0 ? "+" : "-"}
                  {formatMinorToAmount(Math.abs(flow.netMinor), flow.currency)} {periodWord}
                </span>
                {savingsRate === null ? null : (
                  <span className="kpi-badge">{formatDecimal(savingsRate)}% saved</span>
                )}
              </div>
            </article>
            <article className="kpi">
              <div className="kpi-head">
                <span className="kpi-label">Spent {periodWord}</span>
                <span className="kpi-icon">
                  <Icon name="download" size={16} />
                </span>
              </div>
              <span className="kpi-value">
                {formatMinorToAmount(flow.expensesMinor, flow.currency)}
                <span className="kpi-unit">{flow.currency}</span>
              </span>
              <span className={`kpi-hint ${expenseDelta.tone}`}>{expenseDelta.text}</span>
            </article>
            <article className="kpi">
              <div className="kpi-head">
                <span className="kpi-label">Income {periodWord}</span>
                <span className="kpi-icon">
                  <Icon name="upload" size={16} />
                </span>
              </div>
              <span className="kpi-value">
                {formatMinorToAmount(flow.incomeMinor, flow.currency)}
                <span className="kpi-unit">{flow.currency}</span>
              </span>
              <span className={`kpi-hint ${incomeDelta.tone}`}>{incomeDelta.text}</span>
            </article>
          </div>
        );
      })}

      <div className="dash-grid">
        <div className="card dash-span-2">
          <header>
            <div>
              <h2 className="card-title">Cash flow</h2>
              <span className="sub">
                Income vs expenses · {from} → {to}
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
            <CashFlowChart
              buckets={primaryBuckets}
              currency={primaryCurrency}
              onSelect={(bucket) => onSeeAllTransactions({ from: bucket.from, to: bucket.to })}
            />
          ) : (
            <Empty>No booked transactions in this period.</Empty>
          )}
        </div>

        <BankingSyncCard csrf={csrf} onOpenSettings={onOpenSettings} onSynced={reload} />

        <div className="card">
          <header>
            <div>
              <h2 className="card-title">Spending by tag</h2>
              <span className="sub">
                {categoryCount === 0
                  ? "No tagged spending in this period"
                  : `Every category of the period is included · ${categoryCount} ${
                      categoryCount === 1 ? "tag" : "tags"
                    }`}
              </span>
            </div>
          </header>
          {dashboard && dashboard.spendingByTag.length > 0 ? (
            spendingGroups.map((group) => (
              <SpendingPie
                key={group.currency}
                currency={group.currency}
                entries={group.entries}
                colourOf={colourOf}
                onOpen={(tagId) => onSeeAllTransactions({ tagId, from, to })}
              />
            ))
          ) : (
            <Empty>No tagged spending in this period.</Empty>
          )}
        </div>

        <div className="card dash-span-2">
          <header>
            <div>
              <h2 className="card-title">Recent transactions</h2>
            </div>
            <div className="cell-actions">
              <Chip tone="neutral">{recentTotal} records</Chip>
              <button
                type="button"
                className="btn small ghost"
                onClick={() => onSeeAllTransactions()}
              >
                All transactions
                <Icon name="arrow" size={14} />
              </button>
            </div>
          </header>
          {recent.length > 0 ? (
            <ul className="tx-list">
              {recent.map((transaction) => {
                const account = accountById.get(transaction.accountId);
                const [year, month, day] = transaction.bookingDate.split("-");
                const tags = transaction.tagIds
                  .map((tagId) => tagById.get(tagId))
                  .filter((tag): tag is Tag => tag !== undefined);
                return (
                  <li className="tx-row" key={transaction.id}>
                    <span className="tx-avatar" aria-hidden="true">
                      <Icon name="transactions" size={16} />
                    </span>
                    <span className="tx-main">
                      <strong>{transaction.payee ?? transaction.description ?? "—"}</strong>
                      {/* Never the provider's raw row id: it is a UUID nobody
                            can read. Show the bank's own description, where the
                            row came from, and the day it was booked. */}
                      <span className="tx-meta">
                        <span>
                          {day} {MONTHS[Number(month) - 1]} {year}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{account?.name ?? "—"}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {transaction.description && transaction.description !== transaction.payee
                            ? transaction.description
                            : transaction.source}
                        </span>
                        {tags.map((tag) => (
                          <span className="tag-pill" key={tag.id} style={tagPillStyle(tag.color)}>
                            {tag.name}
                          </span>
                        ))}
                      </span>
                    </span>
                    <Money minor={transaction.amountMinor} currency={transaction.currency} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>No transactions yet. Record the first one.</Empty>
          )}
          {recentTotal > RECENT_PAGE_SIZE ? (
            <div className="pager">
              <p className="pager-summary" role="status">
                {`Showing ${recentFirstRow}–${recentLastRow} of ${recentTotal} transactions`}
              </p>
              <div className="cell-actions">
                <button
                  type="button"
                  className="btn small"
                  disabled={recentPage <= 1}
                  onClick={() => setRecentPage(Math.max(1, recentPage - 1))}
                >
                  Previous
                </button>
                <span className="chip mono neutral">
                  Page {recentPage} / {recentPageCount}
                </span>
                <button
                  type="button"
                  className="btn small"
                  disabled={recentPage >= recentPageCount}
                  onClick={() => setRecentPage(Math.min(recentPageCount, recentPage + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="card dash-full">
          <header>
            <div>
              <h2 className="card-title">Accounts summary</h2>
              <span className="sub">
                Every account of this vault, with the balance its own currency reports
              </span>
            </div>
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
      </div>

      <div className="backup-banner">
        <p>
          <Icon name="download" size={16} />
          Your vault is stored on this device and ready for an encrypted backup.
        </p>
        <button type="button" className="btn" onClick={onExportData}>
          Export data
        </button>
      </div>
    </section>
  );
}

/**
 * The dashboard's spending breakdown: one donut per currency, an arc per tag of
 * the period, with the total in the hole. Every category is always part of the
 * picture — the period is the only scope the dashboard offers — so the legend
 * is a plain read-out: colour, name, amount and share per tag, with each row
 * opening the ledger on that tag. Hand-rolled, like the cash-flow chart: Flowly
 * ships no charting dependency.
 */
function SpendingPie({
  entries,
  currency,
  colourOf,
  onOpen,
}: {
  entries: Array<{ tagId: string; tagName: string; currency: string; spentMinor: number }>;
  currency: string;
  colourOf: (tagId: string, index: number) => string;
  onOpen: (tagId: string) => void;
}) {
  const [activeTagId, setActiveTagId] = useState<string | undefined>(undefined);
  const total = entries.reduce((sum, entry) => sum + entry.spentMinor, 0);
  const size = 168;
  const centre = size / 2;
  const radius = 66;
  const circumference = 2 * Math.PI * radius;
  // A hair of space between slices keeps neighbours visually separate.
  const gap = entries.length > 1 ? 3 : 0;
  let consumed = 0;
  const slices = entries.map((entry, index) => {
    const share = total > 0 ? entry.spentMinor / total : 0;
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
  const totalText = formatMinorToAmount(total, currency);
  const active = entries.find((entry) => entry.tagId === activeTagId);
  const shareOf = (minor: number) => (total > 0 ? (minor / total) * 100 : 0);
  const label = `Spending by tag in ${currency}: ${entries
    .map((entry) => `${entry.tagName} ${Math.round(shareOf(entry.spentMinor))}%`)
    .join(", ")}`;

  return (
    <div className="donut">
      <div className="donut-figure">
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
          <circle className="donut-track" cx={centre} cy={centre} r={radius} />
          {slices.map((slice, index) => {
            const entry = entries[index];
            if (!entry) return null;
            return (
              <circle
                key={slice.key}
                className={activeTagId === entry.tagId ? "donut-slice is-active" : "donut-slice"}
                cx={centre}
                cy={centre}
                r={radius}
                stroke={slice.colour}
                strokeDasharray={slice.dash}
                strokeDashoffset={slice.offset}
                transform={`rotate(-90 ${centre} ${centre})`}
                style={{ cursor: "pointer" }}
                onPointerEnter={() => setActiveTagId(entry.tagId)}
                onPointerLeave={() =>
                  setActiveTagId((current) => (current === entry.tagId ? undefined : current))
                }
                onClick={() => onOpen(entry.tagId)}
              />
            );
          })}
        </svg>
        <div className="donut-center">
          {active ? (
            <>
              <span className="eyebrow" style={{ margin: 0 }} title={active.tagName}>
                {active.tagName}
              </span>
              <span className="total small">
                {formatMinorToAmount(active.spentMinor, active.currency)}
              </span>
              <span className="sub">
                {active.currency} · {formatDecimal(shareOf(active.spentMinor))}% of spending
              </span>
            </>
          ) : (
            <>
              <span className="eyebrow" style={{ margin: 0 }}>
                {currency}
              </span>
              <span className={totalText.length > 9 ? "total small" : "total"}>{totalText}</span>
              <span className="sub">spent</span>
            </>
          )}
        </div>
      </div>

      <ul className="legend-rows">
        {entries.map((entry, index) => (
          <li
            key={`${entry.tagId}-${entry.currency}`}
            className="legend-row-item"
            onPointerEnter={() => setActiveTagId(entry.tagId)}
            onPointerLeave={() =>
              setActiveTagId((current) => (current === entry.tagId ? undefined : current))
            }
          >
            <button
              type="button"
              className="legend-row"
              aria-label={`Show ${entry.tagName} in the ledger`}
              title={`Show ${entry.tagName} in the ledger`}
              onFocus={() => setActiveTagId(entry.tagId)}
              onBlur={() =>
                setActiveTagId((current) => (current === entry.tagId ? undefined : current))
              }
              onClick={() => onOpen(entry.tagId)}
            >
              <span className="legend-item">
                <span className="dot" style={{ background: colourOf(entry.tagId, index) }} />
                {entry.tagName}
              </span>
              <span className="mono">{formatMinorToAmount(entry.spentMinor, entry.currency)}</span>
              <span className="muted mono">{formatDecimal(shareOf(entry.spentMinor))}%</span>
              <span className="legend-mark" aria-hidden="true">
                <Icon name="transactions" size={14} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CashFlowChart({
  buckets,
  currency,
  onSelect,
}: {
  buckets: Array<{
    label: string;
    from: string;
    to: string;
    incomeMinor: number;
    expensesMinor: number;
  }>;
  currency: string;
  onSelect?: (bucket: { from: string; to: string }) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
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
  const centreOf = (index: number) => padding.left + slot * index + slot / 2;
  const active = activeIndex === undefined ? undefined : buckets[activeIndex];

  return (
    <figure className={activeIndex === undefined ? "chart" : "chart has-active"}>
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
        {activeIndex !== undefined ? (
          <line
            className="bucket-guide"
            x1={centreOf(activeIndex)}
            x2={centreOf(activeIndex)}
            y1={padding.top}
            y2={padding.top + chartHeight}
          />
        ) : null}
        {buckets.map((bucket, index) => {
          const centre = padding.left + slot * index + slot / 2;
          return (
            <g
              key={`${bucket.from}-${index}`}
              className={activeIndex === index ? "bucket is-active" : "bucket"}
            >
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
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r={activeIndex === index ? 5 : 3.5}
              className={activeIndex === index ? "net-dot is-active" : "net-dot"}
            />
          );
        })}
      </svg>

      {/* The hover and focus targets are HTML rather than SVG: they can be
          named and reached with the keyboard, and the chart keeps its single
          `role="img"` summary for assistive technology. */}
      <div
        className="chart-hits"
        role="group"
        aria-label={`Weekly income and expenses in ${currency}, one stop per week`}
        style={{
          paddingTop: `${(padding.top / width) * 100}%`,
          paddingBottom: `${(padding.bottom / width) * 100}%`,
          paddingLeft: `${(padding.left / width) * 100}%`,
          paddingRight: `${(padding.right / width) * 100}%`,
        }}
      >
        {buckets.map((bucket, index) => {
          const net = bucket.incomeMinor - bucket.expensesMinor;
          return (
            <button
              key={`${bucket.from}-${index}`}
              type="button"
              className={activeIndex === index ? "chart-hit is-active" : "chart-hit"}
              // One tab stop: the arrows walk the weeks, as a chart should.
              tabIndex={
                activeIndex === index || (activeIndex === undefined && index === 0) ? 0 : -1
              }
              aria-label={`${bucket.label} (${bucket.from} to ${bucket.to}): income ${formatMoney(
                bucket.incomeMinor,
                currency,
              )}, expenses ${formatMoney(
                bucket.expensesMinor,
                currency,
              )}, net ${formatMoney(net, currency)}`}
              onPointerEnter={() => setActiveIndex(index)}
              onPointerLeave={() =>
                setActiveIndex((current) => (current === index ? undefined : current))
              }
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex((current) => (current === index ? undefined : current))}
              onClick={() => onSelect?.({ from: bucket.from, to: bucket.to })}
              onKeyDown={(event) => {
                const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                if (step === 0) return;
                event.preventDefault();
                const next = Math.min(buckets.length - 1, Math.max(0, index + step));
                setActiveIndex(next);
                const hits = event.currentTarget.parentElement?.querySelectorAll("button");
                hits?.[next]?.focus();
              }}
            />
          );
        })}
      </div>

      {active ? (
        <ChartTooltip
          xPercent={(centreOf(activeIndex ?? 0) / width) * 100}
          title={`${active.label} · ${active.from} → ${active.to}`}
          rows={[
            {
              label: "Income",
              value: formatMoney(active.incomeMinor, currency),
              tone: "income",
            },
            {
              label: "Expenses",
              value: formatMoney(active.expensesMinor, currency),
              tone: "expense",
            },
            {
              label: "Net",
              value: formatMoney(active.incomeMinor - active.expensesMinor, currency),
              tone: "line",
            },
          ]}
          hint="Click to open these rows"
        />
      ) : null}
    </figure>
  );
}

/** The bubble that follows the point under the pointer or the keyboard. */
function ChartTooltip({
  xPercent,
  title,
  rows,
  hint,
}: {
  xPercent: number;
  title: string;
  rows: Array<{ label: string; value: string; tone?: string }>;
  hint?: string;
}) {
  // Kept inside the chart: the first and last bucket would otherwise hang out.
  const left = Math.min(88, Math.max(12, xPercent));
  return (
    <div className="chart-tooltip" style={{ left: `${left}%` }} role="presentation">
      <strong>{title}</strong>
      <dl>
        {rows.map((row) => (
          <div key={row.label}>
            <dt>
              <span className={`dot ${row.tone ?? ""}`} />
              {row.label}
            </dt>
            <dd className="mono">{row.value}</dd>
          </div>
        ))}
      </dl>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
