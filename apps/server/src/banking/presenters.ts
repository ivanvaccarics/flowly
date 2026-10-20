import type {
  AspspSummary,
  BankingAuthorizationResult,
  BankingConnectionPublic,
} from "@flowly/web-contracts";
import type { Transaction } from "../domain/transaction.js";
import {
  BANK_CONSENT_TARGET_DAYS,
  type BankAccountLink,
  type BankConnection,
} from "../domain/banking.js";
import type { EbAspsp, EbTransaction } from "./enable-banking-types.js";
import { publicKeyFingerprint } from "./jwt.js";
import { accountTypeFromCashAccountType, maskIban, normalizeTransaction } from "./normalize.js";

type AspspMethodSummary = AspspSummary["methods"][number];
type DiscoveredAccount = BankingAuthorizationResult["accounts"][number];

/** The provider's own id for a raw transaction, whichever field carries it. */
export function rawTransactionProviderId(raw: EbTransaction): string | undefined {
  const candidates = [raw.entry_reference, raw.transaction_id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim() !== "") return candidate.trim();
  }
  return undefined;
}

/** Last resort match: the same normalised date, amount and currency. */
export function matchesTransaction(raw: EbTransaction, transaction: Transaction): boolean {
  const normalized = normalizeTransaction(raw);
  if (!normalized.ok) return false;
  return (
    normalized.bookingDate === transaction.bookingDate &&
    normalized.amountMinor === transaction.amountMinor &&
    normalized.currency === transaction.currency
  );
}

export function presentPublicConnection(connection: BankConnection): BankingConnectionPublic {
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

export function presentAspsp(aspsp: EbAspsp): AspspSummary {
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

export function presentDiscoveredAccount(account: BankAccountLink): DiscoveredAccount {
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

/** Trims stray whitespace and newlines from a pasted or uploaded PEM file. */
export function normalizePem(value: string): string {
  const trimmed = value.replace(/\r\n/g, "\n").trim();
  return `${trimmed}\n`;
}

export function consentDeadline(now: number, maximumSeconds: number | undefined): number {
  const target = now + BANK_CONSENT_TARGET_DAYS * 86_400_000;
  if (!maximumSeconds || maximumSeconds <= 0) return target;
  return Math.min(target, now + maximumSeconds * 1000);
}
