import { systemClock, type Clock } from "../domain/clock.js";
import {
  BANK_INITIAL_SYNC_DAYS,
  BANK_RATE_LIMIT_COOLDOWN_MS,
  BANK_RATE_LIMIT_MAX_COOLDOWN_MS,
  BANK_SYNC_OVERLAP_DAYS,
  type BankAccountLink,
  type BankConnection,
  type BankLink,
  type BankPayload,
} from "../domain/banking.js";
import { createTransaction, importFingerprint, type Transaction } from "../domain/transaction.js";
import type { TaggingRuleService } from "../application/tagging-rule-service.js";
import type { Vault } from "../vault/vault.js";
import {
  EnableBankingError,
  type EnableBankingClient,
  type PsuHeaders,
} from "./enable-banking-client.js";
import { normalizeTransaction, pickBalance } from "./normalize.js";

export interface SyncErrorEntry {
  linkId: string;
  accountId?: string;
  providerAccountUid?: string;
  message: string;
}

export interface SyncReport {
  startedAt: string;
  finishedAt: string;
  links: number;
  accounts: number;
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  failed: number;
  /** Links skipped because the bank's daily access cap is still in force. */
  blocked: number;
  /** Set when the bank refused a read for its daily cap during this run. */
  rateLimited: boolean;
  errors: SyncErrorEntry[];
  reconnectRequired: string[];
}

export interface BankSyncOptions {
  linkId?: string;
  /** PSU context of the browser that triggered the sync, when there is one. */
  psu?: PsuHeaders;
}

export interface BankSyncDependencies {
  vault: Vault;
  taggingRules: TaggingRuleService;
  clientFor: (connection: BankConnection) => EnableBankingClient;
  newId: () => string;
  clock?: Clock;
}

/**
 * Pulls provider data into the vault.
 *
 * The connector is an ingestion channel, never the source of truth: it only
 * adds or reconciles provider transactions, keeps user notes and tags intact,
 * and stores every raw response it saw. A failure on one account is recorded
 * and does not stop the others.
 */
export class BankSyncService {
  private readonly vault: Vault;
  private readonly taggingRules: TaggingRuleService;
  private readonly clientFor: (connection: BankConnection) => EnableBankingClient;
  private readonly newId: () => string;
  private readonly clock: Clock;
  private running: Promise<SyncReport> | undefined;

  constructor(dependencies: BankSyncDependencies) {
    this.vault = dependencies.vault;
    this.taggingRules = dependencies.taggingRules;
    this.clientFor = dependencies.clientFor;
    this.newId = dependencies.newId;
    this.clock = dependencies.clock ?? systemClock;
  }

  get isRunning(): boolean {
    return this.running !== undefined;
  }

  /** Serializes concurrent syncs; a second call joins the run in progress. */
  run(options: BankSyncOptions = {}): Promise<SyncReport> {
    if (this.running) return this.running;
    const run = this.execute(options).finally(() => {
      this.running = undefined;
    });
    this.running = run;
    return run;
  }

  private async execute(options: BankSyncOptions): Promise<SyncReport> {
    const startedAt = this.clock.nowIso();
    const report: SyncReport = {
      startedAt,
      finishedAt: startedAt,
      links: 0,
      accounts: 0,
      fetched: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      skipped: 0,
      failed: 0,
      blocked: 0,
      rateLimited: false,
      errors: [],
      reconnectRequired: [],
    };

    const connection = (await this.vault.bankConnections.list())[0];
    if (!connection) {
      report.finishedAt = this.clock.nowIso();
      return report;
    }
    const client = this.clientFor(connection);
    const links = (await this.vault.bankLinks.list()).filter(
      (link) =>
        link.connectionId === connection.id && (options.linkId ? link.id === options.linkId : true),
    );

    for (const link of links) {
      report.links += 1;
      if (await this.skipBlocked(link, report)) continue;
      const refused = await this.syncLink(link, client, report, options.psu);
      // The cap belongs to the consent: reading the accounts and the links that
      // come after this one only spends more of a budget that is already empty.
      if (refused) {
        report.rateLimited = true;
        break;
      }
    }

    report.finishedAt = this.clock.nowIso();
    return report;
  }

