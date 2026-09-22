import { describe, expect, it } from "vitest";
import { addMonths, monthEnd, monthsRange, presetMonths, shiftMonths } from "./months.js";

const NOW = new Date("2026-09-22T10:00:00.000Z");

describe("month scopes", () => {
  it("builds the presets the dashboard offers", () => {
    expect(presetMonths("month", NOW)).toEqual(["2026-09"]);
    expect(presetMonths("quarter", NOW)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(presetMonths("year", NOW)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it("moves months across the year boundary", () => {
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2025-12", 1)).toBe("2026-01");
    expect(addMonths("2026-09", -12)).toBe("2025-09");
  });

  it("covers a scattered selection with its own window", () => {
    // The range spans the gap, but the keys the server is asked for do not.
    expect(monthsRange(["2026-09", "2025-11"])).toEqual({
      from: "2025-11-01",
      to: "2026-09-30",
    });
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2024-02")).toBe("2024-02-29");
  });

  it("shifts a selection back by its own length", () => {
    expect(shiftMonths(["2026-08", "2026-09"])).toEqual(["2026-06", "2026-07"]);
    expect(shiftMonths([])).toEqual([]);
  });
});
