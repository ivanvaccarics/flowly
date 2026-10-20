import { describe, expect, it } from "vitest";
import { daysBetween, monthEnd, shiftIsoDays } from "../src/dates.js";

describe("shared calendar helpers", () => {
  it("covers month ends in leap and non-leap years", () => {
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2028-02")).toBe("2028-02-29");
    expect(monthEnd("2026-12")).toBe("2026-12-31");
  });

  it("shifts dates and counts whole days in UTC", () => {
    expect(shiftIsoDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftIsoDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(daysBetween("2026-03-01", "2026-02-27")).toBe(2);
  });
});