  private async syncLink(
    link: BankLink,
    client: EnableBankingClient,
    report: SyncReport,
    psu: PsuHeaders | undefined,
  ): Promise<boolean> {
    const accounts = (await this.vault.bankAccounts.list({ refA: link.id })).filter(
      (account) => account.status === "mapped" && account.accountId !== undefined,
    );
    if (accounts.length === 0) {
      return false;
    }
    if (link.status !== "authorized") {
      report.reconnectRequired.push(link.id);
      report.failed += 1;
      report.errors.push({ linkId: link.id, message: reconnectMessage(link.status) });
      await this.finishLink(link, reconnectMessage(link.status));
      return false;
    }
    const validUntil = link.accessValidUntil ? Date.parse(link.accessValidUntil) : Number.NaN;
    if (Number.isFinite(validUntil) && validUntil < Date.now()) {
      await this.markExpired(link, "The bank consent expired. Reconnect the bank to resume.");
      report.reconnectRequired.push(link.id);
      report.failed += 1;
      report.errors.push({ linkId: link.id, message: "consent expired" });
      return false;
    }

    try {
      if (link.sessionId) {
        const session = await client.getSession(link.sessionId);
        const status = (session.status ?? "").toUpperCase();
        if (status !== "AUTHORIZED") {
          await this.markExpired(
            link,
            `The bank session is ${status.toLowerCase() || "unusable"}.`,
          );
          report.reconnectRequired.push(link.id);
          report.failed += 1;
          report.errors.push({ linkId: link.id, message: `session ${status}` });
          return false;
        }
        await this.storePayload(link, {
          kind: "session",
          providerAccountUid: link.id,
          json: session,
        });
      }
    } catch (error) {
      if (error instanceof EnableBankingError && error.rateLimited) {
        await this.refuse(link, error, report);
        return true;
      }
      if (error instanceof EnableBankingError && error.needsReconnect) {
        await this.markExpired(link, reconnectMessage(undefined));
        report.reconnectRequired.push(link.id);
        report.failed += 1;
        report.errors.push({ linkId: link.id, message: error.message });
        return false;
      }
      report.failed += 1;
      report.errors.push({ linkId: link.id, message: describe(error) });
      await this.finishLink(link, describe(error));
      return false;
    }

    let lastError: string | undefined;
    for (const account of accounts) {
      report.accounts += 1;
      try {
        await this.syncAccount(link, account, client, report, psu);
      } catch (error) {
        if (error instanceof EnableBankingError && error.rateLimited) {
          await this.refuse(link, error, report);
          return true;
        }
        report.failed += 1;
        lastError = describe(error);
        report.errors.push({
          linkId: link.id,
          providerAccountUid: account.providerAccountUid,
          message: describe(error),
          ...(account.accountId ? { accountId: account.accountId } : {}),
        });
        if (error instanceof EnableBankingError && error.needsReconnect) {
          await this.markExpired(link, reconnectMessage(undefined));
          report.reconnectRequired.push(link.id);
          await this.finishLink(link, reconnectMessage(undefined), true);
          return false;
        }
      }
    }
    await this.finishLink(link, lastError);
    return false;
  }

