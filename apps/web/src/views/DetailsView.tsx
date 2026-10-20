import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExpenseDetails, Tag } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { DashboardFilters } from "../components/DashboardFilters.js";
import { BreakdownRows, Heatmap } from "../components/DetailsBreakdownCharts.js";
import { WeeklyBars, CumulativeChart } from "../components/DetailsTrendCharts.js";
import { dayLabel, heatColour, share } from "../components/details-chart-utils.js";
import { Icon } from "../components/icons.js";
import { SpendingDonut } from "../components/SpendingDonut.js";
import { Banner, Empty, SectionIntro } from "../components/ui.js";
import { useMonthScope } from "../hooks/use-month-scope.js";
import { describeError } from "../hooks/use-workspace.js";
import type { LedgerFilterSeed } from "../lib/ledger-filter.js";
import { formatDecimal, formatMinorToAmount } from "../lib/money.js";
import { monthsQuery } from "../lib/months.js";

// Slice colours for tags that carry none of their own.
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

// How a movement reached the vault, said the way a person would.
const SOURCE_LABELS: Record<string, string> = {
  "enable-banking": "Bank sync",
  "csv-import": "File import",
  manual: "Entered by hand",
};

export interface DetailsViewProps {
  // Opens the ledger; a figure passes the filter it stands for.
  onSeeAllTransactions: (seed?: LedgerFilterSeed) => void;
  onExportData: () => void;
}

