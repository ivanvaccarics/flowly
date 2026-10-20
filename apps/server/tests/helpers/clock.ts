import type { Clock } from "../../src/domain/clock.js";

export function fixedClock(isoTimestamp: string): Clock {
  const value = new Date(isoTimestamp);
  return {
    now: () => new Date(value),
    nowIso: () => value.toISOString(),
    todayIso: () => value.toISOString().slice(0, 10),
  };
}
