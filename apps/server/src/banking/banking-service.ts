import { randomBytes } from "node:crypto";
import { createAccount, type Account, type AccountType } from "../domain/account.js";
import {
  BANK_CONSENT_TARGET_DAYS,
  BANK_PROVIDER,
  isBankEnvironment,
  isBankPsuType,
  isCountryCode,
  validateBankConnection,
  type BankAccountLink,
  type BankConnection,
  type BankConnectionPublic,
  type BankEnvironment,
  type BankLink,
  type BankLinkStatus,
  type BankPsuType,
} from "../domain/banking.js";
import { systemClock, type Clock } from "../domain/clock.js";
import { isSupportedCurrency } from "../domain/money.js";
import type { Vault } from "../vault/vault.js";
import { TaggingRuleService } from "../application/tagging-rule-service.js";
import { BankingError } from "./errors.js";
import { EnableBankingClient, type PsuHeaders } from "./enable-banking-client.js";
import {
  accountTypeFromCashAccountType,
  maskIban,
  normalizeAccount,
  normalizeTimestamp,
} from "./normalize.js";
import { publicKeyFingerprint } from "./jwt.js";
import { BankSyncService, type SyncReport } from "./sync.js";
import type { EbAccountResource, EbAspsp } from "./enable-banking-types.js";
import type { EbApplication } from "./enable-banking-types.js";

const STATE_TTL_MS = 15 * 60_000;

export interface AspspCredentialSummary {
  name: string;
  title?: string;
  required: boolean;
  description?: string;
  template?: string;
}

export interface AspspMethodSummary {
  name?: string;
  approach: string;
  psuType: BankPsuType;
  credentials: AspspCredentialSummary[];
}

export interface AspspSummary {
  name: string;
  country: string;
  logo?: string;
  bic?: string;
  beta: boolean;
  psuTypes: BankPsuType[];
  methods: AspspMethodSummary[];
  maximumConsentDays?: number;
  sandboxUsers: Array<{ username?: string; password?: string; otp?: string }>;
}

export interface BankAccountSummary {
  id: string;
  providerAccountUid: string;
  status: BankAccountLink["status"];
  accountId?: string;
  accountName?: string;
  iban?: string;
  maskedIban?: string;
  providerName?: string;
  currency?: string;
  cashAccountType?: string;
  lastSyncedAt?: string;
  lastBalanceMinor?: number;
  lastBalanceCurrency?: string;
  lastBalanceAt?: string;
  transactionCount: number;
}

export interface BankLinkSummary {
  id: string;
  aspspName: string;
  aspspCountry: string;
  aspspLogo?: string;
  psuType: BankPsuType;
  status: BankLinkStatus;
  accessValidUntil?: string;
  lastSyncedAt?: string;
  lastSyncError?: string;
  createdAt: string;
  accounts: BankAccountSummary[];
}

export interface BankingSyncState {
  running: boolean;
  lastSyncAt?: string;
  lastReport?: SyncReport;
}

export interface BankingStatus {
  provider: typeof BANK_PROVIDER;
  configured: boolean;
  connection?: BankConnectionPublic;
  links: BankLinkSummary[];
  sync: BankingSyncState;
  autoSync?: boolean;
}

export interface SaveConnectionInput {
  appId: string;
  /** Omitted when only settings change and the stored key should be reused. */
  privateKeyPem?: string;
  redirectUrl: string;
  environment?: BankEnvironment;
  psuType?: BankPsuType;
  country?: string;
  autoSync?: boolean;
}

export interface DiscoveredAccount {
  providerAccountUid: string;
  status: BankAccountLink["status"];
  suggestedName: string;
  suggestedType: AccountType;
  suggestedCurrency?: string;
  currency?: string;
  iban?: string;
  maskedIban?: string;
  providerName?: string;
  cashAccountType?: string;
}

export interface AuthorizeStart {
  linkId: string;
  url: string;
  state: string;
  expiresAt: string;
}

export interface AuthorizationResult {
  link: BankLinkSummary;
  accounts: DiscoveredAccount[];
  aspsp: { name: string; country: string };
  accessValidUntil?: string;
}

