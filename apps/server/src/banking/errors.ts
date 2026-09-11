export type BankingErrorCode =
  | "bank_not_configured"
  | "bank_config_invalid"
  | "bank_credentials_invalid"
  | "bank_redirect_not_registered"
  | "bank_environment_mismatch"
  | "bank_application_inactive"
  | "bank_state_invalid"
  | "bank_link_not_found"
  | "bank_account_not_found"
  | "bank_account_not_mapped"
  | "bank_account_exists"
  | "bank_currency_required"
  | "bank_provider_error";

/** A user-correctable failure of the Enable Banking integration. */
export class BankingError extends Error {
  readonly code: BankingErrorCode;
  readonly status: number;
  readonly detail?: unknown;

  constructor(
    code: BankingErrorCode,
    message: string,
    options: { status?: number; detail?: unknown; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "BankingError";
    this.code = code;
    this.status = options.status ?? 400;
    if (options.detail !== undefined) this.detail = options.detail;
  }
}
