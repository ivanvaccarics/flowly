import { useState } from "react";
import type { ExpenseDetails } from "@flowly/web-contracts";
import type { LedgerFilterSeed } from "../lib/ledger-filter.js";
import { formatDecimal, formatMinorToAmount } from "../lib/money.js";
import { ChartTooltip } from "./DetailChartTooltip.js";
import { dayLabel, formatCompact, share, shortDate } from "./details-chart-utils.js";
import { Empty } from "./ui.js";

export function WeeklyBars({
  weeks,
  currency,
  averageMinor,
  onOpen,
}: {
  weeks: ExpenseDetails["weekly"];
  currency: string;
  averageMinor: number;
  onOpen?: (seed: LedgerFilterSeed) => void;
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
  const total = weeks.reduce((sum, week) => sum + week.spentMinor, 0);
  const centreOf = (index: number) => padding.left + slot * index + slot / 2;
  const active = activeIndex === undefined ? undefined : weeks[activeIndex];

  function walk(from: number, step: number, container: HTMLElement): void {
    const next = Math.min(weeks.length - 1, Math.max(0, from + step));
    setActiveIndex(next);
    container.parentElement?.querySelectorAll("button")[next]?.focus();
  }

  return (
    <figure
      className={activeIndex === undefined ? "chart bars-chart" : "chart bars-chart has-active"}
    >
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
        {activeIndex === undefined ? null : (
          <line
            className="bucket-guide"
            x1={centreOf(activeIndex)}
            x2={centreOf(activeIndex)}
            y1={padding.top}
            y2={padding.top + chartHeight}
          />
        )}
        {weeks.map((week, index) => {
          const centre = centreOf(index);
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
              />
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
        aria-label={`Weekly spending in ${currency}, one stop per week`}
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
            onClick={() => onOpen?.({ from: week.from, to: week.to })}
            onKeyDown={(event) => {
              const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (step === 0) return;
              event.preventDefault();
              walk(index, step, event.currentTarget);
            }}
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
            {
              label: "Share of period",
              value: `${formatDecimal(share(active.spentMinor, total))}%`,
            },
          ]}
          hint={onOpen ? "Click to open these rows" : undefined}
        />
      ) : null}
    </figure>
  );
}

export function CumulativeChart({
  daily,
  currency,
  projectedMinor,
  onOpen,
}: {
  daily: ExpenseDetails["daily"];
  currency: string;
  projectedMinor?: number | undefined;
  onOpen?: (seed: LedgerFilterSeed) => void;
}) {
  const [activeIndex, setActiveIndex] = useState<number | undefined>(undefined);
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
  const slot = chartWidth / Math.max(1, daily.length);
  const x = (index: number) => padding.left + slot * index + slot / 2;
  const xPercent = (index: number) => (x(index) / width) * 100;
  const slotPercent = (slot / width) * 100;
  const y = (value: number) => padding.top + chartHeight - (value / max) * (chartHeight - 8);
  const actual = points.map((point) => `${x(point.index)},${y(point.value)}`).join(" ");
  const last = points[points.length - 1]!;
  const labelStep = Math.max(1, Math.ceil(daily.length / 6));
  const active = activeIndex === undefined ? undefined : points[activeIndex];
  const activeDay = activeIndex === undefined ? undefined : daily[activeIndex];

  if (daily.length === 0) return <Empty>No booked spending in this period.</Empty>;

  function walk(from: number, step: number, container: HTMLElement): void {
    const next = Math.min(daily.length - 1, Math.max(0, from + step));
    setActiveIndex(next);
    container.parentElement?.querySelectorAll("button")[next]?.focus();
  }

  return (
    <figure className="chart cumulative-chart">
      <div className="chart-plot">
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
          {active ? (
            <>
              <line
                className="bucket-guide"
                x1={x(active.index)}
                x2={x(active.index)}
                y1={padding.top}
                y2={padding.top + chartHeight}
              />
              <circle
                cx={x(active.index)}
                cy={y(active.value)}
                r={4.5}
                className="net-dot is-active"
              />
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
        <div
          className="chart-hits line-hits"
          role="group"
          aria-label={`Daily spending in ${currency}, one stop per day`}
        >
          {daily.map((day, index) => {
            const cumulative = points[index]?.value ?? 0;
            return (
              <button
                key={day.date}
                type="button"
                className={
                  activeIndex === index ? "chart-hit line-hit is-active" : "chart-hit line-hit"
                }
                style={{ left: `${xPercent(index) - slotPercent / 2}%`, width: `${slotPercent}%` }}
                tabIndex={
                  activeIndex === index || (activeIndex === undefined && index === 0) ? 0 : -1
                }
                aria-label={`${dayLabel(day.date)}: ${formatMinorToAmount(
                  day.spentMinor,
                  currency,
                )} ${currency} spent, ${formatMinorToAmount(cumulative, currency)} ${currency} cumulative`}
                onPointerEnter={() => setActiveIndex(index)}
                onPointerLeave={() =>
                  setActiveIndex((current) => (current === index ? undefined : current))
                }
                onFocus={() => setActiveIndex(index)}
                onBlur={() =>
                  setActiveIndex((current) => (current === index ? undefined : current))
                }
                onClick={() => onOpen?.({ from: day.date, to: day.date })}
                onKeyDown={(event) => {
                  const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                  if (step === 0) return;
                  event.preventDefault();
                  walk(index, step, event.currentTarget);
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="legend">
        <span className="legend-item">
          <span className="dot expense" /> Actual
        </span>
        {projectedMinor !== undefined ? (
          <span className="legend-item">
            <span className="dot projection" /> Projection
          </span>
        ) : null}
      </div>
      {active && activeDay ? (
        <ChartTooltip
          xPercent={xPercent(active.index)}
          title={`${dayLabel(active.date)} · day ${active.index + 1} of ${daily.length}`}
          rows={
            activeDay.selected
              ? [
                  {
                    label: "Spent that day",
                    value: `${formatMinorToAmount(activeDay.spentMinor, currency)} ${currency}`,
                    tone: "expense",
                  },
                  {
                    label: "Cumulative",
                    value: `${formatMinorToAmount(active.value, currency)} ${currency}`,
                    tone: "line",
                  },
                  { label: "Movements", value: String(activeDay.transactionCount) },
                  {
                    label: "Share of period",
                    value: `${formatDecimal(share(activeDay.spentMinor, total))}%`,
                  },
                  ...(projectedMinor !== undefined && active.index === last.index
                    ? [
                        {
                          label: "At this pace",
                          value: `${formatMinorToAmount(projectedMinor, currency)} ${currency}`,
                          tone: "projection",
                        },
                      ]
                    : []),
                ]
              : [{ label: "Excluded", value: "not in the selected months", tone: "muted" }]
          }
          hint={onOpen ? "Click to open this day" : undefined}
        />
      ) : null}
    </figure>
  );
}
