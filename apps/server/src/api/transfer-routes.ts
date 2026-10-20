import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { TransferPairingService } from "../application/transfer-pairing-service.js";
import type { Vault } from "../vault/vault.js";

export interface TransferRouteDependencies {
  guard: (request: FastifyRequest, reply: FastifyReply) => { vault: Vault } | undefined;
  errorBody: (reply: FastifyReply) => Record<string, unknown>;
  newId: () => string;
}

export function registerTransferRoutes(
  app: FastifyInstance,
  dependencies: TransferRouteDependencies,
): void {
  app.get("/api/transfers", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    return {
      items: await new TransferPairingService({
        vault: context.vault,
        newId: dependencies.newId,
      }).links(),
    };
  });

  app.post("/api/transfers/reconcile", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    return new TransferPairingService({
      vault: context.vault,
      newId: dependencies.newId,
    }).reconcile();
  });
}
