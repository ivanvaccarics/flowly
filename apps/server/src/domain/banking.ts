import { DomainError } from "./errors.js";
import {
  assertIsoDate,
  assertIsoDateTime,
  assertRevision,
  assertText,
  assertUuid,
  assertUuidList,
  isCurrencyCode,
  isIsoDate,
} from "./values.js";

export const BANK_PROVIDER = "enable-banking" as const;
export type BankProvider = typeof BANK_PROVIDER;

export type BankEnvironment = "SANDBOX" | "PRODUCTION";
export const BANK_ENVIRONMENTS: readonly BankEnvironment[] = ["SANDBOX", "PRODUCTION"];

export type BankPsuType = "personal" | "business";
export const BANK_PSU_TYPES: readonly BankPsuType[] = ["personal", "business"];

/** Longest consent we ask for; the ASPSP maximum shortens it when lower. */
export const BANK_CONSENT_TARGET_DAYS = 90;
/** How far back the first sync looks when nothing has been fetched yet. */
export const BANK_INITIAL_SYNC_DAYS = 90;
/** Overlap re-read on every sync so pending-to-booked changes are reconciled. */
export const BANK_SYNC_OVERLAP_DAYS = 7;

const IBAN_PATTERN = /^[A-Z]{2}[0-9A-Z]{11,32}$/;
const PRIVATE_KEY_PATTERN = /-----BEGIN (?:RSA )?PRIVATE KEY-----/;
const HTTP_URL_PATTERN = /^https?:\/\/[^\s]+$/i;
const COUNTRY_PATTERN = /^[A-Z]{2}$/;

