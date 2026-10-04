import { useCallback, useEffect, useMemo, useState } from "react";
import type { ExpenseDetails, Tag } from "@flowly/web-contracts";
import { api } from "../api/client.js";
import { DashboardFilters } from "../components/DashboardFilters.js";
import { Icon } from "../components/icons.js";
import { Banner, Empty, SectionIntro } from "../components/ui.js";
import { describeError } from "../hooks/use-workspace.js";
import type { LedgerFilterSeed } from "../lib/ledger-filter.js";
import { formatDecimal, formatMinorToAmount } from "../lib/money.js";
import {
  MONTH_SHORT,
  monthsQuery,
  monthsRange,
  presetMonths,
  type MonthPreset,
} from "../lib/months.js";

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

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const [months, setMonths] = useState<string[]>(() => presetMonths("month"));
  const [preset, setPreset] = useState<MonthPreset>("month");
  const [anchorYear, setAnchorYear] = useState(() => new Date().getUTCFullYear());
  const [details, setDetails] = useState<ExpenseDetails | undefined>(undefined);
  const [tags, setTags] = useState<Tag[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const { from, to } = useMemo(() => monthsRange(months), [months]);

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

  function applyPreset(next: "month" | "quarter" | "year" | "custom") {
    setPreset(next);
    if (next === "custom") return;
    const nextMonths = presetMonths(next);
    setMonths(nextMonths);
    const newest = nextMonths[nextMonths.length - 1];
    if (newest) setAnchorYear(Number(newest.slice(0, 4)));
  }

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
                <CategoryDonut
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
              <Heatmap daily={details.daily} currency={currency} maxMinor={maxDayMinor} />
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

// Share of a total, as a percentage; zero when there is no total.
function share(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

// `2026-09-12` → `12 Sep 2026`; the day a figure happened, short.
function dayLabel(date: string): string {
  const [year, month, day] = date.split("-");
  return `${Number(day)} ${MONTH_SHORT[Number(month) - 1] ?? month} ${year}`;
}

// A translucent brand green, darker as the day's spending grows.
function heatColour(level: number): string {
  return `rgba(30, 111, 78, ${0.12 + 0.88 * level})`;
}

function CategoryDonut({
  entries,
  currency,
  total,
  colourOf,
  onOpen,
}: {
  entries: ExpenseDetails["byCategory"];
  currency: string;
  total: number;
  colourOf: (tagId: string, index: number) => string;
  onOpen: (tagId: string) => void;
}) {
  const [activeTagId, setActiveTagId] = useState<string | undefined>(undefined);
  const size = 168;
  const centre = size / 2;
  const radius = 66;
  const circumference = 2 * Math.PI * radius;
  const gap = entries.length > 1 ? 3 : 0;
  let consumed = 0;
  const slices = entries.map((entry, index) => {
    const fraction = total > 0 ? entry.spentMinor / total : 0;
    const length = Math.max(0, fraction * circumference - gap);
    const slice = {
      key: entry.tagId,
      colour: colourOf(entry.tagId, index),
      dash: `${length} ${circumference - length}`,
      offset: -consumed,
    };
    consumed += fraction * circumference;
    return slice;
  });
  const active = entries.find((entry) => entry.tagId === activeTagId);
  const label = `Spending by category in ${currency}: ${entries
    .map((entry) => `${entry.tagName} ${Math.round(share(entry.spentMinor, total))}%`)
    .join(", ")}`;

  return (
    <div className="donut">
      <div className="donut-figure">
        <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
          <circle className="donut-track" cx={centre} cy={centre} r={radius} />
          {slices.map((slice, index) => {
            const entry = entries[index]!;
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
                {formatMinorToAmount(active.spentMinor, currency)}
              </span>
              <span className="sub">
                {formatDecimal(share(active.spentMinor, total))}% · {active.transactionCount}{" "}
                {active.transactionCount === 1 ? "movement" : "movements"}
              </span>
            </>
          ) : (
            <>
              <span className="eyebrow" style={{ margin: 0 }}>
                Tagged {currency}
              </span>
              <span className={total > 0 ? "total" : "total small"}>
                {formatMinorToAmount(total, currency)}
              </span>
              <span className="sub">
                {entries.length} {entries.length === 1 ? "category" : "categories"}
              </span>
            </>
          )}
        </div>
      </div>

      <ul className="legend-rows">
        {entries.map((entry, index) => (
          <li
            key={entry.tagId}
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
              <span className="mono">{formatMinorToAmount(entry.spentMinor, currency)}</span>
              <span className="muted mono">{formatDecimal(share(entry.spentMinor, total))}%</span>
              <span className="legend-mark" aria-hidden="true">
                <Icon name="transactions" size={14} />
              </span>
            </button>
            <span className="sub legend-sub">
              {entry.transactionCount} {entry.transactionCount === 1 ? "movement" : "movements"} ·
              average {formatMinorToAmount(entry.averageMinor, currency)} · largest{" "}
              {formatMinorToAmount(entry.largestMinor, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WeeklyBars({
  weeks,
  currency,
  averageMinor,
}: {
  weeks: ExpenseDetails["weekly"];
  currency: string;
  averageMinor: number;
}) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
  const width = 640;
  const height = 220;
  const padding = { top: 20, right: 12, bottom: 38, left: 12 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, averageMinor, ...weeks.map((week) => week.spentMinor));
  const slot = chartWidth / Math.max(1, weeks.length);
  const barWidth = Math.max(8, Math.min(38, slot * 0.5));
  const scale = (value: number) => chartHeight - (value / max) * (chartHeight - 8);
  const averageY = padding.top + scale(averageMinor);
  const active = activeIndex === undefined ? undefined : weeks[activeIndex];

  return (
    <figure className="chart bars-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Spending per week in ${currency}, ${weeks.length} weeks, average ${formatMinorToAmount(
          averageMinor,
          currency,
        )}`}
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
        {weeks.map((week, index) => {
          const centre = padding.left + slot * index + slot / 2;
          const top = padding.top + scale(week.spentMinor);
          return (
            <g
              key={`${week.from}-${index}`}
              className={activeIndex === index ? "bucket is-active" : "bucket"}
            >
              <rect
                x={centre - barWidth / 2}
                y={top}
                width={barWidth}
                height={Math.max(0, chartHeight - scale(week.spentMinor))}
                rx={4}
                className="bar expense"
              >
                <title>{`${week.label} (${week.from} → ${week.to}): ${formatMinorToAmount(
                  week.spentMinor,
                  currency,
                )} ${currency}`}</title>
              </rect>
              <text x={centre} y={height - 20} textAnchor="middle" className="axis-label">
                {shortDate(week.from)}
              </text>
              <text x={centre} y={height - 6} textAnchor="middle" className="axis-sub">
                {formatCompact(week.spentMinor, currency)}
              </text>
            </g>
          );
        })}
        <line
          className="average-line"
          x1={padding.left}
          x2={width - padding.right}
          y1={averageY}
          y2={averageY}
        />
        <text x={padding.left + 2} y={averageY - 5} className="axis-sub">
          average {formatMinorToAmount(averageMinor, currency)}
        </text>
      </svg>
      <div
        className="chart-hits bars-hits"
        role="group"
        aria-label={`Weekly spending in ${currency}`}
        style={{
          paddingTop: `${(padding.top / width) * 100}%`,
          paddingBottom: `${(padding.bottom / width) * 100}%`,
        }}
      >
        {weeks.map((week, index) => (
          <button
            key={`${week.from}-hit-${index}`}
            type="button"
            className={activeIndex === index ? "chart-hit is-active" : "chart-hit"}
            tabIndex={activeIndex === index || (activeIndex === undefined && index === 0) ? 0 : -1}
            aria-label={`${week.label} (${week.from} to ${week.to}): ${formatMinorToAmount(
              week.spentMinor,
              currency,
            )} ${currency}`}
            onPointerEnter={() => setActiveIndex(index)}
            onPointerLeave={() =>
              setActiveIndex((current) => (current === index ? undefined : current))
            }
            onFocus={() => setActiveIndex(index)}
            onBlur={() => setActiveIndex((current) => (current === index ? undefined : current))}
          />
        ))}
      </div>
      {active ? (
        <ChartTooltip
          xPercent={((padding.left + slot * (activeIndex ?? 0) + slot / 2) / width) * 100}
          title={`${active.label} · ${active.from} → ${active.to}`}
          rows={[
            {
              label: "Spent",
              value: `${formatMinorToAmount(active.spentMinor, currency)} ${currency}`,
              tone: "expense",
            },
            { label: "Movements", value: String(active.transactionCount) },
          ]}
        />
      ) : null}
    </figure>
  );
}

function CumulativeChart({
  daily,
  currency,
  projectedMinor,
}: {
  daily: ExpenseDetails["daily"];
  currency: string;
  projectedMinor?: number | undefined;
}) {
  if (daily.length === 0) return <Empty>No booked spending in this period.</Empty>;
  const width = 640;
  const height = 220;
  const padding = { top: 18, right: 14, bottom: 34, left: 14 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  let running = 0;
  const points = daily.map((day, index) => {
    running += day.spentMinor;
    return { index, date: day.date, value: running };
  });
  const total = running;
  const max = Math.max(1, total, projectedMinor ?? 0);
  const x = (index: number) =>
    padding.left + (daily.length === 1 ? chartWidth : (chartWidth * index) / (daily.length - 1));
  const y = (value: number) => padding.top + chartHeight - (value / max) * (chartHeight - 8);
  const actual = points.map((point) => `${x(point.index)},${y(point.value)}`).join(" ");
  const last = points[points.length - 1]!;
  const labelStep = Math.max(1, Math.ceil(daily.length / 6));

  return (
    <figure className="chart cumulative-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Cumulative spending in ${currency}, ${formatMinorToAmount(
          total,
          currency,
        )} from ${daily[0]?.date} to ${last.date}${
          projectedMinor === undefined
            ? ""
            : `, projected ${formatMinorToAmount(projectedMinor, currency)}`
        }`}
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
        <polyline points={actual} className="net-line expense" />
        {projectedMinor !== undefined && projectedMinor !== total ? (
          <>
            <line
              className="forecast-line"
              x1={x(last.index)}
              y1={y(total)}
              x2={x(last.index)}
              y2={y(projectedMinor)}
            />
            <circle cx={x(last.index)} cy={y(projectedMinor)} r={4} className="forecast-dot" />
          </>
        ) : null}
        {points
          .filter((point) => point.index % labelStep === 0 || point.index === points.length - 1)
          .map((point) => (
            <text
              key={point.date}
              x={x(point.index)}
              y={height - 12}
              textAnchor="middle"
              className="axis-label"
            >
              {shortDate(point.date)}
            </text>
          ))}
      </svg>
      <div className="legend">
        <span className="legend-item">
          <span className="dot expense" /> Actual
        </span>
        {projectedMinor !== undefined ? (
          <span className="legend-item">
            <span className="dot" style={{ background: "var(--accent-blue)" }} /> Projection
          </span>
        ) : null}
      </div>
    </figure>
  );
}

// Bars that read a breakdown, one row per line, with its share of the total.
function BreakdownRows({
  items,
  total,
  currency,
  empty,
  colour = "var(--expense-graphic)",
}: {
  items: Array<{ key: string; label: string; value: number; note: string }>;
  total: number;
  currency: string;
  empty: string;
  colour?: string;
}) {
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="breakdown-rows">
      {items.map((item) => (
        <li key={item.key}>
          <div className="breakdown-head">
            <strong>{item.label}</strong>
            <span className="mono">
              {formatMinorToAmount(item.value, currency)} {currency}
            </span>
            <span className="muted mono">{formatDecimal(share(item.value, total))}%</span>
          </div>
          <div className="breakdown-track">
            <span
              style={{
                width: `${Math.min(100, share(item.value, total))}%`,
                background: colour,
              }}
            />
          </div>
          <span className="sub">{item.note}</span>
        </li>
      ))}
    </ul>
  );
}

// The daily heatmap: the range laid out as Mon–Sun columns of weeks, each cell
// shaded by what that day spent. A day whose month the reader left out is drawn
// as an excluded cell instead of a zero, so "no spending" and "not counted"
// never look the same. The picture carries one readable summary and the cells
// are decorative, so the figures never depend on colour.
function Heatmap({
  daily,
  currency,
  maxMinor,
}: {
  daily: ExpenseDetails["daily"];
  currency: string;
  maxMinor: number;
}) {
  if (daily.length === 0) return <Empty>No days in this period.</Empty>;
  const first = daily[0]!;
  const leading = (new Date(`${first.date}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const cells: Array<ExpenseDetails["daily"][number] | null> = [
    ...Array.from({ length: leading }, () => null),
    ...daily,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<(typeof cells)[number]>> = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  const busiest = daily.reduce<(typeof daily)[number] | undefined>(
    (current, day) =>
      current === undefined || day.spentMinor > current.spentMinor ? day : current,
    undefined,
  );
  const summary =
    `Daily spending from ${first.date} to ${daily[daily.length - 1]!.date}` +
    (busiest && busiest.spentMinor > 0
      ? `, busiest day ${busiest.date} with ${formatMinorToAmount(
          busiest.spentMinor,
          currency,
        )} ${currency}`
      : ", no spending at all");

  return (
    <div className="heatmap" role="img" aria-label={summary}>
      <div className="heat-weekdays" aria-hidden="true">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      <div className="heat-weeks" aria-hidden="true">
        {weeks.map((week, index) => (
          <div className="heat-week" key={`week-${index}`}>
            {week.map((day, dayIndex) => {
              if (!day) return <span className="heat-cell is-blank" key={`blank-${dayIndex}`} />;
              const level = maxMinor > 0 ? day.spentMinor / maxMinor : 0;
              const style =
                !day.selected || day.spentMinor === 0
                  ? undefined
                  : { background: heatColour(Math.max(0.12, level)) };
              const className = !day.selected
                ? "heat-cell is-excluded"
                : day.spentMinor === 0
                  ? "heat-cell is-empty"
                  : "heat-cell";
              return (
                <span
                  key={day.date}
                  className={className}
                  style={style}
                  title={`${day.date}: ${
                    day.selected
                      ? `${formatMinorToAmount(day.spentMinor, currency)} ${currency}`
                      : "not in the selected months"
                  }`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// `2026-09-05` → `5/9`, the compact axis label.
function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(day)}/${Number(month)}`;
}

// A short, rounded amount for an axis label: `1,2k`, `850`.
function formatCompact(minor: number, currency: string): string {
  const amount = Number(formatMinorToAmount(minor, currency).replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(amount)) return "";
  if (Math.abs(amount) >= 1000) return `${formatDecimal(amount / 1000)}k`;
  return String(Math.round(amount));
}

// The bubble that follows the point under the pointer or the keyboard.
function ChartTooltip({
  xPercent,
  title,
  rows,
}: {
  xPercent: number;
  title: string;
  rows: Array<{ label: string; value: string; tone?: string }>;
}) {
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
    </div>
  );
}
