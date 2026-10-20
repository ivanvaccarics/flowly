import {
  bankingValidators,
  dashboard,
  expenseDetails,
  vaultStatus,
  type BankingContractName,
} from "./generated/client-validators.js";
import { runValidator, type ValidationResult } from "./validation.js";

export type ClientContractName = "vaultStatus" | "dashboard" | "expenseDetails";

const clientValidators = {
  vaultStatus,
  dashboard,
  expenseDetails,
} as const;

/** Runtime validation limited to the JSON contracts the browser consumes. */
export function validateClientContract(name: ClientContractName, value: unknown): ValidationResult {
  return runValidator(clientValidators[name], value);
}

/** Runtime validation for one of the bank transport shapes. */
export function validateBankingContract(
  name: BankingContractName,
  value: unknown,
): ValidationResult {
  return runValidator(bankingValidators[name], value);
}

export type { BankingContractName, ValidationResult };
