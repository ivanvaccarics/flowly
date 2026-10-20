import { describe, expect, it } from "vitest";
import { parseAnalyticsScope } from "../src/api/analytics-scope.js";

describe("analytics scope", () => {
  it("uses the selected months as the whole window", () => {
    expect(
      parseAnalyticsScope(
        { months: "2026-09,2026-01", tags: "first, second,second" },
        { today: "2026-10-20", includeTags: true },
      ),
    ).toEqual({
      scope: {
        from: "2026-01-01",
        to: "2026-09-30",
        months: ["2026-01", "2026-09"],
        tagIds: ["first", "second"],
      },
    });
  });

  it("defaults to the current month and validates explicit ranges", () => {
    expect(parseAnalyticsScope({}, { today: "2026-10-20" })).toEqual({
      scope: {
        from: "2026-10-01",
        to: "2026-10-20",
        months: [],
        tagIds: [],
      },
    });
    expect(parseAnalyticsScope({ from: "2026-10-20", to: "2026-10-01" })).toEqual({
      error: "date_range",
    });
    expect(parseAnalyticsScope({ months: "2026-13" })).toEqual({ error: "months" });
  });
});