// The expense detail page. Where the dashboard answers "where did the money
// go", this page reads the same period many ways — by category, by day, by
// week, by account, by source and by amount — in one currency at a time, so the
// figures stay comparable and nothing is silently converted.
export function DetailsView({ onSeeAllTransactions, onExportData }: DetailsViewProps) {
  const {
    months,
    preset,
    anchorYear,
    from,
    to,
    setAnchorYear,
    applyPreset,
    toggleMonth,
    selectYear,
    clearMonths,
  } = useMonthScope();
  const [details, setDetails] = useState<ExpenseDetails | undefined>(undefined);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [next, tagList] = await Promise.all([
        api.expenseDetails({ months: monthsQuery(months) }),
        api.list<Tag>("tags"),
      ]);
      setDetails(months.length === 0 ? undefined : next);
      setTags(tagList.items);
      setError(undefined);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setLoading(false);
    }
  }, [months]);

  useEffect(() => {
    void load();
  }, [load]);

  const tagColour = useMemo(() => new Map(tags.map((tag) => [tag.id, tag.color])), [tags]);
  const colourOf = useCallback(
    (tagId: string, index: number) =>
      tagColour.get(tagId) ??
      SPENDING_COLOURS[index % SPENDING_COLOURS.length] ??
      SPENDING_COLOURS[0]!,
    [tagColour],
  );

  const byCategory = details?.byCategory ?? [];
  const categoryTotal = byCategory.reduce((total, entry) => total + entry.spentMinor, 0);
  const weeklyTotal = (details?.weekly ?? []).reduce((total, week) => total + week.spentMinor, 0);
  const weeklyAverageMinor =
    details && details.weekly.length > 0 ? Math.round(weeklyTotal / details.weekly.length) : 0;
  const maxDayMinor = Math.max(0, ...(details?.daily ?? []).map((day) => day.spentMinor));
  const noSpendDays = (details?.daily ?? []).filter(
    (day) => day.selected && day.spentMinor === 0,
  ).length;

  // The pace so far is what a forecast can honestly stand on: the days that
  // have already happened, at the rate the period has spent so far.
  const todayIso = new Date().toISOString().slice(0, 10);
  const elapsedDays = (details?.daily ?? []).filter(
    (day) => day.selected && day.date <= todayIso,
  ).length;
  const projecting =
    details !== undefined &&
    details.currency !== null &&
    details.range.to >= todayIso &&
    elapsedDays > 0 &&
    elapsedDays < details.totals.calendarDays;
  const projectedMinor =
    projecting && details
      ? Math.round((details.totals.spentMinor * details.totals.calendarDays) / elapsedDays)
      : 0;

  const top = byCategory[0];
  const currency = details?.currency ?? undefined;

  return (
    <section
      className={loading ? "view is-refreshing" : "view"}
      aria-busy={loading || undefined}
      aria-labelledby="details-title"
    >
      <SectionIntro
        icon="details"
        eyebrow="Expense detail"
        actions={
          <>
            <button type="button" className="btn ghost" onClick={onExportData}>
              <Icon name="download" size={16} />
              Export data
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => onSeeAllTransactions({ from, to })}
            >
              <Icon name="transactions" size={16} />
              Open ledger
            </button>
          </>
        }
      />

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
        label="Details period"
      />

      {error ? <Banner tone="error">{error}</Banner> : null}
      {months.length === 0 ? <Empty>Select at least one month to see the detail.</Empty> : null}
      {details && details.currency === null ? (
        <Empty>No booked spending in this period.</Empty>
      ) : null}

      {details && details.currency !== null && currency ? (
        <>
          <div className="kpi-row four">
            <article className="kpi lead">
              <div className="kpi-head">
                <span className="kpi-label">Spent in this period</span>
                <span className="kpi-icon">
                  <Icon name="download" size={16} />
                </span>
              </div>
              <span className="kpi-value">
                {formatMinorToAmount(details.totals.spentMinor, currency)}
                <span className="kpi-unit">{currency}</span>
              </span>
              <div className="kpi-foot">
                <span className="kpi-hint">{details.totals.transactionCount} booked movements</span>
                <span className="kpi-badge">
                  {details.totals.activeDays} active of {details.totals.calendarDays} days
                </span>
              </div>
            </article>

            <article className="kpi">
              <div className="kpi-head">
                <span className="kpi-label">Average per day</span>
                <span className="kpi-icon">
                  <Icon name="clock" size={16} />
                </span>
              </div>
              <span className="kpi-value">
                {formatMinorToAmount(details.totals.averageDailyMinor, currency)}
                <span className="kpi-unit">{currency}</span>
              </span>
              <span className="kpi-hint">
                {formatMinorToAmount(details.totals.averageActiveDayMinor, currency)} on an active
                day
              </span>
            </article>

            <article className="kpi">
              <div className="kpi-head">
                <span className="kpi-label">Top category</span>
                <span className="kpi-icon">
                  <Icon name="tags" size={16} />
                </span>
              </div>
              <span className="kpi-value">
                {formatMinorToAmount(top ? top.spentMinor : details.untagged.spentMinor, currency)}
                <span className="kpi-unit">{currency}</span>
              </span>
              <span className="kpi-hint">
                {top
                  ? `${top.tagName} · ${formatDecimal(share(top.spentMinor, categoryTotal))}%`
                  : details.untagged.spentMinor > 0
                    ? "Untagged spending"
                    : "No tagged spending"}
              </span>
            </article>

            <article className="kpi">
              <div className="kpi-head">
                <span className="kpi-label">Largest expense</span>
                <span className="kpi-icon">
                  <Icon name="alert" size={16} />
                </span>
              </div>
              <span className="kpi-value">
                {formatMinorToAmount(details.totals.largestMinor, currency)}
                <span className="kpi-unit">{currency}</span>
              </span>
              <span className="kpi-hint">
                {details.totals.largestPayee ?? "—"}
                {details.totals.largestDate ? ` · ${dayLabel(details.totals.largestDate)}` : ""}
              </span>
            </article>
          </div>

          {details.otherCurrencies.length > 0 ? (
            <p className="sub details-note">
              <Icon name="alert" size={14} />
              {details.otherCurrencies.join(", ")} also carry spending in this period and are not
              part of the figures: Flowly never blends currencies.
            </p>
          ) : null}

          <div className="dash-grid">
            <div className="card">
              <header>
                <div>
                  <h2 className="card-title">Distribution by category</h2>
                  <span className="sub">
                    {byCategory.length === 0
                      ? "No tagged spending in this period"
                      : `${byCategory.length} ${
                          byCategory.length === 1 ? "tag" : "tags"
                        } · share of tagged spending`}
                  </span>
                </div>
              </header>
              {byCategory.length > 0 ? (
                <SpendingDonut
                  variant="category"
                  entries={byCategory}
                  currency={currency}
                  total={categoryTotal}
                  colourOf={colourOf}
                  onOpen={(tagId) => onSeeAllTransactions({ tagId, from, to })}
                />
              ) : (
                <Empty>No tagged spending in this period.</Empty>
              )}
              {details.untagged.spentMinor > 0 ? (
                <p className="sub details-note">
                  <Icon name="alert" size={14} />
                  {formatMinorToAmount(details.untagged.spentMinor, currency)} {currency} across{" "}
                  {details.untagged.transactionCount}{" "}
                  {details.untagged.transactionCount === 1 ? "movement" : "movements"} carries no
                  tag.
                </p>
              ) : null}
            </div>

            <div className="card dash-span-2">
              <header>
                <div>
                  <h2 className="card-title">Spending per week</h2>
                  <span className="sub">
                    Seven-day slices of {from} → {to}, with the period average as the reference line
                  </span>
                </div>
              </header>
              {details.weekly.length > 0 ? (
                <WeeklyBars
                  weeks={details.weekly}
                  currency={currency}
                  averageMinor={weeklyAverageMinor}
                  onOpen={onSeeAllTransactions}
                />
              ) : (
                <Empty>No booked spending in this period.</Empty>
              )}
            </div>

            <div className="card dash-span-2">
              <header>
                <div>
                  <h2 className="card-title">Cumulative trajectory</h2>
                  <span className="sub">
                    {projecting
                      ? `Projected ${formatMinorToAmount(
                          projectedMinor,
                          currency,
                        )} ${currency} at the pace so far`
                      : "How the period's spending piled up, day by day"}
                  </span>
                </div>
              </header>
              <CumulativeChart
                daily={details.daily}
                currency={currency}
                projectedMinor={projecting ? projectedMinor : undefined}
                onOpen={onSeeAllTransactions}
              />
            </div>

            <div className="card">
              <header>
                <div>
                  <h2 className="card-title">By account</h2>
                  <span className="sub">Where the money left from</span>
                </div>
              </header>
              <BreakdownRows
                items={details.byAccount.map((line) => ({
                  key: line.accountId,
                  label: line.accountName,
                  value: line.spentMinor,
                  note: `${line.transactionCount} ${
                    line.transactionCount === 1 ? "movement" : "movements"
                  }`,
                }))}
                total={details.totals.spentMinor}
                currency={currency}
                empty="No booked spending in this period."
              />
            </div>

            <div className="card dash-full">
              <header>
                <div>
                  <h2 className="card-title">Daily intensity</h2>
                  <span className="sub">
                    Spending per day · {noSpendDays} no-spend {noSpendDays === 1 ? "day" : "days"}
                  </span>
                </div>
                <div className="heat-legend" aria-hidden="true">
                  <span className="sub">less</span>
                  {[0.15, 0.4, 0.7, 1].map((level) => (
                    <span
                      key={level}
                      className="heat-swatch"
                      style={{ background: heatColour(level) }}
                    />
                  ))}
                  <span className="sub">more</span>
                </div>
              </header>
              <Heatmap
                daily={details.daily}
                currency={currency}
                maxMinor={maxDayMinor}
                onOpen={onSeeAllTransactions}
              />
            </div>

            <div className="card dash-span-2">
              <header>
                <div>
                  <h2 className="card-title">Amount distribution</h2>
                  <span className="sub">
                    How many movements at each size, and what they are worth together
                  </span>
                </div>
              </header>
              <BreakdownRows
                items={details.amountBands.map((band) => ({
                  key: band.key,
                  label: band.label,
                  value: band.spentMinor,
                  note: `${band.count} ${band.count === 1 ? "movement" : "movements"}`,
                }))}
                total={details.totals.spentMinor}
                currency={currency}
                empty="No booked spending in this period."
                colour="#5b8cc4"
              />
            </div>

            <div className="card">
              <header>
                <div>
                  <h2 className="card-title">By source</h2>
                  <span className="sub">How each movement reached the vault</span>
                </div>
              </header>
              <BreakdownRows
                items={details.bySource.map((line) => ({
                  key: line.source,
                  label: SOURCE_LABELS[line.source] ?? line.source,
                  value: line.spentMinor,
                  note: `${line.transactionCount} ${
                    line.transactionCount === 1 ? "movement" : "movements"
                  }`,
                }))}
                total={details.totals.spentMinor}
                currency={currency}
                empty="No booked spending in this period."
                colour="#8d81c9"
              />
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