export interface MapAccountInput {
  linkId: string;
  providerAccountUid: string;
  mode: "create" | "pair" | "ignore";
  accountId?: string;
  name?: string;
  type?: AccountType;
  currency?: string;
}

export interface BankingServiceDependencies {
  vault: Vault;
  newId: () => string;
  clock?: Clock;
  /** Injected by tests; defaults to a real client over HTTPS. */
  clientFor?: (connection: BankConnection) => EnableBankingClient;
  /** Forwarded to the default client factory. */
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Enable Banking integration for one unlocked vault.
 *
 * Application credentials, links and raw provider payloads all live in the
 * encrypted vault, and the private key is never returned to a client: the API
 * only exposes a fingerprint of the matching public key.
 */
export class BankingService {
  readonly sync: BankSyncService;

  private readonly vault: Vault;
  private readonly newId: () => string;
  private readonly clock: Clock;
  private readonly clientFor: (connection: BankConnection) => EnableBankingClient;
  private lastReport: SyncReport | undefined;

  constructor(dependencies: BankingServiceDependencies) {
    this.vault = dependencies.vault;
    this.newId = dependencies.newId;
    this.clock = dependencies.clock ?? systemClock;
    this.clientFor =
      dependencies.clientFor ??
      ((connection) =>
        new EnableBankingClient({
          appId: connection.appId,
          privateKeyPem: connection.privateKeyPem,
          ...(dependencies.fetch ? { fetch: dependencies.fetch } : {}),
          ...(dependencies.sleep ? { sleep: dependencies.sleep } : {}),
        }));
    this.sync = new BankSyncService({
      vault: this.vault,
      taggingRules: new TaggingRuleService(this.vault, this.clock),
      clientFor: this.clientFor,
      newId: this.newId,
      clock: this.clock,
    });
  }

  async connection(): Promise<BankConnection | undefined> {
    return (await this.vault.bankConnections.list())[0];
  }

  async status(): Promise<BankingStatus> {
    const connection = await this.connection();
    if (!connection) {
      return { provider: BANK_PROVIDER, configured: false, links: [], sync: this.syncState() };
    }
    await this.expireStaleLinks(connection);
    const links = await this.summarizeLinks(connection);
    return {
      provider: BANK_PROVIDER,
      configured: true,
      connection: publicConnection(connection),
      links,
      sync: this.syncState(),
      autoSync: connection.autoSync,
    };
  }