  private async syncAccount(
    link: BankLink,
    account: BankAccountLink,
    client: EnableBankingClient,
    report: SyncReport,
    psu: PsuHeaders | undefined,
  ): Promise<void> {
    const accountId = account.accountId;
    if (!accountId) return;
    const today = this.clock.todayIso();
    const windowFrom = addDays(
      account.syncFrom ?? addDays(today, -BANK_INITIAL_SYNC_DAYS),
      -BANK_SYNC_OVERLAP_DAYS,
    );

    const details = await client.getAccount(account.providerAccountUid, psu ?? {});
    await this.storePayload(link, {
      kind: "account",
      providerAccountUid: account.providerAccountUid,
      json: details,
      ...(account.iban ? { providerAccountId: account.iban } : {}),
    });

    let balance: { minor: number; currency: string; type?: string } | undefined;
    try {
      const balances = await client.getBalances(account.providerAccountUid, psu ?? {});
      await this.storePayload(link, {
        kind: "balances",
        providerAccountUid: account.providerAccountUid,
        json: { balances },
        ...(account.iban ? { providerAccountId: account.iban } : {}),
      });
      balance = pickBalance(balances);
    } catch (error) {
      // An exhausted daily budget stops the account there: reading the
      // transactions next would only spend more of it.
      if (error instanceof EnableBankingError && error.rateLimited) throw error;
      report.errors.push({
        linkId: link.id,
        providerAccountUid: account.providerAccountUid,
        message: describe(error),
        ...(accountId ? { accountId } : {}),
      });
    }

    const pages = await client.getTransactions(account.providerAccountUid, {
      dateFrom: windowFrom,
      dateTo: today,
      ...(psu ? { psu } : {}),
    });
    const transactions = pages.flatMap((page) => page.transactions);
    report.fetched += transactions.length;
    for (const page of pages) {
      await this.storePayload(link, {
        kind: "transactions",
        providerAccountUid: account.providerAccountUid,
        json: page,
        requestFrom: windowFrom,
        requestTo: today,
        ...(account.iban ? { providerAccountId: account.iban } : {}),
      });
    }

    const now = this.clock.nowIso();
    const existing = await this.vault.transactions.list({ refA: accountId });
    const rules = await this.taggingRules.rules();
    // The rows this run wrote, so the transfer rules can pair them with the
    // other leg — which may be on another account, imported minutes earlier.
    const written: Transaction[] = [];
    let earliest: string | undefined;

    await this.vault.transaction(async () => {
      const byProviderId = new Map<string, Transaction>();
      const byFingerprint = new Map<string, Transaction>();
      for (const transaction of existing) {
        if (transaction.providerTransactionId) {
          byProviderId.set(transaction.providerTransactionId, transaction);
        }
        if (transaction.importFingerprint) {
          byFingerprint.set(transaction.importFingerprint, transaction);
        }
      }

      for (const raw of transactions) {
        const normalized = normalizeTransaction(raw);
        if (!normalized.ok) {
          report.skipped += 1;
          report.errors.push({
            linkId: link.id,
            providerAccountUid: account.providerAccountUid,
            message: `${normalized.reason}: ${normalized.detail}`,
            ...(accountId ? { accountId } : {}),
          });
          continue;
        }
        if (normalized.bookingDate < windowFrom) continue;
        if (!earliest || normalized.bookingDate < earliest) earliest = normalized.bookingDate;

        try {
          const fingerprint = importFingerprint({
            accountId,
            bookingDate: normalized.bookingDate,
            amountMinor: normalized.amountMinor,
            currency: normalized.currency,
            ...(normalized.description ? { description: normalized.description } : {}),
            ...(normalized.payee ? { payee: normalized.payee } : {}),
          });
          const match =
            (normalized.providerTransactionId
              ? byProviderId.get(normalized.providerTransactionId)
              : undefined) ?? byFingerprint.get(fingerprint);

          if (match) {
            const next: Transaction = {
              ...match,
              bookingDate: normalized.bookingDate,
              amountMinor: normalized.amountMinor,
              currency: normalized.currency,
              status: normalized.status,
              source: "enable-banking",
              provider: "enable-banking",
              providerAccountId: account.providerAccountUid,
              importFingerprint: match.importFingerprint ?? fingerprint,
              ...(normalized.providerTransactionId
                ? { providerTransactionId: normalized.providerTransactionId }
                : {}),
              ...(normalized.counterpartyIban
                ? { counterpartyIban: normalized.counterpartyIban }
                : {}),
              ...(normalized.valueDate ? { valueDate: normalized.valueDate } : {}),
              ...(normalized.payee ? { payee: normalized.payee } : {}),
              ...(normalized.description ? { description: normalized.description } : {}),
            };
            if (sameProviderFields(match, next)) {
              report.unchanged += 1;
              continue;
            }
            const updated = await this.vault.transactions.update(next, match.revision);
            written.push(updated);
            if (normalized.providerTransactionId) {
              byProviderId.set(normalized.providerTransactionId, updated);
            }
            byFingerprint.set(fingerprint, updated);
            report.updated += 1;
            continue;
          }

          const created = createTransaction(
            {
              accountId,
              bookingDate: normalized.bookingDate,
              amountMinor: normalized.amountMinor,
              currency: normalized.currency,
              status: normalized.status,
              source: "enable-banking",
              provider: "enable-banking",
              importFingerprint: fingerprint,
              ...(normalized.providerTransactionId
                ? { providerTransactionId: normalized.providerTransactionId }
                : {}),
              ...(normalized.counterpartyIban
                ? { counterpartyIban: normalized.counterpartyIban }
                : {}),
              ...(normalized.valueDate ? { valueDate: normalized.valueDate } : {}),
              ...(normalized.payee ? { payee: normalized.payee } : {}),
              ...(normalized.description ? { description: normalized.description } : {}),
            },
            { id: this.newId(), now },
          );
          const { transaction: tagged } = this.taggingRules.withRuleTags(created, rules);
          const stored = await this.vault.transactions.create(tagged);
          written.push(stored);
          if (normalized.providerTransactionId) {
            byProviderId.set(normalized.providerTransactionId, stored);
          }
          byFingerprint.set(fingerprint, stored);
          report.created += 1;
        } catch (error) {
          // One row the vault refuses must not cost the whole sync: report it
          // and keep importing the rest of the account.
          report.failed += 1;
          report.errors.push({
            linkId: link.id,
            providerAccountUid: account.providerAccountUid,
            message: describe(error),
            ...(accountId ? { accountId } : {}),
          });
        }
      }
    });

    await this.taggingRules.markTransfers(written);

    const nextSyncFrom =
      earliest && (!account.syncFrom || earliest < account.syncFrom) ? earliest : account.syncFrom;
    const next: BankAccountLink = {
      ...account,
      lastSyncedAt: now,
      ...(nextSyncFrom ? { syncFrom: nextSyncFrom } : {}),
      ...(balance
        ? {
            lastBalanceMinor: balance.minor,
            lastBalanceCurrency: balance.currency,
            ...(balance.type ? { lastBalanceType: balance.type } : {}),
            lastBalanceAt: now,
          }
        : {}),
    };
    await this.vault.bankAccounts.update(next, account.revision);
  }

