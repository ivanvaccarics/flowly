import { describe, expect, it } from "vitest";
import { dayLabel, formatCompact, heatColour, share, shortDate } from "./details-chart-utils.js";

describe("detail chart helpers", () => {
  it("formats dates and proportions", () => {
    expect(dayLabel("2026-09-12")).toBe("12 Sep 2026");
    expect(shortDate("2026-09-05")).toBe("5/9");
    expect(share(25, 100)).toBe(25);
    expect(share(25, 0)).toBe(0);
  });

  it("formats compact amounts and heat levels", () => {
    expect(formatCompact(120_000, "EUR")).toBe("1,2k");
    expect(formatCompact(-50_000, "JPY")).toBe("-50,0k");
    expect(heatColour(0)).toBe("rgba(30, 111, 78, 0.12)");
    expect(heatColour(1)).toBe("rgba(30, 111, 78, 1)");
  });
});
