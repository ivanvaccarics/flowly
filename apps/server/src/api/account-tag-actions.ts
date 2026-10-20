import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Vault } from "../vault/vault.js";

export interface AccountTagActionDependencies {
  guard: (request: FastifyRequest, reply: FastifyReply) => { vault: Vault } | undefined;
  errorBody: (reply: FastifyReply) => Record<string, unknown>;
}

export function registerAccountTagActions(
  app: FastifyInstance,
  dependencies: AccountTagActionDependencies,
): void {
  app.post("/api/accounts/:id/archive", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const { id } = request.params as { id: string };
    const revision = revisionFrom(request.body);
    if (!revision) {
      reply.code(400);
      return { error: "revision_required" };
    }
    return { entity: await context.vault.archiveAccount(id, revision) };
  });

  app.post("/api/accounts/:id/restore", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const { id } = request.params as { id: string };
    const revision = revisionFrom(request.body);
    if (!revision) {
      reply.code(400);
      return { error: "revision_required" };
    }
    return { entity: await context.vault.restoreAccount(id, revision) };
  });

  app.delete("/api/accounts/:id/cascade", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const { id } = request.params as { id: string };
    const revision = queryRevision(request);
    if (!revision) {
      reply.code(400);
      return { error: "revision_required" };
    }
    const result = await context.vault.deleteAccount(id, revision, { cascade: true });
    return { deleted: true, ...result };
  });

  app.delete("/api/tags/:id/cascade", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const { id } = request.params as { id: string };
    const revision = queryRevision(request);
    if (!revision) {
      reply.code(400);
      return { error: "revision_required" };
    }
    const result = await context.vault.deleteTag(id, revision, { cascade: true });
    return { deleted: true, ...result };
  });
}

function revisionFrom(body: unknown): number | undefined {
  const candidate = (body as Record<string, unknown> | null)?.["revision"];
  return Number.isSafeInteger(candidate) && (candidate as number) > 0
    ? (candidate as number)
    : undefined;
}

function queryRevision(request: FastifyRequest): number | undefined {
  const revision = Number((request.query as Record<string, unknown>)["revision"]);
  return Number.isSafeInteger(revision) && revision > 0 ? revision : undefined;
}