  private async storePayload(
    link: BankLink,
    payload: {
      kind: BankPayload["kind"];
      providerAccountUid: string;
      json: unknown;
      providerAccountId?: string;
      requestFrom?: string;
      requestTo?: string;
    },
  ): Promise<void> {
    const now = this.clock.nowIso();
    const record: BankPayload = {
      formatVersion: 1,
      revision: 1,
      id: this.newId(),
      connectionId: link.connectionId,
      linkId: link.id,
      providerAccountUid: payload.providerAccountUid,
      kind: payload.kind,
      fetchedAt: now,
      json: payload.json,
      createdAt: now,
      updatedAt: now,
      ...(payload.providerAccountId ? { providerAccountId: payload.providerAccountId } : {}),
      ...(payload.requestFrom ? { requestFrom: payload.requestFrom } : {}),
      ...(payload.requestTo ? { requestTo: payload.requestTo } : {}),
    };
    await this.vault.bankPayloads.create(record);
  }

  private async finishLink(
    link: BankLink,
    error: string | undefined,
    keepTimestamp = false,
  ): Promise<void> {
    const current = await this.vault.bankLinks.get(link.id);
    if (!current) return;
    const next: BankLink = { ...current };
    if (!keepTimestamp) next.lastSyncedAt = this.clock.nowIso();
    if (error === undefined) {
      delete next.lastSyncError;
      // The bank answered again, so the daily cap is behind us: the next hit
      // starts the cooldown over instead of inheriting the old escalation.
      delete next.syncBlockedUntil;
      delete next.syncRateLimitStreak;
    } else next.lastSyncError = error.slice(0, 300);
    await this.vault.bankLinks.update(next, current.revision);
  }

