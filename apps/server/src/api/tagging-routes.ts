import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { TaggingRuleService } from "../application/tagging-rule-service.js";
import type { RuleCondition } from "../domain/tagging-rule.js";
import type { Vault } from "../vault/vault.js";

export interface TaggingRouteDependencies {
  guard: (request: FastifyRequest, reply: FastifyReply) => { vault: Vault } | undefined;
  errorBody: (reply: FastifyReply) => Record<string, unknown>;
}

export function registerTaggingRoutes(
  app: FastifyInstance,
  dependencies: TaggingRouteDependencies,
): void {
  app.post("/api/tagging-rules/backfill", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const scope: { accountId?: string; fromDate?: string; toDate?: string } = {};
    if (typeof body["accountId"] === "string") scope.accountId = body["accountId"];
    if (typeof body["fromDate"] === "string") scope.fromDate = body["fromDate"];
    if (typeof body["toDate"] === "string") scope.toDate = body["toDate"];
    return new TaggingRuleService(context.vault).backfill(scope);
  });

  app.get("/api/tagging-rules/stats", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    return new TaggingRuleService(context.vault).stats();
  });

  app.post("/api/tagging-rules/preview", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const body = (request.body ?? {}) as { combinator?: unknown; conditions?: unknown };
    const conditions = Array.isArray(body.conditions) ? (body.conditions as RuleCondition[]) : [];
    if (body.combinator !== "and" && body.combinator !== "or") {
      reply.code(400);
      return { error: "combinator_required" };
    }
    return new TaggingRuleService(context.vault).preview({
      combinator: body.combinator,
      conditions,
    });
  });
}
