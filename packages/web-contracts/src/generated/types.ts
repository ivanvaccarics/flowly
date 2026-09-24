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

/**
 * Dashboard view computed from the vault. Totals always carry a currency code and never blend currencies. A caller may narrow it with `months=YYYY-MM,…` and `tags=<id>,<id>`: the flows, the buckets and the recent movements then cover exactly those months and those tags, while `balances` stays the account balances and `spendingByTag` keeps describing every tag in the period, so one the reader switched off can be switched back on.
 */
export interface Dashboard {
  range: {
    from: string;
    to: string;
  };
  generatedAt: string;
  balances: {
    accountId: string;
    accountName: string;
    currency: string;
    balanceMinor: number;
    isDefaultCurrency: boolean;
    transactionCount: number;
  }[];
  cashFlow: {
    currency: string;
    incomeMinor: number;
    expensesMinor: number;
    netMinor: number;
    transactionCount: number;
  }[];
  /**
   * Income and expenses split into calendar buckets — one month per selected month when the caller scoped the dashboard by months, one week otherwise — so the dashboard charts the period without blending currencies.
   */
  cashFlowBuckets: {
    currency: string;
    label: string;
    from: string;
    to: string;
    incomeMinor: number;
    expensesMinor: number;
  }[];
  spendingByTag: {
    tagId: string;
    tagName: string;
    currency: string;
    spentMinor: number;
    transactionCount: number;
  }[];
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

/**
 * User-authored rule, of one of two kinds. A `match` rule adds tags to the movements that satisfy its conditions; a `transfer-pair` rule recognises the two legs of one transfer between the user's own accounts — one leg leaving an account, one arriving on another, with opposite amounts that the rule never writes down — and marks both as transfers. Conditions in one condition set join with a single AND or OR. An `amount` condition carries a canonical decimal string in its own `currency` (`-5.10` means an outflow of 5.10), not a count of minor units, and only matches transactions in that currency.
 */
export type TaggingRule = {
  formatVersion: 3;
  revision: number;
  id: string;
  name: string;
  enabled: boolean;
  kind: "match" | "transfer-pair";
  combinator?: "and" | "or";
  /**
   * @minItems 1
   * @maxItems 25
   */
  conditions?: [Condition, ...Condition[]];
  /**
   * @maxItems 25
   */
  tagIds: string[];
  outgoing?: ConditionSet;
  incoming?: ConditionSet;
  windowDays?: number;
  createdAt: string;
  updatedAt: string;
};
export type Condition = {
  field: "userNote" | "description" | "payee" | "amount" | "accountId";
  operator: "contains" | "is" | "greaterThan" | "lessThan" | "equals";
  value: string | number;
  currency?: string;
} & Condition1 & {
    field: "userNote" | "description" | "payee" | "amount" | "accountId";
    operator: "contains" | "is" | "greaterThan" | "lessThan" | "equals";
    value: string | number;
    currency?: string;
  } & Condition1 & {
    field: "userNote" | "description" | "payee" | "amount" | "accountId";
    operator: "contains" | "is" | "greaterThan" | "lessThan" | "equals";
    value: string | number;
    currency?: string;
  } & Condition1 & {
    field: "userNote" | "description" | "payee" | "amount" | "accountId";
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
      field?: "amount";
      operator?: "greaterThan" | "lessThan" | "equals";
      value?: string;
      currency: string;
      [k: string]: unknown;
    }
  | {
      field?: "accountId";
      operator?: "is";
      value?: string;
      [k: string]: unknown;
    };

export interface ConditionSet {
  combinator: "and" | "or";
  /**
   * @minItems 1
   * @maxItems 25
   */
  conditions: [Condition, ...Condition[]];
}

/**
 * A transaction. `amountMinor` is signed: inflows positive, outflows negative. `transfer` marks a movement that only moves money between the user's own accounts: absent means undecided, a boolean is the user's decision, and `true` keeps the row out of income, expenses and spending.
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
  source: "manual" | "csv-import" | "enable-banking";
  /**
   * @maxItems 100
   */
  tagIds: string[];
  provider?: string;
  providerAccountId?: string;
  providerTransactionId?: string;
  importFingerprint?: string;
  transfer?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * What the web UI knows about the vault before it is unlocked. It never carries keys, passphrases or financial data.
 */
export interface VaultStatus {
  state: "locked" | "unlocked";
  /**
   * False on a fresh deployment, so the client can offer to create the vault.
   */
  vaultExists: boolean;
  /**
   * Public vault identifier shown in the UI; null when no vault exists yet.
   */
  vaultId: string | null;
  vaultFormatVersion: number;
  exportFormatVersion: number;
  storageEngine?: "sqlcipher" | "record-encryption" | null;
  schemaVersion?: number | null;
  lastUnlockedAt?: string | null;
}
