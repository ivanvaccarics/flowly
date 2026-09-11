export type AccountType =
  | "checking"
  | "savings"
  | "credit-card"
  | "cash"
  | "wallet"
  | "investment"
  | "other";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  defaultCurrency: string;
  institutionName?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type TransactionStatus = "pending" | "booked";
export type TransactionSource = "manual" | "csv-import" | "recurring-rule" | "enable-banking";

export interface Transaction {
  id: string;
  accountId: string;
  bookingDate: string;
  valueDate?: string;
  amountMinor: number;
  currency: string;
  payee?: string;
  description?: string;
  userNote?: string;
  status: TransactionStatus;
  source: TransactionSource;
  tagIds: string[];
  provider?: string;
  providerTransactionId?: string;
  importFingerprint?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  name: string;
  normalizedName: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
}

export type RuleConditionField = "userNote" | "description" | "payee" | "amountMinor" | "accountId";
export type RuleConditionOperator =
  | "contains"
  | "is"
  | "greaterThan"
  | "lessThan"
  | "equals";

export interface RuleCondition {
  field: RuleConditionField;
  operator: RuleConditionOperator;
  value: string | number;
  currency?: string;
}

export interface TaggingRule {
  id: string;
  name: string;
  enabled: boolean;
  combinator: "and" | "or";
  conditions: RuleCondition[];
  tagIds: string[];
  createdAt: string;
  updatedAt: string;
}