  /** Verifies the credentials against Enable Banking before storing them. */
  async saveConnection(input: SaveConnectionInput): Promise<BankConnectionPublic> {
    const existing = await this.connection();
    const now = this.clock.nowIso();
    const privateKeyPem = input.privateKeyPem
      ? normalizePem(input.privateKeyPem)
      : existing?.privateKeyPem;
    if (!privateKeyPem) {
      throw new BankingError(
        "bank_config_invalid",
        "Choose the Enable Banking private key (.pem) to connect.",
      );
    }
    const candidate: BankConnection = {
      formatVersion: 1,
      revision: existing?.revision ?? 1,
      id: existing?.id ?? this.newId(),
      provider: BANK_PROVIDER,
      appId: input.appId.trim(),
      privateKeyPem,
      redirectUrl: input.redirectUrl.trim(),
      environment: input.environment ?? existing?.environment ?? "SANDBOX",
      psuType: input.psuType ?? existing?.psuType ?? "personal",
      country: (input.country ?? existing?.country ?? "IT").toUpperCase(),
      autoSync: input.autoSync ?? existing?.autoSync ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    validateConnectionInput(candidate);

    const client = this.clientOrThrow(candidate);
    const application = await this.verifyApplication(client);
    if (!application.active) {
      throw new BankingError(
        "bank_application_inactive",
        "This Enable Banking application is not active.",
      );
    }
    if (
      isBankEnvironment(application.environment) &&
      application.environment !== candidate.environment
    ) {
      throw new BankingError(
        "bank_environment_mismatch",
        `This key belongs to a ${application.environment} application, not ${candidate.environment}.`,
        { detail: { environment: application.environment } },
      );
    }
    if (!application.redirect_urls.includes(candidate.redirectUrl)) {
      throw new BankingError(
        "bank_redirect_not_registered",
        "The callback URL is not one of the redirect URLs registered for this application.",
        { detail: { redirectUrls: application.redirect_urls } },
      );
    }
    const stored: BankConnection = { ...candidate, appName: application.name };
    validateBankConnection(stored);

    const saved = existing
      ? await this.vault.bankConnections.update(stored, existing.revision)
      : await this.vault.bankConnections.create(stored);
    return publicConnection(saved);
  }

  /** Removes the credentials, links, mappings and stored provider payloads. */
  async deleteConnection(): Promise<{ deletedLinks: number }> {
    const connection = await this.connection();
    if (!connection) return { deletedLinks: 0 };
    const links = await this.vault.bankLinks.list({ refA: connection.id });
    for (const link of links) await this.removeLinkData(link);
    await this.vault.bankConnections.delete(connection.id, connection.revision);
    this.lastReport = undefined;
    return { deletedLinks: links.length };
  }

  async listAspsps(
    params: { country?: string; psuType?: BankPsuType } = {},
  ): Promise<AspspSummary[]> {
    const { client } = await this.requireClient();
    const aspsps = await this.withProviderErrors(() =>
      client.listAspsps({
        ...(params.country ? { country: params.country } : {}),
        ...(params.psuType ? { psuType: params.psuType } : {}),
      }),
    );
    return aspsps
      .map((aspsp) => summarizeAspsp(aspsp))
      .filter((aspsp) => aspsp.psuTypes.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Starts the PSU authorization; the caller redirects the browser to `url`. */
  async startAuthorization(input: {
    aspspName: string;
    aspspCountry: string;
    psuType?: BankPsuType;
  }): Promise<AuthorizeStart> {
    const { connection, client } = await this.requireClient();
    await this.expireStaleLinks(connection);
    const aspsps = await this.withProviderErrors(() =>
      client.listAspsps({ country: input.aspspCountry }),
    );
    const aspsp = aspsps.find(
      (candidate) =>
        candidate.name === input.aspspName &&
        candidate.country.toUpperCase() === input.aspspCountry.toUpperCase(),
    );
    if (!aspsp) {
      throw new BankingError(
        "bank_config_invalid",
        "That bank is not available at Enable Banking.",
      );
    }
    const psuType = input.psuType ?? connection.psuType;
    if (!aspsp.psu_types.includes(psuType)) {
      throw new BankingError(
        "bank_config_invalid",
        `${aspsp.name} does not support a ${psuType} account.`,
      );
    }

    const now = this.clock.nowIso();
    const state = randomBytes(32).toString("base64url");
    const stateExpiresAt = this.clock.now().getTime() + STATE_TTL_MS;
    const validUntil = consentValidUntil(
      this.clock.now().getTime(),
      aspsp.maximum_consent_validity ?? undefined,
    );
    const authorization = await this.withProviderErrors(() =>
      client.startAuthorization({
        aspspName: aspsp.name,
        aspspCountry: aspsp.country,
        state,
        redirectUrl: connection.redirectUrl,
        psuType,
        validUntil: new Date(validUntil).toISOString(),
        psuId: this.vault.header.vaultId,
      }),
    );

    const link: BankLink = {
      formatVersion: 1,
      revision: 1,
      id: this.newId(),
      connectionId: connection.id,
      provider: BANK_PROVIDER,
      aspspName: aspsp.name,
      aspspCountry: aspsp.country.toUpperCase(),
      psuType,
      state,
      stateExpiresAt: new Date(stateExpiresAt).toISOString(),
      authorizationId: authorization.authorization_id,
      status: "pending",
      providerAccountUids: [],
      createdAt: now,
      updatedAt: now,
      ...(aspsp.logo ? { aspspLogo: aspsp.logo } : {}),
    };
    const created = await this.vault.bankLinks.create(link);
    return {
      linkId: created.id,
      url: authorization.url,
      state,
      expiresAt: created.stateExpiresAt,
    };
  }

  /**
   * Completes the redirect: validates the single-use state, exchanges the code
   * for a session and records every account the PSU shared.
   */
  async completeAuthorization(input: {
    code: string;
    state: string;
  }): Promise<AuthorizationResult> {
    const { connection, client } = await this.requireClient();
    const links = await this.vault.bankLinks.list({ refA: connection.id });
    const link = links.find((candidate) => candidate.state === input.state);
    if (!link || link.status !== "pending") {
      throw new BankingError(
        "bank_state_invalid",
        "This authorization link is no longer valid. Start the connection again.",
      );
    }
    if (Date.parse(link.stateExpiresAt) < this.clock.now().getTime()) {
      await this.vault.bankLinks.update(
        { ...link, status: "failed", lastSyncError: "The authorization request expired." },
        link.revision,
      );
      throw new BankingError("bank_state_invalid", "This authorization request expired.");
    }

    const session = await this.withProviderErrors(() => client.createSession(input.code));
    const now = this.clock.nowIso();
    const accounts = (session.accounts ?? []).filter(
      (account): account is EbAccountResource & { uid: string } => typeof account?.uid === "string",
    );
    const sessionId = session.session_id ?? link.sessionId;
    const accessValidUntil = normalizeTimestamp(session.access?.valid_until);
    const updated = await this.vault.bankLinks.update(
      {
        ...link,
        status: "authorized",
        providerAccountUids: accounts.map((account) => account.uid),
        // Single use: a replayed callback can no longer match this link.
        state: randomBytes(32).toString("base64url"),
        stateExpiresAt: now,
        ...(sessionId ? { sessionId } : {}),
        ...(accessValidUntil ? { accessValidUntil } : {}),
      },
      link.revision,
    );

    await this.replaceDiscoveredAccounts(updated, accounts);
    await this.vault.bankPayloads.create({
      formatVersion: 1,
      revision: 1,
      id: this.newId(),
      connectionId: connection.id,
      linkId: updated.id,
      providerAccountUid: updated.id,
      kind: "session",
      fetchedAt: now,
      json: session,
      createdAt: now,
      updatedAt: now,
    });

    const summary = await this.summarizeLink(updated);
    return {
      link: summary,
      accounts: (await this.vault.bankAccounts.list({ refA: updated.id })).map((account) =>
        discoveredAccount(account),
      ),
      aspsp: { name: updated.aspspName, country: updated.aspspCountry },
      ...(updated.accessValidUntil ? { accessValidUntil: updated.accessValidUntil } : {}),
    };
  }

  /** Creates a Flowly account, pairs an existing one, or ignores the account. */
  async mapAccount(input: MapAccountInput): Promise<BankLinkSummary> {
    const { connection } = await this.requireClient();
    const link = await this.vault.bankLinks.get(input.linkId);
    if (!link || link.connectionId !== connection.id) {
      throw new BankingError("bank_link_not_found", "That bank link does not exist.", {
        status: 404,
      });
    }
    const links = await this.vault.bankAccounts.list({ refA: link.id });
    const account = links.find((entry) => entry.providerAccountUid === input.providerAccountUid);
    if (!account) {
      throw new BankingError(
        "bank_account_not_found",
        "That provider account is not in this link.",
        {
          status: 404,
        },
      );
    }
    const now = this.clock.nowIso();

    if (input.mode === "ignore") {
      const next: BankAccountLink = {
        ...account,
        status: "ignored",
        updatedAt: now,
      };
      delete next.accountId;
      await this.vault.bankAccounts.update(next, account.revision);
      return this.summarizeLink(link);
    }

    let accountId: string;
    if (input.mode === "pair") {
      if (!input.accountId) {
        throw new BankingError("bank_config_invalid", "Choose the Flowly account to pair.");
      }
      const target = await this.vault.accounts.get(input.accountId);
      if (!target || target.archivedAt) {
        throw new BankingError("bank_account_not_found", "That Flowly account does not exist.", {
          status: 404,
        });
      }
      accountId = target.id;
    } else {
      const currency = (input.currency ?? account.currency ?? "").toUpperCase();
      if (!currency || !isSupportedCurrency(currency)) {
        throw new BankingError(
          "bank_currency_required",
          "Flowly cannot represent this account's currency yet; choose a supported one.",
          { detail: { currency: account.currency } },
        );
      }
      const created: Account = createAccount(
        {
          name: input.name?.trim() || account.providerName || "Bank account",
          type: input.type ?? accountTypeFromCashAccountType(account.cashAccountType),
          defaultCurrency: currency,
          institutionName: link.aspspName,
        },
        { id: this.newId(), now },
      );
      accountId = (await this.vault.accounts.create(created)).id;
    }

    await this.vault.bankAccounts.update(
      { ...account, status: "mapped", accountId, updatedAt: now },
      account.revision,
    );
    return this.summarizeLink(link);
  }

  /** Drops a bank link and its raw payloads; imported transactions stay. */
  async unlink(linkId: string): Promise<{ deletedAccounts: number; deletedPayloads: number }> {
    const link = await this.vault.bankLinks.get(linkId);
    if (!link) {
      throw new BankingError("bank_link_not_found", "That bank link does not exist.", {
        status: 404,
      });
    }
    const deleted = await this.removeLinkData(link);
    return deleted;
  }

  /** Runs a sync and remembers the report for the status endpoint. */
  async runSync(options: { linkId?: string; psu?: PsuHeaders } = {}): Promise<SyncReport> {
    const report = await this.sync.run(options);
    this.lastReport = report;
    return report;
  }

  /**
   * Refreshes every linked bank right after the vault is unlocked. Failures are
   * recorded in the report and never bubble into the unlock response.
   */
  async autoSync(psu: PsuHeaders = {}): Promise<void> {
    const connection = await this.connection();
    if (!connection?.autoSync) return;
    try {
      await this.runSync({ psu });
    } catch {
      // A background refresh must never fail the request that triggered it.
    }
  }

  private syncState(): BankingSyncState {
    return {
      running: this.sync.isRunning,
      ...(this.lastReport
        ? { lastSyncAt: this.lastReport.finishedAt, lastReport: this.lastReport }
        : {}),
    };
  }

  private async requireClient(): Promise<{
    connection: BankConnection;
    client: EnableBankingClient;
  }> {
    const connection = await this.connection();
    if (!connection) {
      throw new BankingError("bank_not_configured", "Connect Enable Banking first, in Settings.", {
        status: 409,
      });
    }
    return { connection, client: this.clientFor(connection) };
  }

  private clientOrThrow(connection: BankConnection): EnableBankingClient {
    try {
      return this.clientFor(connection);
    } catch (error) {
      throw new BankingError("bank_credentials_invalid", "The private key could not be read.", {
        cause: error,
      });
    }
  }

  /** Confirms the key works and describes the application it belongs to. */
  private async verifyApplication(client: EnableBankingClient): Promise<EbApplication> {
    try {
      return await client.getApplication();
    } catch (error) {
      throw new BankingError(
        "bank_credentials_invalid",
        error instanceof Error
          ? `Enable Banking rejected the credentials: ${error.message}`
          : "Enable Banking rejected the credentials.",
        { cause: error },
      );
    }
  }

  private async withProviderErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof BankingError) throw error;
      throw new BankingError(
        "bank_provider_error",
        error instanceof Error ? error.message : "Enable Banking request failed.",
        { status: 502, cause: error },
      );
    }
  }

