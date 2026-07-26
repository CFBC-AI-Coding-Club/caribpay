import { describe, expect, test } from "bun:test";
import {
  applyRate,
  formatAmount,
  formatMoney,
  formatRate,
  fromMinor,
  groupDigits,
  splitAmount,
  toMinor,
} from "../src/currency";

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

describe("applyRate", () => {
  test("multiplies exactly with half-up rounding", () => {
    expect(applyRate(150000, "58.51851852")).toBe(8777778);
    expect(applyRate(100000, "0.01708861")).toBe(1709);
    expect(applyRate(100, "0.01708861")).toBe(2);
    expect(applyRate(99, "0.005")).toBe(0);
    expect(applyRate(100, "0.005")).toBe(1);
  });

  test("integer rates are exact", () => {
    expect(applyRate(12345, "2")).toBe(24690);
    expect(applyRate(0, "58.51851852")).toBe(0);
  });

  test("handles large JMD-scale amounts without precision loss", () => {
    // 2_500_000_000_000 * 0.01708861 = 42721525000.0 exactly
    expect(applyRate(2_500_000_000_000, "0.01708861")).toBe(42_721_525_000);
  });

  test("rejects invalid input", () => {
    expect(() => applyRate(-1, "2")).toThrow(RangeError);
    expect(() => applyRate(10.5, "2")).toThrow(RangeError);
    expect(() => applyRate(100, "-2")).toThrow(RangeError);
    expect(() => applyRate(100, "abc")).toThrow(RangeError);
    expect(() => applyRate(100, "0")).toThrow(RangeError);
    expect(() => applyRate(Number.MAX_SAFE_INTEGER, "1000000")).toThrow(RangeError);
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

describe("formatAmount", () => {
  test("uses the UI's currency symbols with grouping", () => {
    expect(formatAmount(482050, "XCD")).toBe("EC$4,820.50");
    expect(formatAmount(9_240_000, "JMD")).toBe("J$92,400.00");
    expect(formatAmount(124000, "BBD")).toBe("Bds$1,240.00");
    expect(formatAmount(86000, "USD")).toBe("US$860.00");
  });

  test("groups every three digits, however large", () => {
    expect(formatAmount(123_456_789, "USD")).toBe("US$1,234,567.89");
    expect(formatAmount(100, "USD")).toBe("US$1.00");
    expect(formatAmount(0, "BBD")).toBe("Bds$0.00");
  });

  test("sign: auto marks only negatives", () => {
    expect(formatAmount(-25000, "XCD")).toBe("−EC$250.00");
    expect(formatAmount(25000, "XCD")).toBe("EC$250.00");
  });

  test("sign: always marks credits and debits explicitly", () => {
    expect(formatAmount(30000, "XCD", { sign: "always" })).toBe("+EC$300.00");
    expect(formatAmount(-30000, "XCD", { sign: "always" })).toBe("−EC$300.00");
    expect(formatAmount(0, "XCD", { sign: "always" })).toBe("+EC$0.00");
  });

  test("sign: never formats the magnitude alone", () => {
    expect(formatAmount(-30000, "XCD", { sign: "never" })).toBe("EC$300.00");
  });

  test("can omit the symbol", () => {
    expect(formatAmount(482050, "XCD", { symbol: false })).toBe("4,820.50");
  });
});

describe("splitAmount", () => {
  test("splits into symbol, dollars, and cents for the hero card", () => {
    expect(splitAmount(1_041_560, "XCD")).toEqual({
      symbol: "EC$",
      whole: "10,415",
      fraction: ".60",
    });
  });

  test("uses the magnitude, leaving direction to the caller", () => {
    expect(splitAmount(-1_041_560, "XCD").whole).toBe("10,415");
  });

  test("reassembles into formatAmount's output", () => {
    const parts = splitAmount(482050, "XCD");
    expect(`${parts.symbol}${parts.whole}${parts.fraction}`).toBe(formatAmount(482050, "XCD"));
  });
});

describe("formatRate", () => {
  test("renders a rate line with both symbols", () => {
    expect(formatRate("57.78000000", "XCD", "JMD")).toBe("1 EC$ = 57.78 J$");
  });

  test("pads rather than trims, so a peg reads 2.70 not 2.7", () => {
    expect(formatRate("2.70000000", "USD", "XCD")).toBe("1 US$ = 2.70 EC$");
    expect(formatRate("2", "USD", "XCD")).toBe("1 US$ = 2.00 EC$");
  });

  test("sub-unit rates keep enough decimals to stay useful", () => {
    expect(formatRate("0.37037037", "XCD", "USD")).toBe("1 EC$ = 0.3703 US$");
  });

  test("groups large rates", () => {
    expect(formatRate("1234.5", "USD", "JMD")).toBe("1 US$ = 1,234.50 J$");
  });

  test("never parses the rate as a float", () => {
    // 8-dp rates are beyond float-safe territory; the digits must survive verbatim.
    expect(formatRate("58.51851852", "XCD", "JMD", 8)).toBe("1 EC$ = 58.51851852 J$");
  });
});

describe("groupDigits", () => {
  test("groups a typed amount as it is entered", () => {
    expect(groupDigits("25000")).toBe("25,000");
    expect(groupDigits("1500")).toBe("1,500");
    expect(groupDigits("250")).toBe("250");
    expect(groupDigits("0")).toBe("0");
  });

  test("preserves a trailing decimal point mid-keystroke", () => {
    expect(groupDigits("25000.")).toBe("25,000.");
  });

  test("keeps partial cents exactly as typed", () => {
    expect(groupDigits("25000.5")).toBe("25,000.5");
    expect(groupDigits("25000.50")).toBe("25,000.50");
  });

  test("matches formatAmount's grouping, so the figure does not change on review", () => {
    expect(`EC$${groupDigits("25000.50")}`).toBe(formatAmount(2500050, "XCD"));
  });
});
