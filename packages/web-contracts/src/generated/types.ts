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
 * The expense detail view computed from the vault for one period. Like the dashboard it is scoped by `months=YYYY-MM,…` and never blends currencies: `currency` is the one the period leans on most, every amount below is in its minor units, and the currencies left out are named in `otherCurrencies`. A caller that asks for no month set gets the contiguous `from`/`to` range instead, and `daily[].selected` is then true for every day.
 */
export interface ExpenseDetails {
  range: {
    from: string;
    to: string;
  };
  generatedAt: string;
  /**
   * The currency the period spends most in, or null when the period holds no booked outflow at all.
   */
  currency: string | null;
  /**
   * Currencies that also carry booked outflows in the period and are therefore left out of every figure below.
   */
  otherCurrencies: string[];
  totals: {
    spentMinor: number;
    incomeMinor: number;
    netMinor: number;
    transactionCount: number;
    calendarDays: number;
    activeDays: number;
    averageDailyMinor: number;
    averageActiveDayMinor: number;
    averageTicketMinor: number;
    largestMinor: number;
    largestDate: string | null;
    largestPayee: string | null;
  };
  /**
   * Booked outflows grouped by tag. A movement that carries several tags counts in full under each of them, exactly as the dashboard's spending breakdown does.
   */
  byCategory: {
    tagId: string;
    tagName: string;
    spentMinor: number;
    transactionCount: number;
    averageMinor: number;
    largestMinor: number;
  }[];
  /**
   * Booked outflows of the period that carry no tag at all.
   */
  untagged: {
    spentMinor: number;
    transactionCount: number;
  };
  /**
   * One entry per calendar day of the range, so the heatmap and the cumulative chart keep a continuous axis. `selected` is false for a day whose month the caller left out of a scattered month set, and such a day never carries a figure.
   */
  daily: {
    date: string;
    selected: boolean;
    spentMinor: number;
    transactionCount: number;
  }[];
  /**
   * Booked outflows per seven-day slice of the range, empty slices included, so the bars keep a continuous axis.
   */
  weekly: {
    label: string;
    from: string;
    to: string;
    spentMinor: number;
    transactionCount: number;
  }[];
  byAccount: {
    accountId: string;
    accountName: string;
    spentMinor: number;
    transactionCount: number;
  }[];
  /**
   * Booked outflows by where the row came from: typed by hand, imported from a file, or read from the bank.
   */
  bySource: {
    source: "manual" | "csv-import" | "enable-banking";
    spentMinor: number;
    transactionCount: number;
  }[];
  /**
   * Booked outflows bucketed by their absolute amount. The thresholds are 10, 50, 150 and 500 major units scaled to the currency's own minor units, so a JPY vault bands on whole yen.
   */
  amountBands: {
    key: "under-10" | "10-50" | "50-150" | "150-500" | "over-500";
    label: string;
    lowerMinor: number;
    upperMinor: number | null;
    count: number;
    spentMinor: number;
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

/**
 * User-authored rule that adds tags to matching transactions. Conditions in one rule join with a single AND or OR. An `amount` condition carries a canonical decimal string in its own `currency` (`-5.10` means an outflow of 5.10), not a count of minor units, and only matches transactions in that currency.
 */
export interface TaggingRule {
  formatVersion: 2;
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
 * A transaction. `amountMinor` is signed: inflows positive, outflows negative. `counterpartyIban` is the account on the other side when the bank names it, compacted and uppercased. `transfer` marks a movement that only moves money between the user's own accounts: absent means undecided, a boolean is the user's decision, and `true` keeps the row out of income, expenses and spending.
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
  /**
   * The account on the other side of the movement, compacted and uppercased, when the bank prints it on its own leg. It is what lets transfer pairing compare against the user's own accounts instead of reading the payee.
   */
  counterpartyIban?: string;
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
