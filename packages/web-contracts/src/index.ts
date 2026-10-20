import { contractKeys, schemaIndex, type ContractKey } from "./generated/schemas.js";
import {
  bankingValidators,
  contractValidators,
  type BankingContractName,
} from "./generated/validators.js";
import { runValidator, type ValidationResult } from "./validation.js";

export * from "./dates.js";
export * from "./generated/schemas.js";
export type * from "./generated/types.js";

/** Runtime validation. Generated types never replace this check. */
export function validateContract(key: ContractKey, value: unknown): ValidationResult {
  return runValidator(contractValidators[key], value);
}

/** Runtime validation for one of the bank transport shapes. */
export function validateBankingContract(
  name: BankingContractName,
  value: unknown,
): ValidationResult {
  return runValidator(bankingValidators[name], value);
}

export type { BankingContractName, ValidationResult };
export { contractKeys, schemaIndex };
