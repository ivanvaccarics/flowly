export type DomainErrorCode =
  | "unsupported-currency"
  | "invalid-amount"
  | "invalid-value"
  | "invalid-tagging-rule"
  | "invalid-transaction"
  | "invalid-account"
  | "invalid-budget"
  | "invalid-recurring-rule";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: DomainErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}
