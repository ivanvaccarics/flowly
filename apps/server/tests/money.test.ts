import { describe, expect, it } from "vitest";
import { DomainError } from "../src/domain/errors.js";
import {
  SUPPORTED_CURRENCIES,
  currencyInfo,
  formatMinorToAmount,
  formatMoney,
  parseAmountToMinor,
} from "../src/domain/money.js";
import { readGolden } from "./helpers/golden.js";

interface MoneyGolden {
  valid: Array<{ amount: string; currency: string; minor: number; formatted: string }>;
  invalid: Array<{ amount: string; currency: string; reason: string }>;
}

const golden = readGolden<MoneyGolden>("money-minor-units");

describe("money", () => {
  it("parses and formats every golden vector", () => {
    expect(golden.valid.length).toBeGreaterThan(0);
    for (const vector of golden.valid) {
      expect(parseAmountToMinor(vector.amount, vector.currency), vector.amount).toBe(vector.minor);
      expect(formatMinorToAmount(vector.minor, vector.currency), vector.amount).toBe(
        vector.formatted,
      );
    }
  });

  it("rejects every invalid vector", () => {
    expect(golden.invalid.length).toBeGreaterThan(0);
    for (const vector of golden.invalid) {
      expect(
        () => parseAmountToMinor(vector.amount, vector.currency),
        `${vector.amount} ${vector.currency}`,
      ).toThrow(DomainError);
    }
  });

  it("never uses floating point rounding", () => {
    expect(parseAmountToMinor("0.07", "EUR")).toBe(7);
    expect(parseAmountToMinor("0.1", "EUR") + parseAmountToMinor("0.2", "EUR")).toBe(30);
    expect(formatMinorToAmount(30, "EUR")).toBe("0.30");
  });

  it("reports currency metadata and formatted money", () => {
    expect(currencyInfo("JPY").minorUnits).toBe(0);
    expect(currencyInfo("KWD").minorUnits).toBe(3);
    expect(formatMoney(-1230, "EUR")).toBe("-12.30 EUR");
    expect(SUPPORTED_CURRENCIES.map((currency) => currency.code)).toContain("EUR");
  });
});
