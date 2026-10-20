import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ImportExportService } from "../application/import-export-service.js";
import { TaggingRuleService } from "../application/tagging-rule-service.js";
import type { Vault } from "../vault/vault.js";

export interface ImportExportRouteDependencies {
  guard: (request: FastifyRequest, reply: FastifyReply) => { vault: Vault } | undefined;
  errorBody: (reply: FastifyReply) => Record<string, unknown>;
  newId: () => string;
}

export function registerImportExportRoutes(
  app: FastifyInstance,
  dependencies: ImportExportRouteDependencies,
): void {
  const serviceFor = (context: { vault: Vault }): ImportExportService =>
    new ImportExportService({
      vault: context.vault,
      taggingRules: new TaggingRuleService(context.vault),
      newId: dependencies.newId,
    });

  app.get("/api/export/transactions.csv", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const csv = await serviceFor(context).exportTransactionsCsv();
    reply.header("content-type", "text/csv; charset=utf-8");
    reply.header("content-disposition", 'attachment; filename="flowly-transactions.csv"');
    return csv;
  });

  app.get("/api/export/tables.zip", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const tables = await serviceFor(context).exportTablesZip();
    reply.header("content-type", "application/zip");
    reply.header("content-disposition", `attachment; filename="${tables.filename}"`);
    reply.header("x-flowly-export-rows", String(tables.counts["transactions"] ?? 0));
    return reply.send(tables.content);
  });

  app.post("/api/export/archive", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const password = (request.body as { password?: unknown } | null)?.["password"];
    if (typeof password !== "string" || password.length < 8) {
      reply.code(400);
      return { error: "archive_password_too_short" };
    }
    const dir = mkdtempSync(join(tmpdir(), "flowly-export-"));
    const destination = join(dir, "vault.flowly");
    try {
      const result = await serviceFor(context).exportArchive(destination, password);
      const content = readFileSync(destination);
      reply.header("content-type", "application/octet-stream");
      reply.header("content-disposition", 'attachment; filename="flowly-vault.flowly"');
      reply.header("x-flowly-manifest-entries", String(result.manifest.entries.length));
      return reply.send(content);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  app.post("/api/import/csv/preview", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const content = csvContent(request.body);
    if (content === undefined) {
      reply.code(400);
      return { error: "csv_content_required" };
    }
    return serviceFor(context).previewTransactionCsv(content);
  });

  app.post("/api/import/csv", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const content = csvContent(request.body);
    if (content === undefined) {
      reply.code(400);
      return { error: "csv_content_required" };
    }
    return serviceFor(context).importTransactionCsv(content);
  });

  app.post("/api/import/archive", async (request, reply) => {
    const context = dependencies.guard(request, reply);
    if (!context) return dependencies.errorBody(reply);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const password = body["password"];
    const contentBase64 = body["contentBase64"];
    if (typeof password !== "string" || password.length === 0) {
      reply.code(400);
      return { error: "archive_password_required" };
    }
    if (typeof contentBase64 !== "string" || contentBase64.length === 0) {
      reply.code(400);
      return { error: "archive_content_required" };
    }
    const dir = mkdtempSync(join(tmpdir(), "flowly-import-"));
    const source = join(dir, "vault.flowly");
    try {
      writeFileSync(source, Buffer.from(contentBase64, "base64"), { mode: 0o600 });
      return await serviceFor(context).importArchive(source, password);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

function csvContent(body: unknown): string | undefined {
  const candidate = (body as Record<string, unknown> | null)?.["content"];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}
