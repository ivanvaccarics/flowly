import { useState } from "react";
import { Icon } from "./icons.js";
import { MONTH_SHORT, monthLabel, type MonthPreset } from "../lib/months.js";

const PRESETS: Array<[MonthPreset, string]> = [
  ["month", "Month"],
  ["quarter", "3 months"],
  ["year", "Year"],
  ["custom", "Custom"],
];

/**
 * The dashboard's period picker: a preset, a year strip, the twelve months of
 * the year the strip points at, and the selected months as removable chips.
 * Clicking a month is what "Custom" means, so the preset follows the click.
 */
export function DashboardFilters({
  months,
  preset,
  anchorYear,
  onPreset,
  onAnchorYear,
  onToggleMonth,
  onSelectYear,
  onClear,
  onRemoveMonth,
}: {
  months: string[];
  preset: MonthPreset;
  anchorYear: number;
  onPreset: (preset: MonthPreset) => void;
  onAnchorYear: (year: number) => void;
  onToggleMonth: (month: string) => void;
  onSelectYear: (year: number) => void;
  onClear: () => void;
  onRemoveMonth: (month: string) => void;
}) {
  const [windowOffset, setWindowOffset] = useState(0);
  const currentYear = new Date().getUTCFullYear();
  const years = [0, 1, 2, 3].map((step) => currentYear - 3 + windowOffset + step);
  const monthsOfYear = (year: number) =>
    months.filter((month) => month.startsWith(`${year}-`)).length;

  return (
    <section className="card dash-filters" aria-label="Dashboard period">
      <div className="filter-row">
        <div className="segmented" role="group" aria-label="Period preset">
          {PRESETS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={preset === key ? "segment active" : "segment"}
              aria-pressed={preset === key}
              onClick={() => onPreset(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="year-strip" role="group" aria-label="Year">
          <button
            type="button"
            className="year-arrow"
            aria-label="Earlier years"
            onClick={() => setWindowOffset((offset) => offset - 1)}
          >
            ‹
          </button>
          {years.map((year) => {
            const count = monthsOfYear(year);
            return (
              <button
                key={year}
                type="button"
                className={anchorYear === year ? "year active" : "year"}
                aria-pressed={anchorYear === year}
                onClick={() => onAnchorYear(year)}
              >
                {year}
                {count > 0 ? <span className="year-count">{count}</span> : null}
              </button>
            );
          })}
          <button
            type="button"
            className="year-arrow"
            aria-label="Later years"
            onClick={() => setWindowOffset((offset) => offset + 1)}
          >
            ›
          </button>
        </div>

        <div className="month-strip" role="group" aria-label={`Months of ${anchorYear}`}>
          {MONTH_SHORT.map((short, index) => {
            const month = `${anchorYear}-${String(index + 1).padStart(2, "0")}`;
            const selected = months.includes(month);
            return (
              <button
                key={month}
                type="button"
                className={selected ? "month active" : "month"}
                aria-pressed={selected}
                aria-label={monthLabel(month)}
                onClick={() => onToggleMonth(month)}
              >
                {short}
              </button>
            );
          })}
        </div>
      </div>

      {/* The actions live on the row of the selected months, so "Clear" lines up
          with the chips it clears instead of floating at the end of the grid. */}
      <div className="filter-chips">
        {months.length > 0 ? (
          <>
            <span className="eyebrow">Active</span>
            {months.map((month) => (
              <span key={month} className="filter-chip">
                {monthLabel(month)}
                <button
                  type="button"
                  aria-label={`Remove ${monthLabel(month)}`}
                  onClick={() => onRemoveMonth(month)}
                >
                  <Icon name="close" size={12} />
                </button>
              </span>
            ))}
          </>
        ) : (
          <span className="sub">No month selected</span>
        )}
        <div className="filter-actions">
          <button
            type="button"
            className="btn small ghost"
            onClick={() => onSelectYear(anchorYear)}
          >
            All {anchorYear}
          </button>
          <button
            type="button"
            className="btn small ghost"
            onClick={onClear}
            disabled={months.length === 0}
          >
            <Icon name="close" size={12} />
            Clear
          </button>
          <span className="sub">
            {months.length} {months.length === 1 ? "month" : "months"} selected
          </span>
        </div>
      </div>
    </section>
  );
}