  private async replaceDiscoveredAccounts(
    link: BankLink,
    accounts: EbAccountResource[],
  ): Promise<void> {
    const existing = await this.vault.bankAccounts.list({ refA: link.id });
    const now = this.clock.nowIso();
    const seen = new Set<string>();
    for (const raw of accounts) {
      const uid = raw.uid as string;
      seen.add(uid);
      const normalized = normalizeAccount(raw, { name: link.aspspName });
      const current = existing.find((entry) => entry.providerAccountUid === uid);
      if (current) {
        await this.vault.bankAccounts.update(
          {
            ...current,
            ...(normalized.iban ? { iban: normalized.iban } : {}),
            ...(normalized.identificationHash
              ? { identificationHash: normalized.identificationHash }
              : {}),
            ...(normalized.providerName ? { providerName: normalized.providerName } : {}),
            ...(normalized.currency ? { currency: normalized.currency } : {}),
            ...(normalized.cashAccountType ? { cashAccountType: normalized.cashAccountType } : {}),
            updatedAt: now,
          },
          current.revision,
        );
        continue;
      }
      await this.vault.bankAccounts.create({
        formatVersion: 1,
        revision: 1,
        id: this.newId(),
        linkId: link.id,
        connectionId: link.connectionId,
        providerAccountUid: uid,
        status: "unmapped",
        createdAt: now,
        updatedAt: now,
        ...(normalized.iban ? { iban: normalized.iban } : {}),
        ...(normalized.identificationHash
          ? { identificationHash: normalized.identificationHash }
          : {}),
        ...(normalized.providerName ? { providerName: normalized.providerName } : {}),
        ...(normalized.currency ? { currency: normalized.currency } : {}),
        ...(normalized.cashAccountType ? { cashAccountType: normalized.cashAccountType } : {}),
      });
    }
  }

