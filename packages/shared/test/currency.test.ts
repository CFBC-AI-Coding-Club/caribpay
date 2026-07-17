import { describe, expect, test } from "bun:test";
import { formatMoney, fromMinor, toMinor } from "../src/currency";

describe("toMinor", () => {
  test("parses decimal strings exactly", () => {
    expect(toMinor("1500.50", "XCD")).toBe(150050);
    expect(toMinor("0.01", "USD")).toBe(1);
    expect(toMinor("0.10", "USD")).toBe(10);
    expect(toMinor("123.4", "TTD")).toBe(12340);
  });

  test("accepts whole amounts with no decimal point", () => {
    expect(toMinor("1500", "XCD")).toBe(150000);
    expect(toMinor(25, "USD")).toBe(2500);
    expect(toMinor(0, "JMD")).toBe(0);
  });

  test("rounds half-up beyond the currency exponent", () => {
    expect(toMinor("1.014", "USD")).toBe(101);
    expect(toMinor("1.015", "USD")).toBe(102);
    expect(toMinor("1.0149999", "USD")).toBe(101);
    expect(toMinor("0.005", "USD")).toBe(1);
    expect(toMinor("0.004", "USD")).toBe(0);
  });

  test("rounds negative amounts away from zero", () => {
    expect(toMinor("-10.50", "USD")).toBe(-1050);
    expect(toMinor("-1.015", "USD")).toBe(-102);
    expect(toMinor("-1.014", "USD")).toBe(-101);
  });

  test("JMD large amounts stay exact", () => {
    expect(toMinor("25000000000.00", "JMD")).toBe(2_500_000_000_000);
    expect(toMinor("9007199254740.91", "JMD")).toBe(900_719_925_474_091);
  });

  test("rejects malformed input", () => {
    expect(() => toMinor("abc", "USD")).toThrow(RangeError);
    expect(() => toMinor("1,500.00", "USD")).toThrow(RangeError);
    expect(() => toMinor("", "USD")).toThrow(RangeError);
    expect(() => toMinor("1.5e3", "USD")).toThrow(RangeError);
    expect(() => toMinor(Number.NaN, "USD")).toThrow(RangeError);
    expect(() => toMinor(Number.POSITIVE_INFINITY, "USD")).toThrow(RangeError);
  });

  test("rejects amounts beyond the safe integer range", () => {
    expect(() => toMinor("99999999999999999999", "USD")).toThrow(RangeError);
  });
});

describe("fromMinor", () => {
  test("renders exact decimal strings", () => {
    expect(fromMinor(150050, "XCD")).toBe("1500.50");
    expect(fromMinor(5, "USD")).toBe("0.05");
    expect(fromMinor(0, "JMD")).toBe("0.00");
    expect(fromMinor(-1050, "USD")).toBe("-10.50");
  });

  test("round-trips with toMinor", () => {
    for (const value of ["0.00", "0.01", "1500.50", "2500000000.00", "-99.99"]) {
      expect(fromMinor(toMinor(value, "JMD"), "JMD")).toBe(value);
    }
  });

  test("rejects non-integer input", () => {
    expect(() => fromMinor(10.5, "USD")).toThrow(RangeError);
    expect(() => fromMinor(Number.NaN, "USD")).toThrow(RangeError);
  });
});

describe("formatMoney", () => {
  test("formats with grouping and two decimals", () => {
    expect(formatMoney(150050, "XCD")).toContain("1,500.50");
    expect(formatMoney(2500, "USD")).toBe("$25.00");
  });

  test("formats large JMD amounts", () => {
    expect(formatMoney(2_500_000_000_000, "JMD")).toContain("25,000,000,000.00");
  });

  test("formats negative amounts", () => {
    expect(formatMoney(-2500, "USD")).toContain("25.00");
    expect(formatMoney(-2500, "USD")).toMatch(/[-(]/);
  });
});
