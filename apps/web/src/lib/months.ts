/**
 * Calendar months as the dashboard scopes them: a key is `YYYY-MM`, and every
 * aggregate is asked for by key, so a scattered selection (January, September)
 * never drags the months between it into the figures.
 */

export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export type MonthPreset = "month" | "quarter" | "year" | "custom";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** The `YYYY-MM` key of a date, in UTC like every stored date. */
export function monthOf(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

export function addMonths(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + delta;
  const shifted = new Date(Date.UTC(year, index, 1));
  return monthOf(shifted);
}

export function monthLabel(month: string): string {
  return `${MONTH_SHORT[Number(month.slice(5, 7)) - 1] ?? month} ${month.slice(0, 4)}`;
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

/** The last calendar day of the month, so a bucket covers all of it. */
export function monthEnd(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  const day = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return `${month}-${pad(day)}`;
}

/** The window a month set covers, for the ledger links and the range label. */
export function monthsRange(months: readonly string[]): { from: string; to: string } {
  const sorted = [...months].sort();
  const first = sorted[0] ?? monthOf(new Date());
  const last = sorted[sorted.length - 1] ?? first;
  return { from: monthStart(first), to: monthEnd(last) };
}

/** The months a preset stands for: this month, the last three, or this year. */
export function presetMonths(preset: "month" | "quarter" | "year", now = new Date()): string[] {
  const current = monthOf(now);
  if (preset === "month") return [current];
  if (preset === "quarter") {
    return [addMonths(current, -2), addMonths(current, -1), current];
  }
  const year = current.slice(0, 4);
  const months: string[] = [];
  for (let index = 0; index < Number(current.slice(5, 7)); index += 1) {
    months.push(`${year}-${pad(index + 1)}`);
  }
  return months;
}

/** The same number of months immediately before the selection, for the delta. */
export function shiftMonths(months: readonly string[]): string[] {
  if (months.length === 0) return [];
  const span = months.length;
  return months.map((month) => addMonths(month, -span)).sort();
}

export function monthsQuery(months: readonly string[]): string {
  return [...months].sort().join(",");
}
