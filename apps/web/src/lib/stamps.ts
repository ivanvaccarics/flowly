function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * An instant the vault stored in UTC, written in the reader's own zone: the
 * last sync, the wait until a bank may be read again. Dates that are calendar
 * days — a booking date, a month key — are not instants and never come through
 * here, so they keep the bank's own day.
 *
 * The shape stays `YYYY-MM-DD HH:mm`, which is what the banking panels have
 * always shown; only the zone changes. A value the browser cannot read is
 * handed back untouched instead of throwing.
 */
export function formatStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