  /**
   * True when the link is still sitting out the bank's daily access cap, so the
   * run reports it without asking the provider for anything.
   */
  private async skipBlocked(link: BankLink, report: SyncReport): Promise<boolean> {
    const blockedUntil = link.syncBlockedUntil;
    if (!blockedUntil || Date.parse(blockedUntil) <= this.clock.now().getTime()) return false;
    report.blocked += 1;
    const message = rateLimitMessage(blockedUntil);
    report.errors.push({ linkId: link.id, message });
    const current = await this.vault.bankLinks.get(link.id);
    if (current && current.lastSyncError !== message) {
      await this.vault.bankLinks.update({ ...current, lastSyncError: message }, current.revision);
    }
    return true;
  }

  /** Records the refusal, stops the account loop and arms the cooldown. */
  private async refuse(
    link: BankLink,
    error: EnableBankingError,
    report: SyncReport,
  ): Promise<void> {
    const until = await this.blockLink(link, error);
    report.failed += 1;
    report.errors.push({ linkId: link.id, message: rateLimitMessage(until) });
  }

  /**
   * Arms the cooldown on the link. The bank's counter resets at its own
   * midnight, which Flowly cannot observe, so the wait doubles on every hit
   * that finds the previous one was not enough.
   */
  private async blockLink(link: BankLink, error: EnableBankingError): Promise<string> {
    const now = this.clock.now().getTime();
    const streak = (link.syncRateLimitStreak ?? 0) + 1;
    const cooldown = Math.min(
      BANK_RATE_LIMIT_COOLDOWN_MS * 2 ** (streak - 1),
      BANK_RATE_LIMIT_MAX_COOLDOWN_MS,
    );
    const until = new Date(now + Math.max(cooldown, error.retryAfterMs ?? 0)).toISOString();
    const current = await this.vault.bankLinks.get(link.id);
    if (current) {
      await this.vault.bankLinks.update(
        {
          ...current,
          syncBlockedUntil: until,
          syncRateLimitStreak: streak,
          lastSyncError: rateLimitMessage(until).slice(0, 300),
        },
        current.revision,
      );
    }
    return until;
  }

  private async markExpired(link: BankLink, message: string): Promise<void> {
    const current = await this.vault.bankLinks.get(link.id);
    if (!current) return;
    if (current.status === "expired") {
      await this.finishLink(current, message);
      return;
    }
    await this.vault.bankLinks.update(
      { ...current, status: "expired", lastSyncError: message.slice(0, 300) },
      current.revision,
    );
  }
}

/** True when nothing meaningfully changed, so no write is needed. */
function sameProviderFields(current: Transaction, next: Transaction): boolean {
  return (
    current.bookingDate === next.bookingDate &&
    current.amountMinor === next.amountMinor &&
    current.currency === next.currency &&
    current.status === next.status &&
    current.payee === next.payee &&
    current.description === next.description &&
    current.valueDate === next.valueDate &&
    current.providerTransactionId === next.providerTransactionId &&
    current.counterpartyIban === next.counterpartyIban &&
    current.importFingerprint === next.importFingerprint
  );
}

function reconnectMessage(status: string | undefined): string {
  if (status === "expired") return "The bank consent expired. Reconnect the bank to resume.";
  if (status === "revoked") return "The bank consent was revoked. Reconnect the bank to resume.";
  if (status === "closed") return "The bank session was closed. Reconnect the bank to resume.";
  if (status === "pending") return "This bank still needs to be authorized.";
  return "This bank needs to be reconnected.";
}

/** What the user reads when the bank's per-day access cap is in the way. */
function rateLimitMessage(blockedUntil: string): string {
  return (
    "The bank's daily access limit for this consent is reached (ASPSP_RATE_LIMIT_EXCEEDED). " +
    `Flowly will try again after ${blockedUntil}.`
  );
}

function describe(error: unknown): string {
  if (error instanceof EnableBankingError) {
    return error.code ? `${error.code}: ${error.message}` : error.message;
  }
  return error instanceof Error ? error.message : "unknown error";
}

/** Calendar-day arithmetic on ISO dates, independent of the local time zone. */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
