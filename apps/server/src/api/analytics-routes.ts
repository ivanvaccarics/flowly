import { validateContract } from "@flowly/web-contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AnalyticsService } from "../application/analytics.js";
import type { Vault } from "../vault/vault.js";
import { parseAnalyticsScope } from "./analytics-scope.js";

export interface AnalyticsRouteDependencies {
  guard: (request: FastifyRequest, reply: FastifyReply) => { vault: Vault } | undefined;
  errorBody: (reply: FastifyReply) => Record<string, unknown>;
}

export function registerAnalyticsRoutes(
  app: FastifyInstance,
  dependencies: AnalyticsRouteDependencies,
): void {
  app.get("/api/dashboard", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const query = request.query as Record<string, unknown>;
    const parsed = parseAnalyticsScope(query, { includeTags: true });
    if ("error" in parsed) {
      reply.code(400);
      return parsed.error === "months"
        ? { error: "invalid_date_range", message: "months must be YYYY-MM values" }
        : { error: "invalid_date_range" };
    }
    const dashboard = await new AnalyticsService(context.vault).dashboard(parsed.scope);
    const validation = validateContract("dashboard", dashboard);
    if (!validation.valid) {
      reply.code(500);
      return { error: "contract_violation", details: validation.errors };
    }
    return dashboard;
  });

  /**
   * Reads the same period as the dashboard but returns one currency's expense
   * detail and names the currencies it left out instead of converting them.
   */
  app.get("/api/analytics/expenses", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const query = request.query as Record<string, unknown>;
    const parsed = parseAnalyticsScope(query);
    if ("error" in parsed) {
      reply.code(400);
      return parsed.error === "months"
        ? { error: "invalid_date_range", message: "months must be YYYY-MM values" }
        : { error: "invalid_date_range" };
    }
    const details = await new AnalyticsService(context.vault).expenseDetails(parsed.scope);
    const validation = validateContract("expenseDetails", details);
    if (!validation.valid) {
      reply.code(500);
      return { error: "contract_violation", details: validation.errors };
    }
    return details;
  });
}
