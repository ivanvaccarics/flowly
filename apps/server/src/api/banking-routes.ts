import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { BankingService } from "../banking/banking-service.js";
import type { PsuHeaders } from "../banking/enable-banking-client.js";

export interface BankingRouteContext {
  service: BankingService;
}

export interface BankingRouteDependencies {
  /** Rejects the request when the origin, session, CSRF or vault is wrong. */
  guard: (request: FastifyRequest, reply: FastifyReply) => { service: BankingService } | undefined;
  errorBody: (reply: FastifyReply) => Record<string, unknown>;
}

const psuType = z.enum(["personal", "business"]);
const accountType = z.enum([
  "checking",
  "savings",
  "credit-card",
  "cash",
  "wallet",
  "investment",
  "other",
]);

const connectionBody = z.object({
  appId: z.string().trim().min(1).max(100),
  privateKeyPem: z.string().min(32).max(20_000).optional(),
  redirectUrl: z.string().trim().min(1).max(500),
  environment: z.enum(["SANDBOX", "PRODUCTION"]).optional(),
  psuType: psuType.optional(),
  country: z.string().trim().length(2).optional(),
  autoSync: z.boolean().optional(),
});

const authorizeBody = z.object({
  aspspName: z.string().trim().min(1).max(120),
  aspspCountry: z.string().trim().length(2),
  psuType: psuType.optional(),
});

const callbackBody = z.object({
  code: z.string().trim().min(1).max(4000),
  state: z.string().trim().min(1).max(400),
});

const mapAccountBody = z.object({
  providerAccountUid: z.string().trim().min(1).max(200),
  mode: z.enum(["create", "pair", "ignore"]),
  accountId: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  type: accountType.optional(),
  currency: z.string().trim().length(3).optional(),
});

const syncBody = z.object({ linkId: z.string().trim().min(1).max(100).optional() }).default({});

/** Enable Banking routes; every one needs an unlocked vault and a session. */
export function registerBankingRoutes(
  app: FastifyInstance,
  dependencies: BankingRouteDependencies,
): void {
  const resolve = (request: FastifyRequest, reply: FastifyReply): BankingRouteContext | undefined =>
    dependencies.guard(request, reply);

  app.get("/api/banking/status", async (request, reply) => {
    const context = resolve(request, reply);
    if (!context) return dependencies.errorBody(reply);
    return context.service.status();
  });

  app.put("/api/banking/enable-banking/config", async (request, reply) => {
    const context = resolve(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const parsed = connectionBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: "bank_config_invalid", details: parsed.error.issues.map(issueText) };
    }
    const saved = await context.service.saveConnection(compact(parsed.data));
    return { connection: saved, status: await context.service.status() };
  });

  app.delete("/api/banking/enable-banking/config", async (request, reply) => {
    const context = resolve(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const result = await context.service.deleteConnection();
    return { deleted: true, ...result };
  });

  app.get("/api/banking/enable-banking/aspsps", async (request, reply) => {
    const context = resolve(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const query = request.query as Record<string, unknown>;
    const country = typeof query["country"] === "string" ? query["country"] : undefined;
    const requested = psuType.safeParse(query["psuType"]);
    const aspsps = await context.service.listAspsps({
      ...(country ? { country } : {}),
      ...(requested.success ? { psuType: requested.data } : {}),
    });
    return { items: aspsps };
  });

  app.post("/api/banking/enable-banking/authorize", async (request, reply) => {
    const context = resolve(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const parsed = authorizeBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: "bank_config_invalid", details: parsed.error.issues.map(issueText) };
    }
    const start = await context.service.startAuthorization(compact(parsed.data));
    return start;
  });

  app.post("/api/banking/enable-banking/callback", async (request, reply) => {
    const context = resolve(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const parsed = callbackBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: "bank_config_invalid", details: parsed.error.issues.map(issueText) };
    }
    return context.service.completeAuthorization(parsed.data);
  });

  app.post("/api/banking/enable-banking/links/:id/accounts", async (request, reply) => {
    const context = resolve(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const { id } = request.params as { id: string };
    const parsed = mapAccountBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: "bank_config_invalid", details: parsed.error.issues.map(issueText) };
    }
    return context.service.mapAccount({ linkId: id, ...compact(parsed.data) });
  });

  app.delete("/api/banking/enable-banking/links/:id", async (request, reply) => {
    const context = resolve(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const { id } = request.params as { id: string };
    const result = await context.service.unlink(id);
    return { deleted: true, ...result };
  });

  app.post("/api/banking/sync", async (request, reply) => {
    const context = resolve(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const parsed = syncBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      reply.code(400);
      return { error: "bank_config_invalid", details: parsed.error.issues.map(issueText) };
    }
    const report = await context.service.runSync({
      ...(parsed.data.linkId ? { linkId: parsed.data.linkId } : {}),
      psu: psuFrom(request),
    });
    return { report, status: await context.service.status() };
  });

  app.get("/api/banking/sync", async (request, reply) => {
    const context = resolve(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const status = await context.service.status();
    return status.sync;
  });
}

function issueText(issue: { path: PropertyKey[]; message: string }): string {
  const path = issue.path.map(String).join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

type Compact<T> = {
  [K in keyof T as T[K] extends undefined ? never : K]: Exclude<T[K], undefined>;
};

/**
 * Drops `undefined` entries so parsed bodies satisfy `exactOptionalPropertyTypes`
 * without pretending an absent field was sent.
 */
function compact<T extends object>(value: T): Compact<T> {
  const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
  return Object.fromEntries(entries) as Compact<T>;
}

/**
 * The PSU context of the browser asking for data. Self-hosted banks sometimes
 * require it, and it is the only client context the connector forwards.
 */
export function psuFrom(request: FastifyRequest): PsuHeaders {
  const userAgent = request.headers["user-agent"];
  const address = request.ip || request.socket.remoteAddress;
  return {
    ...(address ? { psuIpAddress: address } : {}),
    ...(typeof userAgent === "string" ? { psuUserAgent: userAgent.slice(0, 300) } : {}),
  };
}
