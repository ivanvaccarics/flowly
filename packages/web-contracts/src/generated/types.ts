/* eslint-disable */
/**
 * GENERATED FILE — do not edit by hand.
 * Source: contracts/schemas/*.schema.json
 * Regenerate with: pnpm contracts:generate
 */

/**
 * A financial account. Format version 1 of the Server MVP.
 */
export interface Account {
  formatVersion: 1;
  revision: number;
  id: string;
  name: string;
  type: "checking" | "savings" | "credit-card" | "cash" | "wallet" | "investment" | "other";
  defaultCurrency: string;
  institutionName?: string;
  openingBalanceMinor?: number;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Checksum manifest of a complete portable archive (export format version 1).
 */
export interface ArchiveManifest {
  formatVersion: 1;
  createdAt: string;
  vaultId: string;
  /**
   * @minItems 1
   */
  entries: [
    {
      name: string;
      bytes: number;
      sha256: string;
    },
    ...{
      name: string;
      bytes: number;
      sha256: string;
    }[]
  ];
}

export interface Budget {
  formatVersion: 1;
  revision: number;
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  period: "weekly" | "monthly" | "quarterly" | "yearly" | "custom";
  startDate: string;
  endDate?: string;
  accountIds?: string[];
  tagIds?: string[];
  rollover: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Calendar-aware recurring transaction template. Occurrence generation is delivered in Phase 7.
 */
export interface RecurringRule {
  formatVersion: 1;
  revision: number;
  id: string;
  name: string;
  template: {
    accountId: string;
    amountMinor: number;
    currency: string;
    payee?: string;
    userNote?: string;
    tagIds?: string[];
  };
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  startDate: string;
  endDate?: string;
  nextDueDate?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tags match case-insensitively; `name` preserves the casing the user typed.
 */
export interface Tag {
  formatVersion: 1;
  revision: number;
  id: string;
  name: string;
  normalizedName: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export type Condition = {
  field: "userNote" | "description" | "payee" | "amountMinor" | "accountId";
  operator: "contains" | "is" | "greaterThan" | "lessThan" | "equals";
  value: string | number;
  currency?: string;
} & Condition1 & {
    field: "userNote" | "description" | "payee" | "amountMinor" | "accountId";
    operator: "contains" | "is" | "greaterThan" | "lessThan" | "equals";
    value: string | number;
    currency?: string;
  } & Condition1;
export type Condition1 =
  | {
      field?: "userNote";
      operator?: "contains";
      value?: string;
      [k: string]: unknown;
    }
  | {
      field?: "description";
      operator?: "contains";
      value?: string;
      [k: string]: unknown;
    }
  | {
      field?: "payee";
      operator?: "is" | "contains";
      value?: string;
      [k: string]: unknown;
    }
  | {
      field?: "amountMinor";
      operator?: "greaterThan" | "lessThan" | "equals";
      value?: number;
      currency: string;
      [k: string]: unknown;
    }
  | {
      field?: "accountId";
      operator?: "is";
      value?: string;
      [k: string]: unknown;
    };

/**
 * User-authored rule that adds tags to matching transactions. Conditions in one rule join with a single AND or OR. Amount conditions must also carry a `currency`, which the domain validator enforces.
 */
export interface TaggingRule {
  formatVersion: 1;
  revision: number;
  id: string;
  name: string;
  enabled: boolean;
  combinator: "and" | "or";
  /**
   * @minItems 1
   * @maxItems 25
   */
  conditions: [Condition, ...Condition[]];
  /**
   * @minItems 1
   * @maxItems 25
   */
  tagIds: [string, ...string[]];
  createdAt: string;
  updatedAt: string;
}

/**
 * A transaction. `amountMinor` is signed: inflows positive, outflows negative.
 */
export interface Transaction {
  formatVersion: 1;
  revision: number;
  id: string;
  accountId: string;
  bookingDate: string;
  valueDate?: string;
  amountMinor: number;
  currency: string;
  originalAmountMinor?: number;
  originalCurrency?: string;
  payee?: string;
  description?: string;
  userNote?: string;
  status: "pending" | "booked";
  source: "manual" | "csv-import" | "recurring-rule" | "enable-banking";
  /**
   * @maxItems 100
   */
  tagIds: string[];
  provider?: string;
  providerAccountId?: string;
  providerTransactionId?: string;
  importFingerprint?: string;
  recurringRuleId?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * What the web UI knows about the vault before it is unlocked. It never carries keys, passphrases or financial data.
 */
export interface VaultStatus {
  state: "locked" | "unlocked";
  vaultFormatVersion: number;
  exportFormatVersion: number;
  storageEngine?: "sqlcipher" | "record-encryption" | null;
  schemaVersion?: number | null;
  lastUnlockedAt?: string | null;
}