  private async removeLinkData(
    link: BankLink,
  ): Promise<{ deletedAccounts: number; deletedPayloads: number }> {
    const accounts = await this.vault.bankAccounts.list({ refA: link.id });
    const payloads = (await this.vault.bankPayloads.list()).filter(
      (payload) => payload.linkId === link.id,
    );
    if (link.sessionId) {
      const connection = await this.connection();
      if (connection) {
        try {
          await this.clientFor(connection).deleteSession(link.sessionId);
        } catch {
          // The consent may already be gone at the bank; local cleanup continues.
        }
      }
    }
    await this.vault.transaction(async () => {
      for (const payload of payloads) {
        await this.vault.bankPayloads.delete(payload.id, payload.revision);
      }
      for (const account of accounts) {
        await this.vault.bankAccounts.delete(account.id, account.revision);
      }
      await this.vault.bankLinks.delete(link.id, link.revision);
    });
    return { deletedAccounts: accounts.length, deletedPayloads: payloads.length };
  }

  private async expireStaleLinks(connection: BankConnection): Promise<void> {
    const links = await this.vault.bankLinks.list({ refA: connection.id });
    const now = this.clock.now().getTime();
    for (const link of links) {
      if (link.status !== "pending") continue;
      if (Date.parse(link.stateExpiresAt) >= now) continue;
      await this.vault.bankLinks.update(
        {
          ...link,
          status: "failed",
          lastSyncError: "The authorization request expired before it was completed.",
        },
        link.revision,
      );
    }
  }

