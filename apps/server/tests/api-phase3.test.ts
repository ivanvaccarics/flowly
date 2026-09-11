import { describe, expect, it } from "vitest";
import {
  SAMPLE_ACCOUNT,
  SAMPLE_TAG,
  call,
  makeConfig,
  sampleRule,
  sampleTransaction,
  startHarness,
} from "./helpers/api.js";

describe("core finance API", () => {
  it("applies tagging rules when a transaction is created", async () => {
    const { config } = makeConfig();
    const harness = await startHarness(config);
    try {
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/accounts",
        payload: { entity: SAMPLE_ACCOUNT },
      });
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/tags",
        payload: { entity: SAMPLE_TAG },
      });
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/tagging-rules",
        payload: { entity: sampleRule() },
      });

      const created = await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/transactions",
        payload: { entity: sampleTransaction({ userNote: "espresso with Luca" }) },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json<{ entity: { tagIds: string[] } }>().entity.tagIds).toEqual([
        SAMPLE_TAG.id,
      ]);
    } finally {
      await harness.close();
    }
  });

  it("backfills existing transactions and reports the outcome", async () => {
    const { config } = makeConfig();
    const harness = await startHarness(config);
    try {
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/accounts",
        payload: { entity: SAMPLE_ACCOUNT },
      });
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/tags",
        payload: { entity: SAMPLE_TAG },
      });
      const transaction = sampleTransaction({ userNote: "espresso with Luca" });
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/transactions",
        payload: { entity: transaction },
      });

      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/tagging-rules",
        payload: { entity: sampleRule() },
      });
      const backfill = await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/tagging-rules/backfill",
        payload: {},
      });
      expect(backfill.statusCode).toBe(200);
      expect(backfill.json<{ evaluated: number; changed: number }>()).toEqual({
        evaluated: 1,
        changed: 1,
      });

      const again = await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/tagging-rules/backfill",
        payload: {},
      });
      expect(again.json<{ changed: number }>().changed).toBe(0);
    } finally {
      await harness.close();
    }
  });

  it("refuses to drop data without an explicit cascade", async () => {
    const { config } = makeConfig();
    const harness = await startHarness(config);
    try {
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/accounts",
        payload: { entity: SAMPLE_ACCOUNT },
      });
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/tags",
        payload: { entity: SAMPLE_TAG },
      });
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/transactions",
        payload: { entity: sampleTransaction({ tagIds: [SAMPLE_TAG.id] }) },
      });

      const blockedAccount = await call(harness.app, harness.client, {
        method: "DELETE",
        url: `/api/accounts/${SAMPLE_ACCOUNT.id}?revision=1`,
      });
      expect(blockedAccount.statusCode).toBe(409);
      expect(blockedAccount.json<{ error: string }>().error).toBe("account_in_use");

      const blockedTag = await call(harness.app, harness.client, {
        method: "DELETE",
        url: `/api/tags/${SAMPLE_TAG.id}?revision=1`,
      });
      expect(blockedTag.statusCode).toBe(409);
      expect(blockedTag.json<{ error: string }>().error).toBe("tag_in_use");

      const tagCascade = await call(harness.app, harness.client, {
        method: "DELETE",
        url: `/api/tags/${SAMPLE_TAG.id}?revision=1&cascade=true`,
      });
      expect(tagCascade.statusCode).toBe(200);
      expect(tagCascade.json<{ updatedTransactions: number }>().updatedTransactions).toBe(1);

      const accountCascade = await call(harness.app, harness.client, {
        method: "DELETE",
        url: `/api/accounts/${SAMPLE_ACCOUNT.id}?revision=1&cascade=true`,
      });
      expect(accountCascade.statusCode).toBe(200);
      expect(accountCascade.json<{ deletedTransactions: number }>().deletedTransactions).toBe(1);
    } finally {
      await harness.close();
    }
  });

  it("archives an account instead of deleting it", async () => {
    const { config } = makeConfig();
    const harness = await startHarness(config);
    try {
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/accounts",
        payload: { entity: SAMPLE_ACCOUNT },
      });
      const archived = await call(harness.app, harness.client, {
        method: "POST",
        url: `/api/accounts/${SAMPLE_ACCOUNT.id}/archive`,
        payload: { revision: 1 },
      });
      expect(archived.statusCode).toBe(200);
      const entity = archived.json<{ entity: { archivedAt?: string; revision: number } }>().entity;
      expect(entity.archivedAt).toBeTruthy();
      expect(entity.revision).toBe(2);
    } finally {
      await harness.close();
    }
  });

  it("restores an archived account", async () => {
    const { config } = makeConfig();
    const harness = await startHarness(config);
    try {
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/accounts",
        payload: { entity: SAMPLE_ACCOUNT },
      });
      const archived = await call(harness.app, harness.client, {
        method: "POST",
        url: `/api/accounts/${SAMPLE_ACCOUNT.id}/archive`,
        payload: { revision: 1 },
      });
      expect(archived.statusCode).toBe(200);

      const restored = await call(harness.app, harness.client, {
        method: "POST",
        url: `/api/accounts/${SAMPLE_ACCOUNT.id}/restore`,
        payload: { revision: 2 },
      });
      expect(restored.statusCode).toBe(200);
      const entity = restored.json<{ entity: { archivedAt?: string; revision: number } }>().entity;
      expect(entity.archivedAt).toBeUndefined();
      expect(entity.revision).toBe(3);

      const listed = await call(harness.app, harness.client, {
        method: "GET",
        url: "/api/accounts",
      });
      const items = listed.json<{ items: Array<{ id: string; archivedAt?: string }> }>().items;
      expect(
        items.find((candidate) => candidate.id === SAMPLE_ACCOUNT.id)?.archivedAt,
      ).toBeUndefined();
    } finally {
      await harness.close();
    }
  });

  it("accepts an edit that clears an optional text field", async () => {
    const { config } = makeConfig();
    const harness = await startHarness(config);
    try {
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/accounts",
        payload: { entity: SAMPLE_ACCOUNT },
      });
      const created = await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/transactions",
        payload: {
          entity: sampleTransaction({ payee: "Bar Centrale", userNote: "espresso" }),
        },
      });
      const stored = created.json<{ entity: Record<string, unknown> }>().entity;

      // Saving the row back without touching anything must not fail.
      const unchanged = await call(harness.app, harness.client, {
        method: "PUT",
        url: `/api/transactions/${String(stored["id"])}`,
        payload: { entity: stored },
      });
      expect(unchanged.statusCode).toBe(200);

      // Clearing a note is a legitimate edit, not an invalid request.
      const cleared = await call(harness.app, harness.client, {
        method: "PUT",
        url: `/api/transactions/${String(stored["id"])}`,
        payload: { entity: { ...stored, revision: 2, userNote: "", payee: "" } },
      });
      expect(cleared.statusCode).toBe(200);
      const updated = cleared.json<{ entity: { userNote?: string; payee?: string } }>().entity;
      expect(updated.userNote).toBe("");
      expect(updated.payee).toBe("");
    } finally {
      await harness.close();
    }
  });
});

