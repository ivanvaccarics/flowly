/**
 * The subset of the Enable Banking API responses Flowly reads.
 *
 * Responses are also stored verbatim in `bank_payloads`, so these types only
 * cover the fields that get normalized; everything else stays untouched in the
 * raw JSON. Field names mirror the documented snake_case API, and the
 * normalizer additionally tolerates the camelCase aliases seen in older
 * exported payloads.
 */

export type EbPsuType = "personal" | "business";
export type EbEnvironment = "SANDBOX" | "PRODUCTION";

export interface EbApplication {
  name: string;
  description?: string | null;
  kid: string;
  environment: EbEnvironment;
  redirect_urls: string[];
  active: boolean;
  countries: string[];
  services: string[];
}

export interface EbCredential {
  name: string;
  title?: string | null;
  required: boolean;
  description?: string | null;
  template?: string | null;
}

export interface EbAuthMethod {
  name?: string | null;
  title?: string | null;
  psu_type: EbPsuType;
  credentials?: EbCredential[] | null;
  approach: string;
  hidden_method?: boolean;
}

export interface EbSandboxUser {
  username?: string | null;
  password?: string | null;
  otp?: string | null;
}

export interface EbAspsp {
  name: string;
  country: string;
  logo?: string | null;
  psu_types: EbPsuType[];
  auth_methods?: EbAuthMethod[] | null;
  maximum_consent_validity?: number | null;
  beta?: boolean;
  bic?: string | null;
  sandbox?: { users?: EbSandboxUser[] | null } | null;
  group?: { name?: string | null; logo?: string | null } | null;
}

export interface EbAmount {
  currency: string;
  amount: string;
}

export interface EbGenericIdentification {
  identification: string;
  scheme_name?: string | null;
  issuer?: string | null;
}

export interface EbAccountIdentification {
  iban?: string | null;
  other?: EbGenericIdentification | null;
}

export interface EbAccountServicer {
  name?: string | null;
  bic_fi?: string | null;
  clearing_system_member_id?: {
    clearing_system_id?: string | null;
    member_id?: number | string | null;
  } | null;
}

export interface EbAccountResource {
  account_id?: EbAccountIdentification | null;
  all_account_ids?: EbGenericIdentification[] | null;
  account_servicer?: EbAccountServicer | null;
  name?: string | null;
  details?: string | null;
  usage?: string | null;
  cash_account_type?: string | null;
  product?: string | null;
  currency?: string | null;
  psu_status?: string | null;
  credit_limit?: EbAmount | null;
  legal_age?: boolean | null;
  postal_address?: unknown;
  uid?: string | null;
  identification_hash?: string | null;
  identification_hashes?: string[] | null;
}

export interface EbBalance {
  name?: string | null;
  balance_amount?: EbAmount | null;
  balance_type?: string | null;
  last_change_date_time?: string | null;
  reference_date?: string | null;
  last_committed_transaction?: string | null;
}

export interface EbParty {
  name?: string | null;
}

export interface EbBankTransactionCode {
  description?: string | null;
  code?: string | null;
  sub_code?: string | null;
}

export interface EbTransaction {
  entry_reference?: string | null;
  merchant_category_code?: string | null;
  transaction_amount?: EbAmount | null;
  creditor?: EbParty | null;
  creditor_account?: EbAccountIdentification | null;
  debtor?: EbParty | null;
  debtor_account?: EbAccountIdentification | null;
  bank_transaction_code?: EbBankTransactionCode | null;
  credit_debit_indicator?: string | null;
  status?: string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  balance_after_transaction?: EbAmount | null;
  reference_number?: string | null;
  remittance_information?: string[] | null;
  debtor_account_additional_identification?: EbGenericIdentification[] | null;
  creditor_account_additional_identification?: EbGenericIdentification[] | null;
  note?: string | null;
  transaction_id?: string | null;
  /** Aliases found in previously exported payloads. */
  transactionAmount?: EbAmount | null;
  bookingDate?: string | null;
  valueDate?: string | null;
  creditDebitIndicator?: string | null;
}

export interface EbSessionAccount {
  uid: string;
  identification_hash?: string | null;
  identification_hashes?: string[] | null;
}

export interface EbAccess {
  valid_until?: string | null;
}

/** Response of `POST /sessions`: the newly authorized session. */
export interface EbAuthorizeSessionResponse {
  session_id?: string | null;
  accounts?: EbAccountResource[] | null;
  aspsp?: { name: string; country: string } | null;
  psu_type?: EbPsuType | null;
  access?: EbAccess | null;
}

/** Response of `GET /sessions/{id}`: session status with account uids. */
export interface EbSession {
  session_id?: string | null;
  status?: string | null;
  accounts?: string[] | null;
  accounts_data?: EbSessionAccount[] | null;
  aspsp?: { name: string; country: string } | null;
  psu_type?: EbPsuType | null;
  access?: EbAccess | null;
  created?: string | null;
  authorized?: string | null;
  closed?: string | null;
}

export interface EbStartAuthorizationResponse {
  url: string;
  authorization_id: string;
  psu_id_hash?: string | null;
}

export interface EbErrorBody {
  message?: string;
  code?: number;
  error?: string;
  detail?: unknown;
}
