export interface Clock {
  now(): Date;
  nowIso(): string;
  todayIso(): string;
}

export const systemClock: Clock = {
  now: () => new Date(),
  nowIso: () => new Date().toISOString(),
  todayIso: () => new Date().toISOString().slice(0, 10),
};

export function fixedClock(isoTimestamp: string): Clock {
  const value = new Date(isoTimestamp);
  return {
    now: () => new Date(value),
    nowIso: () => value.toISOString(),
    todayIso: () => value.toISOString().slice(0, 10),
  };
}