describe("data portability API", () => {
  it("exports a CSV and merges an import through the API", async () => {
    const { config } = makeConfig();
    const harness = await startHarness(config);
    try {
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/accounts",
        payload: { entity: SAMPLE_ACCOUNT },
      });
      await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/transactions",
        payload: {
          entity: sampleTransaction({ payee: "Bar Centrale", userNote: "espresso" }),
        },
      });

      const exported = await call(harness.app, harness.client, {
        method: "GET",
        url: "/api/export/transactions.csv",
      });
      expect(exported.statusCode).toBe(200);
      expect(exported.headers["content-type"]).toContain("text/csv");
      expect(exported.body).toContain("Bar Centrale");

      const csv = exported.body.replace(SAMPLE_ACCOUNT.id, SAMPLE_ACCOUNT.id);
      const preview = await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/import/csv/preview",
        payload: { content: csv },
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json<{ duplicates: number }>().duplicates).toBe(1);

      const merged = await call(harness.app, harness.client, {
        method: "POST",
        url: "/api/import/csv",
        payload: { content: csv },
      });
      expect(merged.statusCode).toBe(200);
      expect(merged.json<{ created: number; skippedDuplicates: number }>()).toMatchObject({
        created: 0,
        skippedDuplicates: 1,
        invalid: 0,
        tagsCreated: 0,
        transactionsTaggedByRules: 0,
      });
    } finally {
      await harness.close();
    }
  });

  it("exports an archive and imports it into another vault", async () => {
    const source = makeConfig();
    const target = makeConfig();
    const sourceHarness = await startHarness(source.config);
    const targetHarness = await startHarness(target.config);
    try {
      await call(sourceHarness.app, sourceHarness.client, {
        method: "POST",
        url: "/api/accounts",
        payload: { entity: SAMPLE_ACCOUNT },
      });
      await call(sourceHarness.app, sourceHarness.client, {
        method: "POST",
        url: "/api/tags",
        payload: { entity: SAMPLE_TAG },
      });
      await call(sourceHarness.app, sourceHarness.client, {
        method: "POST",
        url: "/api/tagging-rules",
        payload: { entity: sampleRule() },
      });
      await call(sourceHarness.app, sourceHarness.client, {
        method: "POST",
        url: "/api/transactions",
        payload: {
          entity: sampleTransaction({ userNote: "espresso", tagIds: [SAMPLE_TAG.id] }),
        },
      });

      const exportResponse = await call(sourceHarness.app, sourceHarness.client, {
        method: "POST",
        url: "/api/export/archive",
        payload: { password: "archive password" },
      });
      expect(exportResponse.statusCode).toBe(200);
      expect(exportResponse.headers["content-type"]).toContain("application/octet-stream");
      const contentBase64 = Buffer.from(exportResponse.rawPayload).toString("base64");
      expect(contentBase64.length).toBeGreaterThan(100);

      const wrongPassword = await call(targetHarness.app, targetHarness.client, {
        method: "POST",
        url: "/api/import/archive",
        payload: { password: "not the password", contentBase64 },
      });
      expect(wrongPassword.statusCode).toBe(400);
      expect(wrongPassword.json<{ error: string }>().error).toBe("archive_password_invalid");

      const imported = await call(targetHarness.app, targetHarness.client, {
        method: "POST",
        url: "/api/import/archive",
        payload: { password: "archive password", contentBase64 },
      });
      expect(imported.statusCode).toBe(200);
      expect(
        imported.json<{ accounts: number; transactions: number; taggingRules: number }>(),
      ).toMatchObject({ accounts: 1, transactions: 1, taggingRules: 1 });

      const transactions = await call(targetHarness.app, targetHarness.client, {
        method: "GET",
        url: "/api/transactions",
      });
      expect(transactions.json<{ items: unknown[] }>().items).toHaveLength(1);
    } finally {
      await sourceHarness.close();
      await targetHarness.close();
    }
  });
});
