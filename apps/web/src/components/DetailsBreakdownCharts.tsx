import { useRef, useState } from "react";
import type { ExpenseDetails } from "@flowly/web-contracts";
import type { LedgerFilterSeed } from "../lib/ledger-filter.js";
import { formatDecimal, formatMinorToAmount } from "../lib/money.js";
import { ChartTooltip } from "./DetailChartTooltip.js";
import { dayLabel, heatColour, share } from "./details-chart-utils.js";
import { Empty } from "./ui.js";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function BreakdownRows({
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

/**
 * Daily spending laid out as Monday-to-Sunday weeks. Excluded months use a
 * distinct cell and every day is a named keyboard-reachable control.
 */
export function Heatmap({
  daily,
  currency,
  maxMinor,
  onOpen,
}: {
  daily: ExpenseDetails["daily"];
  currency: string;
  maxMinor: number;
  onOpen?: (seed: LedgerFilterSeed) => void;
}) {
  const [activeDate, setActiveDate] = useState<string | undefined>(undefined);
  const [anchor, setAnchor] = useState<{ xPercent: number; topPx: number } | undefined>(undefined);
  const frameRef = useRef<HTMLDivElement | null>(null);
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
  const total = daily.reduce((sum, day) => sum + day.spentMinor, 0);
  const firstSelected = daily.find((day) => day.selected) ?? first;
  const active =
    activeDate === undefined ? undefined : daily.find((day) => day.date === activeDate);
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

  function place(target: HTMLElement): void {
    const frame = frameRef.current;
    if (!frame) return;
    const frameRect = frame.getBoundingClientRect();
    const cellRect = target.getBoundingClientRect();
    setAnchor({
      xPercent:
        ((cellRect.left + cellRect.width / 2 - frameRect.left) / Math.max(1, frameRect.width)) *
        100,
      topPx: cellRect.bottom - frameRect.top + 4,
    });
  }

  function walk(from: number, step: number): void {
    let next = from + step;
    while (next >= 0 && next < cells.length && cells[next] === null) next += step;
    if (next < 0 || next >= cells.length) return;
    setActiveDate(cells[next]?.date);
    frameRef.current?.querySelector<HTMLButtonElement>(`[data-cell-index="${next}"]`)?.focus();
  }

  return (
    <div className="heatmap-frame" ref={frameRef}>
      <div className="heatmap" role="group" aria-label={summary}>
        <div className="heat-weekdays" aria-hidden="true">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="heat-weeks">
          {weeks.map((week, weekIndex) => (
            <div className="heat-week" key={`week-${weekIndex}`}>
              {week.map((day, dayIndex) => {
                const cellIndex = weekIndex * 7 + dayIndex;
                if (!day) {
                  return (
                    <span
                      className="heat-cell is-blank"
                      key={`blank-${weekIndex}-${dayIndex}`}
                      aria-hidden="true"
                    />
                  );
                }
                const level = maxMinor > 0 ? day.spentMinor / maxMinor : 0;
                const style =
                  !day.selected || day.spentMinor === 0
                    ? undefined
                    : { background: heatColour(Math.max(0.12, level)) };
                const base = !day.selected
                  ? "heat-cell is-excluded"
                  : day.spentMinor === 0
                    ? "heat-cell is-empty"
                    : "heat-cell";
                const movements = `${day.transactionCount} ${
                  day.transactionCount === 1 ? "movement" : "movements"
                }`;
                return (
                  <button
                    key={day.date}
                    type="button"
                    data-cell-index={cellIndex}
                    className={activeDate === day.date ? `${base} is-active` : base}
                    style={style}
                    tabIndex={
                      activeDate === day.date ||
                      (activeDate === undefined && day.date === firstSelected.date)
                        ? 0
                        : -1
                    }
                    aria-label={
                      day.selected
                        ? `${dayLabel(day.date)}: ${formatMinorToAmount(
                            day.spentMinor,
                            currency,
                          )} ${currency} across ${movements}`
                        : `${dayLabel(day.date)}: not in the selected months`
                    }
                    onPointerEnter={(event) => {
                      setActiveDate(day.date);
                      place(event.currentTarget);
                    }}
                    onPointerLeave={() =>
                      setActiveDate((current) => (current === day.date ? undefined : current))
                    }
                    onFocus={(event) => {
                      setActiveDate(day.date);
                      place(event.currentTarget);
                    }}
                    onBlur={() =>
                      setActiveDate((current) => (current === day.date ? undefined : current))
                    }
                    onClick={() => {
                      if (day.selected) onOpen?.({ from: day.date, to: day.date });
                    }}
                    onKeyDown={(event) => {
                      const step =
                        event.key === "ArrowRight"
                          ? 1
                          : event.key === "ArrowLeft"
                            ? -1
                            : event.key === "ArrowDown"
                              ? 7
                              : event.key === "ArrowUp"
                                ? -7
                                : 0;
                      if (step === 0) return;
                      event.preventDefault();
                      walk(cellIndex, step);
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {active && anchor ? (
        <ChartTooltip
          xPercent={anchor.xPercent}
          topPx={anchor.topPx}
          below
          title={dayLabel(active.date)}
          rows={
            active.selected
              ? [
                  {
                    label: "Spent",
                    value: `${formatMinorToAmount(active.spentMinor, currency)} ${currency}`,
                    tone: "expense",
                  },
                  {
                    label: "Movements",
                    value: String(active.transactionCount),
                  },
                  {
                    label: "Share of period",
                    value: `${formatDecimal(share(active.spentMinor, total))}%`,
                  },
                ]
              : [{ label: "Excluded", value: "not in the selected months", tone: "muted" }]
          }
          hint={active.selected && onOpen ? "Click to open this day" : undefined}
        />
      ) : null}
    </div>
  );
}
