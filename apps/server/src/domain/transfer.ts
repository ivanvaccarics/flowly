import { DomainError } from "./errors.js";
import { assertIsoDateTime, assertRevision, assertUuid } from "./values.js";

export const TRANSFER_LINK_FORMAT_VERSION = 1;

/**
 * How a pair was recognised, strongest first. The order is the weight the
 * matching uses: a pair the two banks corroborated by naming each other's
 * account is worth more than one that only matched on amount and date.
 */
export const TRANSFER_METHODS = ["iban", "counterparty", "amount"] as const;
export type TransferMethod = (typeof TRANSFER_METHODS)[number];

/**
 * One recognised transfer: the two ledger rows that are the same money seen
 * from both sides, how the pairing knew, and how sure it is. The link is the
 * provenance the transfer flag itself cannot carry — the flag is a single
 * boolean on each row, and the row does not say who paired it.
 */
export interface TransferLink {
  formatVersion: 1;
  revision: number;
  id: string;
  /** The leg that leaves an account (`amountMinor < 0`). */
  outgoingTransactionId: string;
  /** The leg that arrives on another account (`amountMinor > 0`). */
  incomingTransactionId: string;
  method: TransferMethod;
  /** Evidence score the matching ranked this pair by; higher is better. */
  confidence: number;
  /** Whole days between the two booking dates. */
  gapDays: number;
  createdAt: string;
  updatedAt: string;
}

export function validateTransferLink(link: TransferLink): void {
  if (link.formatVersion !== TRANSFER_LINK_FORMAT_VERSION) {
    throw new DomainError(
      "invalid-transfer-link",
      `transfer link formatVersion must be ${TRANSFER_LINK_FORMAT_VERSION}`,
    );
  }
  assertRevision(link.revision, "transferLink.revision");
  assertUuid(link.id, "transferLink.id");
  assertUuid(link.outgoingTransactionId, "transferLink.outgoingTransactionId");
  assertUuid(link.incomingTransactionId, "transferLink.incomingTransactionId");
  if (link.outgoingTransactionId === link.incomingTransactionId) {
    throw new DomainError("invalid-transfer-link", "a transfer link needs two different movements");
  }
  if (!TRANSFER_METHODS.includes(link.method)) {
    throw new DomainError("invalid-transfer-link", `unsupported method: ${link.method}`, {
      method: link.method,
    });
  }
  if (!Number.isSafeInteger(link.confidence) || link.confidence < 1) {
    throw new DomainError(
      "invalid-transfer-link",
      "transferLink.confidence must be a positive integer",
    );
  }
  if (!Number.isSafeInteger(link.gapDays) || link.gapDays < 0) {
    throw new DomainError(
      "invalid-transfer-link",
      "transferLink.gapDays must be a whole number of days",
    );
  }
  assertIsoDateTime(link.createdAt, "transferLink.createdAt");
  assertIsoDateTime(link.updatedAt, "transferLink.updatedAt");
}

export interface NewTransferLink {
  outgoingTransactionId: string;
  incomingTransactionId: string;
  method: TransferMethod;
  confidence: number;
  gapDays: number;
}

export function createTransferLink(
  input: NewTransferLink,
  deps: { id: string; now: string },
): TransferLink {
  const link: TransferLink = {
    formatVersion: TRANSFER_LINK_FORMAT_VERSION,
    revision: 1,
    id: deps.id,
    outgoingTransactionId: input.outgoingTransactionId,
    incomingTransactionId: input.incomingTransactionId,
    method: input.method,
    confidence: input.confidence,
    gapDays: input.gapDays,
    createdAt: deps.now,
    updatedAt: deps.now,
  };
  validateTransferLink(link);
  return link;
}
