import { useState } from "react";
import { Icon } from "./icons.js";
import { formatDecimal, formatMinorToAmount } from "../lib/money.js";

export interface SpendingDonutEntry {
  tagId: string;
  tagName: string;
  spentMinor: number;
  currency?: string;
  transactionCount?: number;
  averageMinor?: number;
  largestMinor?: number;
}

/**
 * A hand-rolled spending donut with one arc per tag and an accessible legend.
 * Dashboard and Details differ only in their centre copy and whether the legend
 * carries movement statistics.
 */
export function SpendingDonut({
  entries,
  currency,
  total,
  colourOf,
  onOpen,
  variant,
}: {
  entries: readonly SpendingDonutEntry[];
  currency: string;
  total: number;
  colourOf: (tagId: string, index: number) => string;
  onOpen: (tagId: string) => void;
  variant: "tag" | "category";
}) {
  const [activeTagId, setActiveTagId] = useState<string | undefined>(undefined);
  const size = 168;
  const centre = size / 2;
  const radius = 66;
  const circumference = 2 * Math.PI * radius;
  const gap = entries.length > 1 ? 3 : 0;
  const shareOf = (minor: number) => (total > 0 ? (minor / total) * 100 : 0);
  let consumed = 0;
  const slices = entries.map((entry, index) => {
    const share = total > 0 ? entry.spentMinor / total : 0;
    const length = Math.max(0, share * circumference - gap);
    const slice = {
      key: `${entry.tagId}-${entry.currency ?? currency}`,
      colour: colourOf(entry.tagId, index),
      dash: `${length} ${circumference - length}`,
      offset: -consumed,
    };
    consumed += share * circumference;
    return slice;
  });
  const totalText = formatMinorToAmount(total, currency);
  const active = entries.find((entry) => entry.tagId === activeTagId);
  const kind = variant === "tag" ? "tag" : "category";
  const label = `Spending by ${kind} in ${currency}: ${entries
    .map((entry) => `${entry.tagName} ${Math.round(shareOf(entry.spentMinor))}%`)
    .join(", ")}`;
  const totalClass =
    variant === "tag"
      ? totalText.length > 9
        ? "total small"
        : "total"
      : total > 0
        ? "total"
        : "total small";

  return (
    <div className={activeTagId === undefined ? "donut" : "donut has-active"}>
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
                {formatMinorToAmount(active.spentMinor, active.currency ?? currency)}
              </span>
              <span className="sub">
                {variant === "tag" ? (
                  <>
                    {active.currency ?? currency} · {formatDecimal(shareOf(active.spentMinor))}% of
                    spending
                  </>
                ) : (
                  <>
                    {formatDecimal(shareOf(active.spentMinor))}% · {active.transactionCount ?? 0}{" "}
                    {(active.transactionCount ?? 0) === 1 ? "movement" : "movements"}
                  </>
                )}
              </span>
            </>
          ) : (
            <>
              <span className="eyebrow" style={{ margin: 0 }}>
                {variant === "tag" ? currency : `Tagged ${currency}`}
              </span>
              <span className={totalClass}>{totalText}</span>
              <span className="sub">
                {variant === "tag"
                  ? "spent"
                  : `${entries.length} ${entries.length === 1 ? "category" : "categories"}`}
              </span>
            </>
          )}
        </div>
      </div>

      <ul className="legend-rows">
        {entries.map((entry, index) => (
          <li
            key={`${entry.tagId}-${entry.currency ?? currency}`}
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
              <span className="mono">
                {formatMinorToAmount(entry.spentMinor, entry.currency ?? currency)}
              </span>
              <span className="muted mono">{formatDecimal(shareOf(entry.spentMinor))}%</span>
              <span className="legend-mark" aria-hidden="true">
                <Icon name="transactions" size={14} />
              </span>
            </button>
            {variant === "category" ? (
              <span className="sub legend-sub">
                {entry.transactionCount ?? 0}{" "}
                {(entry.transactionCount ?? 0) === 1 ? "movement" : "movements"} · average{" "}
                {formatMinorToAmount(entry.averageMinor ?? 0, currency)} · largest{" "}
                {formatMinorToAmount(entry.largestMinor ?? 0, currency)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
