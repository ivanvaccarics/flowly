import { createHash } from "node:crypto";
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
  /**
   * The service when the vault happens to be open, with no session involved.
   * The bank redirects the browser itself, so that landing page cannot carry a
   * session or a CSRF token: the single-use state in the URL is the credential.
   */
  serviceIfUnlocked: () => BankingService | undefined;
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

/**
 * The bank redirects the browser to this page, so it has to work without the
 * shell: it is a plain HTML document served by the server itself, with the
 * single-use state in the URL as the only credential. The inline script is
 * allowed by hash instead of loosening the policy.
 */
const CALLBACK_CLOSE_SCRIPT = "setTimeout(function(){window.close()},1500)";
const CALLBACK_CSP = [
  "default-src 'none'",
  `script-src 'sha256-${createHash("sha256").update(CALLBACK_CLOSE_SCRIPT).digest("base64")}'`,
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

/** Plain-language text for the OAuth errors Enable Banking can append. */
const CALLBACK_ERRORS: Record<string, string> = {
  access_denied: "You cancelled the consent at the bank, so nothing was connected.",
  server_error: "The bank reported an internal error. Try the connection again.",
  temporarily_unavailable:
    "The bank is temporarily unavailable. Try the connection again in a few minutes.",
  invalid_request: "The bank rejected the authorization request. Try again from Flowly.",
};

function describeCallbackError(error: string, description: string | undefined): string {
  const known = CALLBACK_ERRORS[error];
  if (known) return description ? `${known} (${description})` : known;
  return description ? `The bank reported ${error}: ${description}` : `The bank reported ${error}.`;
}

function callbackPage(options: {
  title: string;
  message: string;
  hint?: string;
  close?: boolean;
}): string {
  const escape = (value: string): string =>
    value.replace(/[&<>"']/g, (character) => {
      switch (character) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return "&#39;";
      }
    });
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escape(options.title)} · Flowly</title>`,
    "</head><body>",
    `<h1>${escape(options.title)}</h1>`,
    `<p>${escape(options.message)}</p>`,
    options.hint
      ? `<p>${escape(options.hint)}</p>`
      : "<p>You can close this window and return to Flowly.</p>",
    options.close ? `<script>${CALLBACK_CLOSE_SCRIPT}</script>` : "",
    "</body></html>",
  ].join("");
}

/** Enable Banking routes; every one needs an unlocked vault and a session. */
export function registerBankingRoutes(
  app: FastifyInstance,
  dependencies: BankingRouteDependencies,
): void {
  const resolve = (request: FastifyRequest, reply: FastifyReply): BankingRouteContext | undefined =>
    dependencies.guard(request, reply);

  /**
   * Where Enable Banking sends the browser after the consent. No session, no
   * CSRF and no shell: the state is single-use, bound to a pending link inside
   * the vault and short-lived, and this page only ever completes that link.
   */
  app.get("/enablebanking/auth_callback", async (request, reply) => {
    const query = (request.query ?? {}) as Record<string, unknown>;
    const code = typeof query["code"] === "string" ? query["code"] : undefined;
    const state = typeof query["state"] === "string" ? query["state"] : undefined;
    const error = typeof query["error"] === "string" ? query["error"] : undefined;
    const description =
      typeof query["error_description"] === "string" ? query["error_description"] : undefined;

    reply.type("text/html; charset=utf-8");
    reply.header("cache-control", "no-store");
    reply.header("content-security-policy", CALLBACK_CSP);

    const service = dependencies.serviceIfUnlocked();

    if (error !== undefined) {
      const message = describeCallbackError(error, description);
      if (service && state) await service.failAuthorization(state, message);
      reply.code(400);
      return callbackPage({ title: "Authorization failed", message });
    }
    if (!code || !state) {
      reply.code(400);
      return callbackPage({
        title: "Authorization failed",
        message: "This address is missing the authorization code the bank sends back.",
        hint:
          "Open Flowly and start the connection from Settings again. If the bank page was " +
          "already approved, paste this full address into the bank panel instead.",
      });
    }
    if (!service) {
      reply.code(423);
      return callbackPage({
        title: "Flowly is locked",
        message:
          "The vault is locked, so Flowly cannot store the bank session this address carries.",
        hint:
          "Open Flowly, unlock the vault, and paste this full address (with code and state) " +
          "into the bank panel to finish.",
      });
    }

    try {
      const result = await service.completeAuthorization({ code, state });
      return callbackPage({
        title: `${result.aspsp.name} is connected`,
        message: `Flowly can now read the accounts ${result.aspsp.name} shared.`,
        close: true,
      });
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : "The authorization could not be completed.";
      const known = await service.describeAuthorizationState(state);
      await service.failAuthorization(state, message);
      reply.code(400);
      if (known === "unknown") {
        return callbackPage({
          title: "Authorization failed",
          message:
            "Flowly has no pending request for this code. It was already completed, " +
            "deleted, or started in another Flowly instance.",
          hint:
            "Start the connection again from Settings. A newer request stays pending, so " +
            "delete it there before trying once more.",
        });
      }
      return callbackPage({ title: "Authorization failed", message });
    }
  });

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
 *
 * Only a public address is forwarded: none of the private ranges, loopback,
 * link-local or the CGNAT space Tailscale hands out can tell a bank that the
 * person is online, and sending one leaks a LAN address for nothing.
 */
export function psuFrom(request: FastifyRequest): PsuHeaders {
  const userAgent = request.headers["user-agent"];
  const address = request.ip || request.socket.remoteAddress;
  if (!address || !isPublicAddress(address)) return {};
  return {
    psuIpAddress: address,
    ...(typeof userAgent === "string" ? { psuUserAgent: userAgent.slice(0, 300) } : {}),
  };
}

/** True when an address is one a bank can meaningfully see as the PSU's IP. */
export function isPublicAddress(address: string): boolean {
  const value =
    address
      .trim()
      .replace(/^::ffff:/i, "")
      .split("%")[0] ?? "";
  if (value === "") return false;
  if (value.includes(":")) {
    const lower = value.toLowerCase();
    if (lower === "::1" || lower === "::") return false;
    return !(lower.startsWith("fc") || lower.startsWith("fd") || /^fe[89ab]/.test(lower));
  }
  const octets = value.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return false;
  const [first = 0, second = 0] = octets;
  if (first === 10 || first === 127 || first === 0) return false;
  if (first === 172 && second >= 16 && second <= 31) return false;
  if (first === 192 && second === 168) return false;
  if (first === 169 && second === 254) return false;
  // 100.64.0.0/10: shared address space, which is what Tailscale uses.
  if (first === 100 && second >= 64 && second <= 127) return false;
  return true;
}
