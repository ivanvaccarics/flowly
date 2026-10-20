import { MONTH_SHORT } from "../lib/months.js";
import { formatDecimal, formatMinorToAmount } from "../lib/money.js";

/** Share of a total as a percentage; zero when there is no total. */
export function share(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

/** `2026-09-12` becomes `12 Sep 2026`. */
export function dayLabel(date: string): string {
  const [year, month, day] = date.split("-");
  return `${Number(day)} ${MONTH_SHORT[Number(month) - 1] ?? month} ${year}`;
}

/** A translucent brand green, darker as the day's spending grows. */
export function heatColour(level: number): string {
  return `rgba(30, 111, 78, ${0.12 + 0.88 * level})`;
}

/** `2026-09-05` becomes `5/9`, the compact axis label. */
export function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(day)}/${Number(month)}`;
}

/** A short, rounded amount for an axis label: `1,2k`, `850`. */
export function formatCompact(minor: number, currency: string): string {
  const amount = Number(formatMinorToAmount(minor, currency).replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(amount)) return "";
  if (Math.abs(amount) >= 1000) return `${formatDecimal(amount / 1000)}k`;
  return String(Math.round(amount));
}
