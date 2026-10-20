import { useCallback, useMemo, useState } from "react";
import { MONTH_SHORT, monthsRange, presetMonths, type MonthPreset } from "../lib/months.js";

export interface MonthScope {
  months: string[];
  preset: MonthPreset;
  anchorYear: number;
  from: string;
  to: string;
  setAnchorYear: (year: number) => void;
  applyPreset: (preset: MonthPreset) => void;
  toggleMonth: (month: string) => void;
  selectYear: (year: number) => void;
  clearMonths: () => void;
}

/** The shared period picker state used by Dashboard and Details. */
export function useMonthScope(
  options: { initialPreset?: MonthPreset; now?: Date } = {},
): MonthScope {
  const clock = useMemo(() => options.now ?? new Date(), [options.now]);
  const [months, setMonths] = useState<string[]>(() =>
    presetMonths(
      options.initialPreset === "custom" ? "month" : (options.initialPreset ?? "month"),
      clock,
    ),
  );
  const [preset, setPreset] = useState<MonthPreset>(options.initialPreset ?? "month");
  const [anchorYear, setAnchorYear] = useState(() => clock.getUTCFullYear());
  const { from, to } = useMemo(() => monthsRange(months), [months]);

  const applyPreset = useCallback(
    (next: MonthPreset) => {
      setPreset(next);
      if (next === "custom") return;
      const nextMonths = presetMonths(next, clock);
      setMonths(nextMonths);
      const newest = nextMonths[nextMonths.length - 1];
      if (newest) setAnchorYear(Number(newest.slice(0, 4)));
    },
    [clock],
  );

  const toggleMonth = useCallback((month: string) => {
    setPreset("custom");
    setMonths((current) =>
      current.includes(month)
        ? current.filter((candidate) => candidate !== month)
        : [...current, month].sort(),
    );
  }, []);

  const selectYear = useCallback((year: number) => {
    setPreset("custom");
    setMonths(MONTH_SHORT.map((_short, index) => `${year}-${String(index + 1).padStart(2, "0")}`));
  }, []);

  const clearMonths = useCallback(() => {
    setPreset("custom");
    setMonths([]);
  }, []);

  return {
    months,
    preset,
    anchorYear,
    from,
    to,
    setAnchorYear,
    applyPreset,
    toggleMonth,
    selectYear,
    clearMonths,
  };
}
