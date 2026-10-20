import { monthEnd } from "@flowly/web-contracts";
import { parseMonthKeys, type DashboardScope } from "../application/analytics.js";
import { isIsoDate } from "../domain/values.js";

export type AnalyticsScopeResult = { scope: DashboardScope } | { error: "months" | "date_range" };

/**
 * Reads the month and tag scope shared by the dashboard and expense details
 * routes. An explicit month set defines the whole window, including when the
 * selected months are not contiguous.
 */
export function parseAnalyticsScope(
  query: Record<string, unknown>,
  options: { today?: string; includeTags?: boolean } = {},
): AnalyticsScopeResult {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const months = parseMonthKeys(query["months"]);
  if (months === undefined) return { error: "months" };

  const from =
    months.length > 0
      ? `${months[0]}-01`
      : typeof query["from"] === "string"
        ? query["from"]
        : `${today.slice(0, 7)}-01`;
  const to =
    months.length > 0
      ? monthEnd(months[months.length - 1]!)
      : typeof query["to"] === "string"
        ? query["to"]
        : today;
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
    return { error: "date_range" };
  }

  const tagIds =
    options.includeTags && typeof query["tags"] === "string"
      ? [
          ...new Set(
            query["tags"]
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        ]
      : [];
  return { scope: { from, to, months, tagIds } };
}
