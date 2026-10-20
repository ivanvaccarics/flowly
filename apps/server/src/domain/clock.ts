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
