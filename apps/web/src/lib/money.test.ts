import { describe, expect, it } from "vitest";
import { formatDecimal, formatMinorToAmount, formatMoney, parseAmountToMinor } from "./money.js";

describe("Italian amount formatting", () => {
  it("groups thousands with a dot and keeps two decimals after a comma", () => {
    expect(formatMinorToAmount(123456, "EUR")).toBe("1.234,56");
    expect(formatMinorToAmount(123_456_789, "EUR")).toBe("1.234.567,89");
    expect(formatMinorToAmount(-186, "EUR")).toBe("-1,86");
    expect(formatMinorToAmount(0, "EUR")).toBe("0,00");
  });

  it("keeps the currency's own number of decimals", () => {
    expect(formatMinorToAmount(1234, "JPY")).toBe("1.234");
    expect(formatMinorToAmount(1234, "BHD")).toBe("1,234");
  });

  it("writes the currency after the amount, and rates with a comma too", () => {
    expect(formatMoney(-142050, "EUR")).toBe("-1.420,50 EUR");
    expect(formatDecimal(12.5)).toBe("12,5");
    expect(formatDecimal(-3.5)).toBe("-3,5");
  });
});

describe("amount parsing", () => {
  it("reads what the app shows", () => {
    expect(parseAmountToMinor("1.234,56", "EUR")).toBe(123456);
    expect(parseAmountToMinor("-15,00", "EUR")).toBe(-1500);
    expect(parseAmountToMinor("1,5", "EUR")).toBe(150);
    expect(parseAmountToMinor("0,01", "EUR")).toBe(1);
  });

  it("still reads an amount pasted from an English statement", () => {
    expect(parseAmountToMinor("1,234.56", "EUR")).toBe(123456);
    expect(parseAmountToMinor("1234.56", "EUR")).toBe(123456);
  });

  it("treats a lone three-digit group as thousands", () => {
    expect(parseAmountToMinor("1.234", "EUR")).toBe(123400);
    expect(parseAmountToMinor("12,345", "EUR")).toBe(1234500);
    expect(parseAmountToMinor("1.234.567", "EUR")).toBe(123456700);
  });

  it("treats three decimals as decimals in a three-decimal currency", () => {
    expect(parseAmountToMinor("1,234", "BHD")).toBe(1234);
    expect(parseAmountToMinor("12,345", "BHD")).toBe(12345);
  });

  it("refuses what it cannot read", () => {
    expect(() => parseAmountToMinor("", "EUR")).toThrow(/not a valid amount/);
    expect(() => parseAmountToMinor("abc", "EUR")).toThrow(/not a valid amount/);
    expect(() => parseAmountToMinor("1,2345", "EUR")).toThrow(/2 decimals/);
  });
});
