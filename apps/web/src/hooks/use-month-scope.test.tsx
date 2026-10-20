import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMonthScope } from "./use-month-scope.js";

const NOW = new Date("2026-10-20T12:00:00.000Z");

describe("useMonthScope", () => {
  it("applies presets around a stable current month", () => {
    const { result } = renderHook(() => useMonthScope({ now: NOW }));

    expect(result.current.months).toEqual(["2026-10"]);
    expect(result.current.from).toBe("2026-10-01");
    expect(result.current.to).toBe("2026-10-31");

    act(() => result.current.applyPreset("quarter"));
    expect(result.current.preset).toBe("quarter");
    expect(result.current.months).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(result.current.anchorYear).toBe(2026);
  });

  it("switches to a custom selection and can select or clear a year", () => {
    const { result } = renderHook(() => useMonthScope({ now: NOW }));

    act(() => result.current.toggleMonth("2026-10"));
    expect(result.current.preset).toBe("custom");
    expect(result.current.months).toEqual([]);

    act(() => result.current.toggleMonth("2026-11"));
    expect(result.current.months).toEqual(["2026-11"]);

    act(() => result.current.selectYear(2025));
    expect(result.current.months).toHaveLength(12);
    expect(result.current.months[0]).toBe("2025-01");
    expect(result.current.months[11]).toBe("2025-12");

    act(() => result.current.clearMonths());
    expect(result.current.months).toEqual([]);
  });
});