export interface BankConnection {
  formatVersion: 1;
  revision: number;
  id: string;
  provider: BankProvider;
  /** Enable Banking application id, also used as the JWT `kid`. */
  appId: string;
  /** RSA private key in PEM form. Stored only inside the encrypted vault. */
  privateKeyPem: string;
  redirectUrl: string;
  environment: BankEnvironment;
  psuType: BankPsuType;
  /** Default ISO 3166 country used when listing ASPSPs. */
  country: string;
  /** Refresh provider data as soon as the vault is unlocked. */
  autoSync: boolean;
  appName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BankConnectionPublic {
  id: string;
  provider: BankProvider;
  appId: string;
  redirectUrl: string;
  environment: BankEnvironment;
  psuType: BankPsuType;
  country: string;
  autoSync: boolean;
  appName?: string;
  keyFingerprint: string;
  createdAt: string;
  updatedAt: string;
}

export function isBankEnvironment(value: unknown): value is BankEnvironment {
  return typeof value === "string" && BANK_ENVIRONMENTS.includes(value as BankEnvironment);
}

export function isBankPsuType(value: unknown): value is BankPsuType {
  return typeof value === "string" && BANK_PSU_TYPES.includes(value as BankPsuType);
}

export function isCountryCode(value: unknown): value is string {
  return typeof value === "string" && COUNTRY_PATTERN.test(value);
}

export function validateBankConnection(connection: BankConnection): void {
  if (connection.formatVersion !== 1) {
    throw new DomainError("invalid-value", "bank connection formatVersion must be 1");
  }
  assertRevision(connection.revision, "bankConnection.revision");
  assertUuid(connection.id, "bankConnection.id");
  if (connection.provider !== BANK_PROVIDER) {
    throw new DomainError("invalid-value", `unsupported bank provider: ${connection.provider}`);
  }
  assertUuid(connection.appId, "bankConnection.appId");
  if (!PRIVATE_KEY_PATTERN.test(connection.privateKeyPem)) {
    throw new DomainError(
      "invalid-value",
      "bankConnection.privateKeyPem must be a PEM private key",
    );
  }
  if (!HTTP_URL_PATTERN.test(connection.redirectUrl)) {
    throw new DomainError("invalid-value", "bankConnection.redirectUrl must be an http(s) URL", {
      redirectUrl: connection.redirectUrl,
    });
  }
  if (!isBankEnvironment(connection.environment)) {
    throw new DomainError(
      "invalid-value",
      `unsupported bank environment: ${connection.environment}`,
    );
  }
  if (!isBankPsuType(connection.psuType)) {
    throw new DomainError("invalid-value", `unsupported PSU type: ${connection.psuType}`);
  }
  if (!isCountryCode(connection.country)) {
    throw new DomainError("invalid-value", "bankConnection.country must be an ISO 3166 code", {
      country: connection.country,
    });
  }
  if (typeof connection.autoSync !== "boolean") {
    throw new DomainError("invalid-value", "bankConnection.autoSync must be a boolean");
  }
  if (connection.appName !== undefined) {
    assertText(connection.appName, "bankConnection.appName", { max: 120, optional: true });
  }
  assertIsoDateTime(connection.createdAt, "bankConnection.createdAt");
  assertIsoDateTime(connection.updatedAt, "bankConnection.updatedAt");
}

export type BankLinkStatus = "pending" | "authorized" | "expired" | "revoked" | "failed" | "closed";

export const BANK_LINK_STATUSES: readonly BankLinkStatus[] = [
  "pending",
  "authorized",
  "expired",
  "revoked",
  "failed",
  "closed",
];

export interface BankLink {
  formatVersion: 1;
  revision: number;
  id: string;
  connectionId: string;
  provider: BankProvider;
  aspspName: string;
  aspspCountry: string;
  aspspLogo?: string;
  psuType: BankPsuType;
  /** Single-use OAuth state, checked when the bank redirects the PSU back. */
  state: string;
  stateExpiresAt: string;
  authorizationId?: string;
  sessionId?: string;
  status: BankLinkStatus;
  accessValidUntil?: string;
  providerAccountUids: string[];
  lastSyncedAt?: string;
  lastSyncError?: string;
  createdAt: string;
  updatedAt: string;
}

export function validateBankLink(link: BankLink): void {
  if (link.formatVersion !== 1) {
    throw new DomainError("invalid-value", "bank link formatVersion must be 1");
  }
  assertRevision(link.revision, "bankLink.revision");
  assertUuid(link.id, "bankLink.id");
  assertUuid(link.connectionId, "bankLink.connectionId");
  if (link.provider !== BANK_PROVIDER) {
    throw new DomainError("invalid-value", `unsupported bank provider: ${link.provider}`);
  }
  assertText(link.aspspName, "bankLink.aspspName", { max: 120 });
  if (!isCountryCode(link.aspspCountry)) {
    throw new DomainError("invalid-value", "bankLink.aspspCountry must be an ISO 3166 code");
  }
  if (link.aspspLogo !== undefined) {
    assertText(link.aspspLogo, "bankLink.aspspLogo", { max: 500, optional: true });
  }
  if (!isBankPsuType(link.psuType)) {
    throw new DomainError("invalid-value", `unsupported PSU type: ${link.psuType}`);
  }
  assertText(link.state, "bankLink.state", { max: 200 });
  assertIsoDateTime(link.stateExpiresAt, "bankLink.stateExpiresAt");
  if (link.authorizationId !== undefined) {
    assertText(link.authorizationId, "bankLink.authorizationId", { max: 200, optional: true });
  }
  if (link.sessionId !== undefined) {
    assertText(link.sessionId, "bankLink.sessionId", { max: 200, optional: true });
  }
  if (!BANK_LINK_STATUSES.includes(link.status)) {
    throw new DomainError("invalid-value", `unsupported bank link status: ${link.status}`);
  }
  if (link.accessValidUntil !== undefined) {
    assertIsoDateTime(link.accessValidUntil, "bankLink.accessValidUntil");
  }
  assertUuidList(link.providerAccountUids, "bankLink.providerAccountUids", 200);
  if (link.lastSyncedAt !== undefined) {
    assertIsoDateTime(link.lastSyncedAt, "bankLink.lastSyncedAt");
  }
  if (link.lastSyncError !== undefined) {
    assertText(link.lastSyncError, "bankLink.lastSyncError", { max: 300, optional: true });
  }
  assertIsoDateTime(link.createdAt, "bankLink.createdAt");
  assertIsoDateTime(link.updatedAt, "bankLink.updatedAt");
}

export type BankAccountStatus = "unmapped" | "mapped" | "ignored";
export const BANK_ACCOUNT_STATUSES: readonly BankAccountStatus[] = [
  "unmapped",
  "mapped",
  "ignored",
];

/**
 * A provider account discovered in a bank session, plus the Flowly account it
 * feeds. Accounts start `unmapped` until the user creates or picks a Flowly
 * account, and `ignored` accounts are never synced.
 */
export interface BankAccountLink {
  formatVersion: 1;
  revision: number;
  id: string;
  linkId: string;
  connectionId: string;
  providerAccountUid: string;
  identificationHash?: string;
  iban?: string;
  providerName?: string;
  currency?: string;
  cashAccountType?: string;
  status: BankAccountStatus;
  /** Flowly account receiving this provider account's transactions. */
  accountId?: string;
  /** Oldest booking date already fetched, used as the next sync lower bound. */
  syncFrom?: string;
  lastSyncedAt?: string;
  lastBalanceMinor?: number;
  lastBalanceCurrency?: string;
  lastBalanceAt?: string;
  createdAt: string;
  updatedAt: string;
}

export function validateBankAccountLink(link: BankAccountLink): void {
  if (link.formatVersion !== 1) {
    throw new DomainError("invalid-value", "bank account link formatVersion must be 1");
  }
  assertRevision(link.revision, "bankAccountLink.revision");
  assertUuid(link.id, "bankAccountLink.id");
  assertUuid(link.linkId, "bankAccountLink.linkId");
  assertUuid(link.connectionId, "bankAccountLink.connectionId");
  assertText(link.providerAccountUid, "bankAccountLink.providerAccountUid", { max: 200 });
  if (!BANK_ACCOUNT_STATUSES.includes(link.status)) {
    throw new DomainError("invalid-value", `unsupported bank account status: ${link.status}`);
  }
  if (link.status === "mapped") {
    if (link.accountId === undefined) {
      throw new DomainError("invalid-value", "a mapped bank account needs an accountId");
    }
    assertUuid(link.accountId, "bankAccountLink.accountId");
  } else if (link.accountId !== undefined) {
    assertUuid(link.accountId, "bankAccountLink.accountId");
  }
  if (link.identificationHash !== undefined) {
    assertText(link.identificationHash, "bankAccountLink.identificationHash", {
      max: 500,
      optional: true,
    });
  }
  if (link.iban !== undefined && !IBAN_PATTERN.test(link.iban)) {
    throw new DomainError("invalid-value", "bankAccountLink.iban is not a valid IBAN", {
      iban: link.iban,
    });
  }
  if (link.providerName !== undefined) {
    assertText(link.providerName, "bankAccountLink.providerName", { max: 200, optional: true });
  }
  if (link.currency !== undefined && !isCurrencyCode(link.currency)) {
    throw new DomainError("invalid-value", "bankAccountLink.currency must be an ISO 4217 code");
  }
  if (link.cashAccountType !== undefined) {
    assertText(link.cashAccountType, "bankAccountLink.cashAccountType", {
      max: 20,
      optional: true,
    });
  }
  if (link.syncFrom !== undefined) assertIsoDate(link.syncFrom, "bankAccountLink.syncFrom");
  if (link.lastSyncedAt !== undefined) {
    assertIsoDateTime(link.lastSyncedAt, "bankAccountLink.lastSyncedAt");
  }
  if (link.lastBalanceMinor !== undefined) {
    if (!Number.isSafeInteger(link.lastBalanceMinor)) {
      throw new DomainError("invalid-value", "bankAccountLink.lastBalanceMinor must be an integer");
    }
    if (!isCurrencyCode(link.lastBalanceCurrency)) {
      throw new DomainError(
        "invalid-value",
        "bankAccountLink.lastBalanceCurrency is required with lastBalanceMinor",
      );
    }
  }
  if (link.lastBalanceCurrency !== undefined && !isCurrencyCode(link.lastBalanceCurrency)) {
    throw new DomainError("invalid-value", "bankAccountLink.lastBalanceCurrency must be ISO 4217");
  }
  if (link.lastBalanceAt !== undefined) {
    assertIsoDateTime(link.lastBalanceAt, "bankAccountLink.lastBalanceAt");
  }
  assertIsoDateTime(link.createdAt, "bankAccountLink.createdAt");
  assertIsoDateTime(link.updatedAt, "bankAccountLink.updatedAt");
}

export type BankPayloadKind = "session" | "account" | "balances" | "transactions";

export const BANK_PAYLOAD_KINDS: readonly BankPayloadKind[] = [
  "session",
  "account",
  "balances",
  "transactions",
];

/**
 * One raw Enable Banking response, stored per account so a refresh can be
 * replayed or audited without calling the provider again. This is the `row_json`
 * store: the provider JSON is kept untouched under `json`.
 */
export interface BankPayload {
  formatVersion: 1;
  revision: number;
  id: string;
  connectionId: string;
  linkId: string;
  providerAccountUid: string;
  providerAccountId?: string;
  kind: BankPayloadKind;
  fetchedAt: string;
  requestFrom?: string;
  requestTo?: string;
  json: unknown;
  createdAt: string;
  updatedAt: string;
}

export function validateBankPayload(payload: BankPayload): void {
  if (payload.formatVersion !== 1) {
    throw new DomainError("invalid-value", "bank payload formatVersion must be 1");
  }
  assertRevision(payload.revision, "bankPayload.revision");
  assertUuid(payload.id, "bankPayload.id");
  assertUuid(payload.connectionId, "bankPayload.connectionId");
  assertUuid(payload.linkId, "bankPayload.linkId");
  assertText(payload.providerAccountUid, "bankPayload.providerAccountUid", { max: 200 });
  if (payload.providerAccountId !== undefined) {
    assertText(payload.providerAccountId, "bankPayload.providerAccountId", {
      max: 200,
      optional: true,
    });
  }
  if (!BANK_PAYLOAD_KINDS.includes(payload.kind)) {
    throw new DomainError("invalid-value", `unsupported bank payload kind: ${payload.kind}`);
  }
  assertIsoDateTime(payload.fetchedAt, "bankPayload.fetchedAt");
  if (payload.requestFrom !== undefined && !isIsoDate(payload.requestFrom)) {
    throw new DomainError("invalid-value", "bankPayload.requestFrom must be an ISO date");
  }
  if (payload.requestTo !== undefined && !isIsoDate(payload.requestTo)) {
    throw new DomainError("invalid-value", "bankPayload.requestTo must be an ISO date");
  }
  if (payload.json === undefined) {
    throw new DomainError("invalid-value", "bankPayload.json is required");
  }
  assertIsoDateTime(payload.createdAt, "bankPayload.createdAt");
  assertIsoDateTime(payload.updatedAt, "bankPayload.updatedAt");
}

export function isBankAccountUid(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}