  private async summarizeLinks(connection: BankConnection): Promise<BankLinkSummary[]> {
    const links = await this.vault.bankLinks.list({ refA: connection.id });
    const summaries: BankLinkSummary[] = [];
    for (const link of links) {
      if (link.status === "failed" && link.providerAccountUids.length === 0) continue;
      summaries.push(await this.summarizeLink(link));
    }
    return summaries;
  }

  private async summarizeLink(link: BankLink): Promise<BankLinkSummary> {
    const accounts = await this.vault.bankAccounts.list({ refA: link.id });
    const summaries: BankAccountSummary[] = [];
    for (const account of accounts) {
      const flowlyAccount = account.accountId
        ? await this.vault.accounts.get(account.accountId)
        : undefined;
      const transactionCount = account.accountId
        ? (await this.vault.transactions.list({ refA: account.accountId })).length
        : 0;
      summaries.push({
        id: account.id,
        providerAccountUid: account.providerAccountUid,
        status: account.status,
        transactionCount,
        ...(account.accountId ? { accountId: account.accountId } : {}),
        ...(flowlyAccount ? { accountName: flowlyAccount.name } : {}),
        ...(account.iban ? { iban: account.iban, maskedIban: maskIban(account.iban) } : {}),
        ...(account.providerName ? { providerName: account.providerName } : {}),
        ...(account.currency ? { currency: account.currency } : {}),
        ...(account.cashAccountType ? { cashAccountType: account.cashAccountType } : {}),
        ...(account.lastSyncedAt ? { lastSyncedAt: account.lastSyncedAt } : {}),
        ...(account.lastBalanceMinor !== undefined
          ? { lastBalanceMinor: account.lastBalanceMinor }
          : {}),
        ...(account.lastBalanceCurrency
          ? { lastBalanceCurrency: account.lastBalanceCurrency }
          : {}),
        ...(account.lastBalanceAt ? { lastBalanceAt: account.lastBalanceAt } : {}),
      });
    }
    return {
      id: link.id,
      aspspName: link.aspspName,
      aspspCountry: link.aspspCountry,
      psuType: link.psuType,
      status: link.status,
      createdAt: link.createdAt,
      accounts: summaries,
      ...(link.aspspLogo ? { aspspLogo: link.aspspLogo } : {}),
      ...(link.accessValidUntil ? { accessValidUntil: link.accessValidUntil } : {}),
      ...(link.lastSyncedAt ? { lastSyncedAt: link.lastSyncedAt } : {}),
      ...(link.lastSyncError ? { lastSyncError: link.lastSyncError } : {}),
    };
  }
}

function publicConnection(connection: BankConnection): BankConnectionPublic {
  return {
    id: connection.id,
    provider: connection.provider,
    appId: connection.appId,
    redirectUrl: connection.redirectUrl,
    environment: connection.environment,
    psuType: connection.psuType,
    country: connection.country,
    autoSync: connection.autoSync,
    keyFingerprint: publicKeyFingerprint(connection.privateKeyPem),
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    ...(connection.appName ? { appName: connection.appName } : {}),
  };
}

function summarizeAspsp(aspsp: EbAspsp): AspspSummary {
  const methods: AspspMethodSummary[] = (aspsp.auth_methods ?? []).map((method) => ({
    approach: method.approach,
    psuType: method.psu_type,
    ...(method.name ? { name: method.name } : {}),
    credentials: (method.credentials ?? []).map((credential) => ({
      name: credential.name,
      required: credential.required,
      ...(credential.title ? { title: credential.title } : {}),
      ...(credential.description ? { description: credential.description } : {}),
      ...(credential.template ? { template: credential.template } : {}),
    })),
  }));
  const maximum = aspsp.maximum_consent_validity;
  return {
    name: aspsp.name,
    country: aspsp.country.toUpperCase(),
    beta: aspsp.beta ?? false,
    psuTypes: aspsp.psu_types ?? [],
    methods,
    sandboxUsers: (aspsp.sandbox?.users ?? []).map((user) => ({
      ...(user.username ? { username: user.username } : {}),
      ...(user.password ? { password: user.password } : {}),
      ...(user.otp ? { otp: user.otp } : {}),
    })),
    ...(aspsp.logo ? { logo: aspsp.logo } : {}),
    ...(aspsp.bic ? { bic: aspsp.bic } : {}),
    ...(typeof maximum === "number" && maximum > 0
      ? { maximumConsentDays: Math.floor(maximum / 86_400) }
      : {}),
  };
}

function discoveredAccount(account: BankAccountLink): DiscoveredAccount {
  return {
    providerAccountUid: account.providerAccountUid,
    status: account.status,
    suggestedName: account.providerName ?? "Bank account",
    suggestedType: accountTypeFromCashAccountType(account.cashAccountType),
    ...(account.currency ? { suggestedCurrency: account.currency } : {}),
    ...(account.currency ? { currency: account.currency } : {}),
    ...(account.iban ? { iban: account.iban, maskedIban: maskIban(account.iban) } : {}),
    ...(account.providerName ? { providerName: account.providerName } : {}),
    ...(account.cashAccountType ? { cashAccountType: account.cashAccountType } : {}),
  };
}

function validateConnectionInput(connection: BankConnection): void {
  try {
    validateBankConnection(connection);
  } catch (error) {
    throw new BankingError(
      "bank_config_invalid",
      error instanceof Error ? error.message : "The configuration is invalid.",
      { cause: error },
    );
  }
  if (!isBankPsuType(connection.psuType)) {
    throw new BankingError("bank_config_invalid", "Choose a personal or business account.");
  }
  if (!isCountryCode(connection.country)) {
    throw new BankingError("bank_config_invalid", "Choose a two-letter country code.");
  }
  if (!/^https?:\/\//i.test(connection.redirectUrl)) {
    throw new BankingError("bank_config_invalid", "The callback URL must be an http(s) URL.");
  }
}

/** Trims stray whitespace and newlines from a pasted or uploaded PEM file. */
export function normalizePem(value: string): string {
  const trimmed = value.replace(/\r\n/g, "\n").trim();
  return `${trimmed}\n`;
}

function consentValidUntil(now: number, maximumSeconds: number | undefined): number {
  const target = now + BANK_CONSENT_TARGET_DAYS * 86_400_000;
  if (!maximumSeconds || maximumSeconds <= 0) return target;
  return Math.min(target, now + maximumSeconds * 1000);
}
