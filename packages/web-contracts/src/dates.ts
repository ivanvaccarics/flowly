/**
 * Calendar helpers shared by the server and the web client. Dates are handled
 * in UTC so a self-hosted instance does not change its buckets with the host
 * time zone.
 */

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Whole days between two ISO calendar dates, independent of the time zone. */
export function daysBetween(from: string, to: string): number {
  const millis = Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`);
  return Math.round(Math.abs(millis) / 86_400_000);
}

/** Shifts an ISO calendar date by whole days, independent of the time zone. */
export function shiftIsoDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Returns the last calendar day of a `YYYY-MM` month. */
export function monthEnd(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  const day = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return `${month}-${pad(day)}`;
}
